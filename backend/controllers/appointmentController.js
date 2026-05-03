import AppointmentDetail from '../models/AppointmentDetail.js';
import CustomerAccount from '../models/Customer.js';
import ProductDetail from '../models/ProductDetail.js';
import AdminAction from '../models/AdminAction.js';
import { sendNotificationAcrossChannels } from '../services/messageDeliveryService.js';
import { isElevatedRole } from '../utils/roles.js';

const APPOINTMENT_REFERENCE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
    console.error('appointment logAdminAction error:', error);
  }
}

function toDateOnly(dateInput) {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function buildFallbackAppointmentReferenceId(sourceId) {
  return String(sourceId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(-7)
    .padStart(7, '0');
}

function createRandomAppointmentReferenceId() {
  let result = '';
  for (let index = 0; index < 7; index += 1) {
    const nextIndex = Math.floor(Math.random() * APPOINTMENT_REFERENCE_CHARACTERS.length);
    result += APPOINTMENT_REFERENCE_CHARACTERS[nextIndex];
  }
  return result;
}

async function generateAppointmentReferenceId() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = createRandomAppointmentReferenceId();
    const exists = await AppointmentDetail.exists({ referenceId: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return createRandomAppointmentReferenceId();
}

function mapAppointment(doc) {
  const source = typeof doc?.toJSON === 'function' ? doc.toJSON() : doc;
  const sourceId = String(source?._id || source?.id || '');
  return {
    ...source,
    id: sourceId,
    referenceId: source?.referenceId || buildFallbackAppointmentReferenceId(sourceId),
    date: source?.date ? new Date(source.date).toISOString().slice(0, 10) : null,
  };
}

function getAppointmentServiceLabel(appointment) {
  const type = String(appointment.type || '').trim().toLowerCase();
  if (type === 'fitting') {
    const gownName = String(appointment.selectedGownName || '').trim();
    return gownName ? `Gown Fitting - ${gownName}` : 'Gown Fitting';
  }
  if (type === 'consultation') return 'Design Consultation';
  if (type === 'measurement') return 'Measurement Session';
  if (type === 'pickup') return 'Pickup Appointment';
  return 'Appointment Service';
}

async function findAppointmentConflict({ date, time, branch, excludeId }) {
  const query = {
    date,
    time: String(time || '').trim(),
    branch: String(branch || '').trim(),
    status: { $in: ['pending', 'scheduled'] },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return AppointmentDetail.findOne(query).lean();
}

async function getBookedAppointmentTimes({ date, branch, excludeId }) {
  const query = {
    date,
    branch: String(branch || '').trim(),
    status: { $in: ['pending', 'scheduled'] },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const rows = await AppointmentDetail.find(query).select('time').lean();
  return rows
    .map((row) => String(row.time || '').trim())
    .filter(Boolean);
}

export async function getBookedAppointmentSlots(req, res) {
  try {
    const date = String(req.query?.date || '').trim();
    const branch = String(req.query?.branch || '').trim();
    const excludeId = String(req.query?.excludeId || '').trim();

    if (!date || !branch) {
      return res.status(400).json({ message: 'Missing required query parameters: date, branch' });
    }

    const appointmentDate = toDateOnly(date);
    if (!appointmentDate) {
      return res.status(400).json({ message: 'Invalid appointment date.' });
    }

    const bookedTimes = await getBookedAppointmentTimes({
      date: appointmentDate,
      branch,
      excludeId: excludeId || undefined,
    });

    return res.json({ bookedTimes });
  } catch (error) {
    console.error('getBookedAppointmentSlots error:', error);
    return res.status(500).json({ message: 'Failed to load booked appointment slots.' });
  }
}

export async function createAppointment(req, res) {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can book appointments.' });
    }

    const { appointmentType, date, time, branch, notes, selectedGown } = req.body || {};
    const normalizedAppointmentType = String(appointmentType || '').trim();
    const normalizedSelectedGown = String(selectedGown || '').trim();

    if (!appointmentType || !date || !time || !branch) {
      return res.status(400).json({
        message: 'Missing required fields: appointmentType, date, time, branch',
      });
    }

    if (!['fitting', 'consultation', 'measurement', 'pickup'].includes(normalizedAppointmentType)) {
      return res.status(400).json({ message: 'Invalid appointment type.' });
    }

    if (normalizedAppointmentType === 'fitting' && !normalizedSelectedGown) {
      return res.status(400).json({ message: 'A gown selection is required for fitting appointments.' });
    }

    const appointmentDate = toDateOnly(date);
    if (!appointmentDate) {
      return res.status(400).json({ message: 'Invalid appointment date.' });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (appointmentDate <= today) {
      return res.status(400).json({ message: 'Appointment date must be after today.' });
    }

    const allowedTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    if (!allowedTimes.includes(String(time).trim())) {
      return res.status(400).json({ message: 'Invalid appointment time.' });
    }

    const customer = await CustomerAccount.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    if (!customer.phoneNumber) {
      return res.status(400).json({ message: 'Please add your phone number first in your profile settings.' });
    }

    if (!customer.phoneVerified) {
      return res.status(400).json({ message: 'Please verify your phone number first in your profile settings.' });
    }

    let selectedGownName = '';
    let resolvedBranch = String(branch).trim();
    if (normalizedSelectedGown) {
      const product = await ProductDetail.findById(normalizedSelectedGown);
      if (!product || product.status === 'archived') {
        return res.status(404).json({ message: 'Selected gown not found.' });
      }
      selectedGownName = String(product.name || '').trim();
      if (normalizedAppointmentType === 'fitting') {
        resolvedBranch = String(product.branch || '').trim();
      }
    }

    const conflictingAppointment = await findAppointmentConflict({
      date: appointmentDate,
      time,
      branch: resolvedBranch,
    });

    if (conflictingAppointment) {
      return res.status(409).json({
        message: 'That appointment slot is already booked for the selected branch. Please choose a different time.',
      });
    }

    const appointment = await AppointmentDetail.create({
      customerId: customer._id,
      customerEmail: customer.email,
      customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      contactNumber: customer.phoneNumber,
      email: customer.email,
      referenceId: await generateAppointmentReferenceId(),
      type: normalizedAppointmentType,
      date: appointmentDate,
      time: String(time).trim(),
      branch: resolvedBranch,
      notes: String(notes || '').trim(),
      selectedGown: normalizedSelectedGown,
      selectedGownName,
      status: 'pending',
    });

    return res.status(201).json({ appointment: mapAppointment(appointment.toJSON()) });
  } catch (error) {
    console.error('createAppointment error:', error);
    return res.status(500).json({ message: 'Failed to book appointment.' });
  }
}

export async function getMyAppointments(req, res) {
  try {
    const appointments = await AppointmentDetail.find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = appointments
      .map(({ _id, __v, ...rest }) => ({ id: _id, ...rest }))
      .map((row) => mapAppointment(row));

    return res.json({ appointments: mapped });
  } catch (error) {
    console.error('getMyAppointments error:', error);
    return res.status(500).json({ message: 'Failed to fetch appointments.' });
  }
}

export async function rescheduleMyAppointment(req, res) {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can reschedule appointments.' });
    }

    const { id } = req.params;
    const date = String(req.body?.date || '').trim();
    const time = String(req.body?.time || '').trim();
    const branch = String(req.body?.branch || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!date || !time || !branch || !reason) {
      return res.status(400).json({ message: 'Missing required fields: date, time, branch, reason' });
    }

    const appointment = await AppointmentDetail.findOne({ _id: id, customerId: req.user.id });
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    if (String(appointment.status || '').trim().toLowerCase() !== 'scheduled') {
      return res.status(400).json({ message: 'Only scheduled appointments can be rescheduled.' });
    }

    const appointmentDate = toDateOnly(date);
    if (!appointmentDate) {
      return res.status(400).json({ message: 'Invalid appointment date.' });
    }

    const currentDate = appointment.date
      ? new Date(appointment.date).toISOString().slice(0, 10)
      : '';
    if (currentDate === date && String(appointment.time || '').trim() === time) {
      return res.status(400).json({ message: 'Please choose a different date or time for rescheduling.' });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (appointmentDate <= today) {
      return res.status(400).json({ message: 'Appointment date must be after today.' });
    }

    const allowedTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    if (!allowedTimes.includes(time)) {
      return res.status(400).json({ message: 'Invalid appointment time.' });
    }

    const conflictingAppointment = await findAppointmentConflict({
      date: appointmentDate,
      time,
      branch,
      excludeId: appointment._id,
    });

    if (conflictingAppointment) {
      return res.status(409).json({
        message: 'That appointment slot is already booked for the selected branch. Please choose a different time.',
      });
    }

    appointment.date = appointmentDate;
    appointment.time = time;
    appointment.branch = branch;
    appointment.rescheduleReason = reason;
    appointment.status = 'pending';
    await appointment.save();

    return res.json({ appointment: mapAppointment(appointment.toJSON()) });
  } catch (error) {
    console.error('rescheduleMyAppointment error:', error);
    return res.status(500).json({ message: 'Failed to reschedule appointment.' });
  }
}

export async function getAdminAppointments(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const appointments = await AppointmentDetail.find({})
      .sort({ createdAt: -1 })
      .lean();

    const mapped = appointments
      .map(({ _id, __v, ...rest }) => ({ id: _id, ...rest }))
      .map((row) => mapAppointment(row));

    return res.json({ appointments: mapped });
  } catch (error) {
    console.error('getAdminAppointments error:', error);
    return res.status(500).json({ message: 'Failed to fetch appointments.' });
  }
}

export async function updateAppointmentStatus(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { id } = req.params;
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();
    const allowed = ['scheduled', 'completed', 'cancelled'];

    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid appointment status.' });
    }

    const appointment = await AppointmentDetail.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    const transitions = {
      pending: ['scheduled', 'cancelled'],
      scheduled: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const currentStatus = String(appointment.status || '').trim().toLowerCase();
    if (!(transitions[currentStatus] || []).includes(nextStatus)) {
      return res.status(400).json({ message: `Appointment cannot be moved from ${currentStatus} to ${nextStatus}.` });
    }

    if (nextStatus === 'cancelled' && !reason) {
      return res.status(400).json({ message: 'Cancellation reason is required.' });
    }

    appointment.status = nextStatus;
    appointment.cancellationReason = nextStatus === 'cancelled' ? reason : appointment.cancellationReason;
    await appointment.save();

    if (['scheduled', 'completed', 'cancelled'].includes(nextStatus)) {
      try {
        await sendNotificationAcrossChannels({
          email: appointment.customerEmail || appointment.email || '',
          phoneNumber: appointment.contactNumber || '',
          payload: {
            type: 'appointment',
            status: nextStatus,
            name: appointment.customerName || '',
            itemOrServiceOrDesign: getAppointmentServiceLabel(appointment),
            cancellationReason: nextStatus === 'cancelled' ? appointment.cancellationReason || '' : '',
            date: appointment.date ? new Date(appointment.date).toISOString().slice(0, 10) : '',
            dateType: nextStatus === 'scheduled' ? 'Scheduled Date' : 'Time Sent',
            time: appointment.time || '',
            location: appointment.branch || '',
          },
        });
      } catch (notificationError) {
        console.error('appointment status notification error:', notificationError);
      }
    }

    await logAdminAction(req, {
      action: 'appointment_status_updated',
      targetUserId: String(appointment.customerId || appointment.customerEmail || ''),
      targetRole: 'Customer',
      details: {
        appointmentId: String(appointment.referenceId || buildFallbackAppointmentReferenceId(appointment._id)),
        customerName: appointment.customerName || '',
        customerEmail: appointment.customerEmail || '',
        appointmentType: appointment.type || '',
        branch: appointment.branch || '',
        date: appointment.date ? new Date(appointment.date).toISOString().slice(0, 10) : null,
        time: appointment.time || '',
        previousStatus: currentStatus,
        newStatus: nextStatus,
        reason: reason || '',
      },
    });

    return res.json({ appointment: mapAppointment(appointment.toJSON()) });
  } catch (error) {
    console.error('updateAppointmentStatus error:', error);
    return res.status(500).json({ message: 'Failed to update appointment status.' });
  }
}