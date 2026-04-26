import CustomerAccount from '../models/Customer.js';
import ProductDetail from '../models/ProductDetail.js';
import RentalDetail from '../models/RentalDetail.js';
import AdminAction from '../models/AdminAction.js';
import { sendNotificationEmail } from '../services/emailService.js';
import { toPublicUrl } from '../utils/media.js';
import { isElevatedRole } from '../utils/roles.js';

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const RENTAL_REFERENCE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const NON_ACTIVE_RENTAL_STATUSES = ['cancelled', 'completed'];
const RENTAL_AVAILABILITY_WINDOW_DAYS = 365;
const EXPIRED_PENDING_RENTAL_REASON = 'Rental request was not approved in time.';

function buildAdminName(email) {
  const prefix = String(email || '').split('@')[0] || 'Admin';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Admin';
}

async function logAdminAction(req, payload) {
  try {
    await AdminAction.create({
      adminId: String(req.user?.id || ''),
      adminEmail: String(req.user?.email || ''),
      adminLabel: buildAdminName(req.user?.email || ''),
      action: payload.action,
      targetUserId: payload.targetUserId || '',
      targetRole: payload.targetRole || '',
      details: payload.details || null,
    });
  } catch (error) {
    console.error('rental logAdminAction error:', error);
  }
}

function toDateOnly(dateInput) {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function buildFallbackReferenceId(sourceId) {
  return String(sourceId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(-7)
    .padStart(7, '0');
}

function createRandomReferenceId() {
  let result = '';
  for (let i = 0; i < 7; i += 1) {
    const index = Math.floor(Math.random() * RENTAL_REFERENCE_CHARACTERS.length);
    result += RENTAL_REFERENCE_CHARACTERS[index];
  }
  return result;
}

async function generateRentalReferenceId() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = createRandomReferenceId();
    const exists = await RentalDetail.exists({ referenceId: candidate });
    if (!exists) {
      return candidate;
    }
  }

  // Final fallback if random generation repeatedly collides.
  return createRandomReferenceId();
}

async function countActiveRentalsForProduct(productId, excludedRentalId = null) {
  const query = {
    productId,
    status: { $nin: NON_ACTIVE_RENTAL_STATUSES },
  };

  if (excludedRentalId) {
    query._id = { $ne: excludedRentalId };
  }

  return RentalDetail.countDocuments(query);
}

async function countOverlappingActiveRentalsForProduct(productId, rangeStart, rangeEnd, excludedRentalId = null) {
  const query = {
    productId,
    status: { $nin: NON_ACTIVE_RENTAL_STATUSES },
    startDate: { $lte: rangeEnd },
    endDate: { $gte: rangeStart },
  };

  if (excludedRentalId) {
    query._id = { $ne: excludedRentalId };
  }

  return RentalDetail.countDocuments(query);
}

