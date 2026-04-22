import CustomOrder from '../models/CustomOrder.js';
import CustomerAccount from '../models/Customer.js';
import AdminAction from '../models/AdminAction.js';
import { storeUploadedImage } from '../services/mediaStorageService.js';
import { isElevatedRole } from '../utils/roles.js';

const CUSTOM_ORDER_STATUSES = ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed', 'rejected'];
const CUSTOM_ORDER_REFERENCE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

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
    console.error('customOrder logAdminAction error:', error);
  }
}

function buildFallbackCustomOrderReferenceId(sourceId) {
  return String(sourceId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(-7)
    .padStart(7, '0');
}

function createRandomCustomOrderReferenceId() {
  let result = '';
  for (let index = 0; index < 7; index += 1) {
    const nextIndex = Math.floor(Math.random() * CUSTOM_ORDER_REFERENCE_CHARACTERS.length);
    result += CUSTOM_ORDER_REFERENCE_CHARACTERS[nextIndex];
  }
  return result;
}

async function generateCustomOrderReferenceId() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = createRandomCustomOrderReferenceId();
    const exists = await CustomOrder.exists({ referenceId: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return createRandomCustomOrderReferenceId();
}

function mapCustomOrder(doc) {
  const source = typeof doc?.toJSON === 'function' ? doc.toJSON() : doc;
  const sourceId = String(source?._id || source?.id || '');
  return {
    ...source,
    id: sourceId,
    referenceId: source?.referenceId || buildFallbackCustomOrderReferenceId(sourceId),
  };
}

function validateScheduledDateTime(scheduleDate, scheduleTime, label) {
  const allowedTimes = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    return `A valid ${label.toLowerCase()} date is required.`;
  }

  if (!allowedTimes.includes(scheduleTime)) {
    return `${label} time must be between 8:00 AM and 5:00 PM.`;
  }

  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const requestedDate = new Date(`${scheduleDate}T00:00:00.000Z`);
  if (Number.isNaN(requestedDate.getTime()) || requestedDate < tomorrowDate) {
    return `${label} date must be at least one day after today.`;
  }

  return null;
}

async function updateCustomOrderVisitSchedule(req, res, config) {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { id } = req.params;
    const scheduleDate = String(req.body?.[config.dateField] || '').trim();
    const scheduleTime = String(req.body?.[config.timeField] || '').trim();
    const scheduleReason = String(req.body?.[config.reasonField] || '').trim();

    const validationMessage = validateScheduledDateTime(scheduleDate, scheduleTime, config.label);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const order = await CustomOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Custom order not found.' });
    }

    if (String(order.customerId || '') !== userId) {
      return res.status(403).json({ message: 'You can only update your own custom orders.' });
    }

    if (String(order.status || '').trim().toLowerCase() !== config.requiredStatus) {
      return res.status(400).json({ message: `${config.label} schedule can only be set during ${config.statusLabel}.` });
    }

    const existingDate = String(order[config.dateField] || '').trim();
    const existingTime = String(order[config.timeField] || '').trim();
    const hadExistingSchedule = Boolean(existingDate || existingTime);
    const isScheduleChanging = existingDate !== scheduleDate || existingTime !== scheduleTime;

    if (hadExistingSchedule && !isScheduleChanging) {
      return res.status(400).json({ message: `Please choose a different date or time for your ${config.label.toLowerCase()}.` });
    }

    if (hadExistingSchedule && isScheduleChanging && !scheduleReason) {
      return res.status(400).json({ message: `A reason is required when rescheduling your ${config.label.toLowerCase()}.` });
    }

    order[config.dateField] = scheduleDate;
    order[config.timeField] = scheduleTime;
    order[config.reasonField] = hadExistingSchedule && isScheduleChanging
      ? scheduleReason
      : order[config.reasonField] || null;
    order.updatedAt = new Date();
    await order.save();

    return res.json({ order: mapCustomOrder(order) });
  } catch (error) {
    return res.status(500).json({ message: error.message || `Failed to save ${config.label.toLowerCase()} schedule.` });
  }
}