function formatDateOnly(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : null;
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(startDate.getTime());

  while (cursor <= endDate) {
    dates.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function getUnavailableDatesForProduct(productId, rangeStart, rangeEnd) {
  const overlappingRentals = await RentalDetail.find({
    productId,
    status: { $nin: NON_ACTIVE_RENTAL_STATUSES },
    startDate: { $lte: rangeEnd },
    endDate: { $gte: rangeStart },
  })
    .select('startDate endDate')
    .lean();

  const unavailableDates = new Set();

  overlappingRentals.forEach((rental) => {
    const rentalStart = toDateOnly(rental.startDate);
    const rentalEnd = toDateOnly(rental.endDate);
    if (!rentalStart || !rentalEnd) {
      return;
    }

    const effectiveStart = rentalStart > rangeStart ? rentalStart : rangeStart;
    const effectiveEnd = rentalEnd < rangeEnd ? rentalEnd : rangeEnd;

    buildDateRange(effectiveStart, effectiveEnd).forEach((date) => {
      unavailableDates.add(formatDateOnly(date));
    });
  });

  return Array.from(unavailableDates)
    .filter(Boolean)
    .sort();
}

async function syncProductAvailabilityByCapacity(productId) {
  const product = await ProductDetail.findById(productId);
  if (!product || product.status === 'archived' || product.status === 'maintenance') {
    return;
  }

  const activeRentalsCount = await countActiveRentalsForProduct(product._id);
  const nextStatus = activeRentalsCount === 0 ? 'available' : 'rented';

  if (product.status !== nextStatus) {
    product.status = nextStatus;
    await product.save();
  }
}

async function cancelExpiredPendingRentals() {
  const today = toDateOnly(new Date());
  if (!today) {
    return;
  }

  const stalePendingRentals = await RentalDetail.find({
    status: 'pending',
    startDate: { $lt: today },
  })
    .select('_id productId')
    .lean();

  if (stalePendingRentals.length === 0) {
    return;
  }

  const staleRentalIds = stalePendingRentals.map((rental) => rental._id);

  await RentalDetail.updateMany(
    { _id: { $in: staleRentalIds } },
    {
      $set: {
        status: 'cancelled',
        rejectionReason: EXPIRED_PENDING_RENTAL_REASON,
        rejectedAt: new Date(),
      },
    },
  );

  const affectedProductIds = Array.from(
    new Set(stalePendingRentals.map((rental) => String(rental.productId || '')).filter(Boolean)),
  );

  await Promise.all(affectedProductIds.map((productId) => syncProductAvailabilityByCapacity(productId)));
}

function mapRental(req, doc) {
  const sourceId = doc._id || doc.id;
  return {
    ...doc,
    referenceId: doc.referenceId || buildFallbackReferenceId(sourceId),
    startDate: doc.startDate ? new Date(doc.startDate).toISOString().slice(0, 10) : null,
    endDate: doc.endDate ? new Date(doc.endDate).toISOString().slice(0, 10) : null,
    paymentSubmittedAt: doc.paymentSubmittedAt ? new Date(doc.paymentSubmittedAt).toISOString() : null,
    pickupScheduleDate: doc.pickupScheduleDate ? new Date(doc.pickupScheduleDate).toISOString().slice(0, 10) : null,
    paymentReceiptUrl: toPublicUrl(req, doc.paymentReceiptUrl),
  };
}

export async function scheduleRentalPickup(req, res) {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can schedule pickup.' });
    }

    const { id } = req.params;
    const pickupDateInput = toDateOnly(req.body?.pickupDate);
    const pickupTime = String(req.body?.pickupTime || '').trim();
    const allowedTimes = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

    if (!allowedTimes.includes(pickupTime)) {
      return res.status(400).json({ message: 'Pickup time must be between 8:00 AM and 5:00 PM.' });
    }

    const rental = await RentalDetail.findOne({ _id: id, customerId: req.user.id });
    if (!rental) {
      return res.status(404).json({ message: 'Rental not found.' });
    }

    if (!['paid_for_confirmation', 'for_pickup'].includes(rental.status)) {
      return res.status(400).json({ message: 'Pickup can only be scheduled after payment confirmation.' });
    }

    const fixedPickupDate = toDateOnly(rental.startDate);
    if (!fixedPickupDate) {
      return res.status(400).json({ message: 'Rental start date is invalid for pickup scheduling.' });
    }

    if (pickupDateInput && pickupDateInput.getTime() !== fixedPickupDate.getTime()) {
      return res.status(400).json({ message: 'Pickup date must match the rental start date.' });
    }

    rental.pickupScheduleDate = fixedPickupDate;
    rental.pickupScheduleTime = pickupTime;
    rental.status = 'for_pickup';
    await rental.save();

    return res.json({ rental: mapRental(req, rental.toJSON()) });
  } catch (error) {
    console.error('scheduleRentalPickup error:', error);
    return res.status(500).json({ message: 'Failed to schedule pickup.' });
  }
}

export async function submitRentalPayment(req, res) {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can submit rental payments.' });
    }

    const { id } = req.params;
    const referenceId = String(req.body?.referenceId || '').trim().toUpperCase();

    if (!referenceId) {
      return res.status(400).json({ message: 'Reference ID is required.' });
    }

    if (!/^[A-Z0-9]+$/.test(referenceId)) {
      return res.status(400).json({ message: 'Reference ID must contain only letters and numbers.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Payment receipt image is required.' });
    }

    const rental = await RentalDetail.findOne({ _id: id, customerId: req.user.id });

    if (!rental) {
      return res.status(404).json({ message: 'Rental not found.' });
    }

    if (rental.status !== 'for_payment') {
      return res.status(400).json({ message: `Payment cannot be submitted while rental is ${rental.status}.` });
    }

    const paymentAmount = Math.max(0, Number(rental.totalPrice || 0) - Number(rental.downpayment || 0));

    rental.paymentSubmittedAt = new Date();
    rental.paymentAmountPaid = paymentAmount;
    rental.paymentReferenceNumber = referenceId;
    rental.paymentReceiptFilename = req.file.filename;
    rental.paymentReceiptUrl = toPublicUrl(req, `/uploads/${req.file.filename}`);
    rental.status = 'paid_for_confirmation';

    await rental.save();

    try {
      const deliveryResult = await sendNotificationEmail({
        email: rental.customerEmail || rental.email || '',
        type: 'rental',
        status: rental.status,
        name: rental.customerName || '',
        itemOrServiceOrDesign: rental.gownName || 'Rental Item',
        location: rental.branch || '',
      });

      if (!deliveryResult?.delivered) {
        console.warn('rental payment notification not delivered:', deliveryResult);
      }
    } catch (notificationError) {
      console.error('rental payment notification error:', notificationError);
    }

    return res.json({ rental: mapRental(req, rental.toJSON()) });
  } catch (error) {
    console.error('submitRentalPayment error:', error);
    return res.status(500).json({ message: 'Failed to submit payment.' });
  }
}

export async function createRental(req, res) {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can submit rentals.' });
    }

    await cancelExpiredPendingRentals();

    const { gownId, startDate, endDate, branch, eventType } = req.body || {};

    if (!gownId || !startDate || !endDate || !branch || !eventType) {
      return res.status(400).json({
        message: 'Missing required fields: gownId, startDate, endDate, branch, eventType',
      });
    }

    const [customer, product] = await Promise.all([
      CustomerAccount.findById(req.user.id),
      ProductDetail.findById(gownId),
    ]);

    if (!customer) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    if (!product || product.status === 'archived') {
      return res.status(404).json({ message: 'Selected gown not found.' });
    }

    if (product.status === 'maintenance') {
      return res.status(409).json({ message: 'Selected gown is currently under maintenance.' });
    }

    const start = toDateOnly(startDate);
    const end = toDateOnly(endDate);
    if (!start || !end) {
      return res.status(400).json({ message: 'Invalid rental dates.' });
    }

    if (end <= start) {
      return res.status(400).json({ message: 'End date must be after start date.' });
    }

    const overlappingRentalsCount = await countOverlappingActiveRentalsForProduct(product._id, start, end);
    if (overlappingRentalsCount > 0) {
      return res.status(409).json({ message: 'Selected gown is unavailable for the chosen rental dates.' });
    }

    const durationDays = Math.floor((end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY) + 1;
    const totalPrice = Number(product.price || 0) * durationDays;
    const downpayment = totalPrice / 2;

    const rental = await RentalDetail.create({
      customerId: customer._id,
      customerEmail: customer.email,
      customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      contactNumber: customer.phoneNumber || '',
      email: customer.email,
      productId: product._id,
      gownName: product.name,
      sku: product.sku,
      referenceId: await generateRentalReferenceId(),
      startDate: start,
      endDate: end,
      branch: String(branch).trim(),
      eventType: String(eventType).trim(),
      status: 'pending',
      totalPrice,
      downpayment,
    });

    product.lastRented = new Date();
    await product.save();
    await syncProductAvailabilityByCapacity(product._id);

    return res.status(201).json({ rental: mapRental(req, rental.toJSON()) });
  } catch (error) {
    console.error('createRental error:', error);
    return res.status(500).json({ message: 'Failed to submit rental request.' });
  }
}

export async function getMyRentals(req, res) {
  try {
    await cancelExpiredPendingRentals();

    const rentals = await RentalDetail.find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = rentals
      .map(({ _id, __v, ...rest }) => ({ id: _id, ...rest }))
      .map((row) => mapRental(req, row));

    return res.json({ rentals: mapped });
  } catch (error) {
    console.error('getMyRentals error:', error);
    return res.status(500).json({ message: 'Failed to fetch rentals.' });
  }
}