export const getAllCustomOrders = async (req, res) => {
  try {
    if (!req.user || !isElevatedRole(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'Forbidden: Admin or staff only.' });
    }

    const orders = await CustomOrder.find({}).sort({ createdAt: -1 }).lean();
    res.json(orders.map(mapCustomOrder));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const uploadDesignImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded.' });
    }

    const result = await storeUploadedImage(req.file, { folder: 'custom_orders/design_inspiration' });
    res.json({ url: result.url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createCustomOrder = async (req, res) => {
  try {
    const user = req.user;
    const {
      orderType,
      eventDate,
      preferredColors,
      fabricPreference,
      specialRequests,
      budget,
      branch,
      designImageUrl
    } = req.body;

    const customer = await CustomerAccount.findById(user.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const customOrder = new CustomOrder({
      customerId: customer._id,
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      contactNumber: customer.phoneNumber || '',
      email: customer.email,
      orderType,
      eventDate,
      preferredColors,
      fabricPreference,
      specialRequests,
      budget,
      branch,
      referenceId: await generateCustomOrderReferenceId(),
      designImageUrl
    });

    await customOrder.save();
    res.status(201).json(mapCustomOrder(customOrder));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyCustomOrders = async (req, res) => {
  try {
    const user = req.user;
    const orders = await CustomOrder.find({ customerId: user.id }).sort({ createdAt: -1 }).lean();
    res.json(orders.map(mapCustomOrder));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCustomOrderConsultationSchedule = async (req, res) => {
  return updateCustomOrderVisitSchedule(req, res, {
    label: 'Consultation',
    statusLabel: 'design approval',
    requiredStatus: 'design-approval',
    dateField: 'consultationDate',
    timeField: 'consultationTime',
    reasonField: 'consultationRescheduleReason',
  });
};

export const updateCustomOrderFittingSchedule = async (req, res) => {
  return updateCustomOrderVisitSchedule(req, res, {
    label: 'Fitting',
    statusLabel: 'fitting appointment',
    requiredStatus: 'fitting',
    dateField: 'fittingDate',
    timeField: 'fittingTime',
    reasonField: 'fittingRescheduleReason',
  });
};

export const updateCustomOrderStatus = async (req, res) => {
  try {
    if (!req.user || !isElevatedRole(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'Forbidden: Admin or staff only.' });
    }

    const { id } = req.params;
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();

    if (!CUSTOM_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid custom order status.' });
    }

    if (nextStatus === 'rejected' && !reason) {
      return res.status(400).json({ message: 'Rejection reason is required.' });
    }

    const order = await CustomOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Custom order not found.' });
    }

    const previousStatus = String(order.status || '').trim().toLowerCase();
    if (previousStatus === 'design-approval' && nextStatus === 'in-progress') {
      const consultationDate = String(order.consultationDate || '').trim();
      const todayDate = new Date().toISOString().slice(0, 10);

      if (!consultationDate) {
        return res.status(400).json({ message: 'Customer consultation schedule is required before moving to In Progress.' });
      }

      if (consultationDate > todayDate) {
        return res.status(400).json({ message: 'This custom order can only move to In Progress on or after the scheduled consultation date.' });
      }
    }

    if (previousStatus === 'fitting' && nextStatus === 'completed') {
      const fittingDate = String(order.fittingDate || '').trim();
      const todayDate = new Date().toISOString().slice(0, 10);

      if (!fittingDate) {
        return res.status(400).json({ message: 'Customer fitting schedule is required before marking this custom order as completed.' });
      }

      if (fittingDate > todayDate) {
        return res.status(400).json({ message: 'This custom order can only be marked as completed on or after the scheduled fitting date.' });
      }
    }

    order.status = nextStatus;
    order.rejectionReason = nextStatus === 'rejected' ? reason : null;
    order.updatedAt = new Date();
    await order.save();

    await logAdminAction(req, {
      action: 'custom_order_status_updated',
      targetUserId: String(order.customerId || order.email || ''),
      targetRole: 'Customer',
      details: {
        customOrderId: String(order._id),
        customOrderReferenceId: order.referenceId || buildFallbackCustomOrderReferenceId(order._id),
        customerName: order.customerName || '',
        email: order.email || '',
        orderType: order.orderType || '',
        branch: order.branch || '',
        eventDate: order.eventDate || '',
        consultationDate: order.consultationDate || '',
        consultationTime: order.consultationTime || '',
        previousStatus,
        newStatus: nextStatus,
        reason: order.rejectionReason || '',
      },
    });

    res.json({ order: mapCustomOrder(order) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