export async function updateRentalStatus(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status } = req.body;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    const allowed = ['for_payment', 'paid_for_confirmation', 'for_pickup', 'active', 'cancelled', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    const rental = await RentalDetail.findById(id);

    if (!rental) {
      return res.status(404).json({ message: 'Rental not found.' });
    }

    const allowedTransitions = {
      pending: ['for_payment', 'cancelled'],
      for_payment: ['paid_for_confirmation', 'cancelled'],
      paid_for_confirmation: ['for_pickup', 'cancelled'],
      for_pickup: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const next = allowedTransitions[rental.status] || [];
    if (!next.includes(status)) {
      return res.status(400).json({
        message: `Cannot move rental from ${rental.status} to ${status}.`,
      });
    }

    const requiresRejectionReason =
      status === 'cancelled' && ['pending', 'for_payment', 'paid_for_confirmation'].includes(rental.status);

    if (requiresRejectionReason && !reason) {
      return res.status(400).json({ message: 'Rejection reason is required.' });
    }

    const previousStatus = rental.status;
    rental.status = status;
    if (status === 'cancelled') {
      rental.rejectionReason = reason || rental.rejectionReason || null;
      rental.rejectedAt = new Date();
    }

    await rental.save();
    await syncProductAvailabilityByCapacity(rental.productId);

    try {
      await sendNotificationEmail({
        email: rental.customerEmail || rental.email || '',
        type: 'rental',
        status,
        name: rental.customerName || '',
        itemOrServiceOrDesign: rental.gownName || 'Rental Item',
        date: rental.pickupScheduleDate
          ? new Date(rental.pickupScheduleDate).toISOString().slice(0, 10)
          : '',
        time: rental.pickupScheduleTime || '',
        location: rental.branch || '',
      });
    } catch (notificationError) {
      console.error('rental status notification error:', notificationError);
    }

    const normalizedReferenceId = String(rental.referenceId || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    await logAdminAction(req, {
      action: 'rental_status_updated',
      targetUserId: String(rental.customerId || rental.customerEmail || ''),
      targetRole: 'Customer',
      details: {
        rentalId: String(rental._id),
        rentalReferenceId: normalizedReferenceId.length === 7 ? normalizedReferenceId : '',
        gownName: rental.gownName || '',
        customerName: rental.customerName || '',
        previousStatus,
        newStatus: status,
        reason: reason || '',
        pickupScheduleDate: rental.pickupScheduleDate
          ? new Date(rental.pickupScheduleDate).toISOString().slice(0, 10)
          : null,
        pickupScheduleTime: rental.pickupScheduleTime || null,
      },
    });

    return res.json({ rental: mapRental(req, rental.toJSON()) });
  } catch (error) {
    console.error('updateRentalStatus error:', error);
    return res.status(500).json({ message: 'Failed to update rental status.' });
  }
}

export async function getAdminRentals(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    await cancelExpiredPendingRentals();

    const rentals = await RentalDetail.find({})
      .sort({ createdAt: -1 })
      .lean();

    const mapped = rentals
      .map(({ _id, __v, ...rest }) => ({ id: _id, ...rest }))
      .map((row) => mapRental(req, row));

    return res.json({ rentals: mapped });
  } catch (error) {
    console.error('getAdminRentals error:', error);
    return res.status(500).json({ message: 'Failed to fetch admin rentals.' });
  }
}

export async function getRentalAvailability(req, res) {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can check rental availability.' });
    }

    await cancelExpiredPendingRentals();

    const gownId = String(req.query?.gownId || '').trim();
    const requestedStart = typeof req.query?.startDate === 'string' ? req.query.startDate : '';
    const requestedEnd = typeof req.query?.endDate === 'string' ? req.query.endDate : '';

    if (!gownId) {
      return res.status(400).json({ message: 'gownId is required.' });
    }

    const today = toDateOnly(new Date());
    const fallbackStart = today ? new Date(today.getTime()) : new Date();
    const fallbackEnd = new Date(fallbackStart.getTime());
    fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + RENTAL_AVAILABILITY_WINDOW_DAYS);

    const rangeStart = toDateOnly(requestedStart) || fallbackStart;
    const rangeEnd = toDateOnly(requestedEnd) || fallbackEnd;

    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
      return res.status(400).json({ message: 'Invalid availability date range.' });
    }

    const product = await ProductDetail.findById(gownId).select('_id status').lean();
    if (!product || product.status === 'archived') {
      return res.status(404).json({ message: 'Selected gown not found.' });
    }

    if (product.status === 'maintenance') {
      return res.status(409).json({ message: 'Selected gown is currently under maintenance.' });
    }

    const unavailableDates = await getUnavailableDatesForProduct(product._id, rangeStart, rangeEnd);

    return res.json({
      unavailableDates,
      startDate: formatDateOnly(rangeStart),
      endDate: formatDateOnly(rangeEnd),
    });
  } catch (error) {
    console.error('getRentalAvailability error:', error);
    return res.status(500).json({ message: 'Failed to load rental availability.' });
  }
}
