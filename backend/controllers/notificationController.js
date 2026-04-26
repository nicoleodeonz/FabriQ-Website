import AdminAction from '../models/AdminAction.js';
import AppointmentDetail from '../models/AppointmentDetail.js';
import CustomOrder from '../models/CustomOrder.js';
import RentalDetail from '../models/RentalDetail.js';
import { sendNotificationEmail } from '../services/emailService.js';
import { isElevatedRole } from '../utils/roles.js';

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
    console.error('notification logAdminAction error:', error);
  }
}

function formatDateOnly(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
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

function getRentalNotificationStatus(rental) {
  const status = String(rental.status || '').trim().toLowerCase();
  const dueDate = new Date(rental.endDate);
  const today = new Date();
  dueDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  if (status === 'active' && !Number.isNaN(dueDate.getTime()) && dueDate < today) {
    return 'overdue';
  }

  return status;
}

async function buildNotificationInput(type, recordId) {
  const normalizedType = String(type || '').trim().toLowerCase();

  if (normalizedType === 'rental') {
    const rental = await RentalDetail.findById(recordId).lean();
    if (!rental) {
      return null;
    }

    const status = getRentalNotificationStatus(rental);
    const pickupDate = rental.pickupScheduleDate ? formatDateOnly(rental.pickupScheduleDate) : '';

    return {
      action: 'rental_notification_sent',
      targetUserId: String(rental.customerId || rental.customerEmail || ''),
      details: {
        rentalId: String(rental._id || ''),
        referenceId: String(rental.referenceId || ''),
        status,
        gownName: rental.gownName || '',
        email: rental.customerEmail || rental.email || '',
      },
      email: rental.customerEmail || rental.email || '',
      payload: {
        type: 'rental',
        status,
        name: rental.customerName || '',
        itemOrServiceOrDesign: rental.gownName || 'Rental Item',
        date: status === 'for_pickup' ? pickupDate || formatDateOnly(rental.startDate) : formatDateOnly(rental.endDate),
        time: status === 'for_pickup' ? String(rental.pickupScheduleTime || '').trim() : '',
        location: String(rental.branch || '').trim(),
      },
    };
  }

  if (normalizedType === 'appointment') {
    const appointment = await AppointmentDetail.findById(recordId).lean();
    if (!appointment) {
      return null;
    }

    return {
      action: 'appointment_notification_sent',
      targetUserId: String(appointment.customerId || appointment.customerEmail || ''),
      details: {
        appointmentId: String(appointment._id || ''),
        status: String(appointment.status || ''),
        service: getAppointmentServiceLabel(appointment),
        email: appointment.customerEmail || appointment.email || '',
      },
      email: appointment.customerEmail || appointment.email || '',
      payload: {
        type: 'appointment',
        status: String(appointment.status || ''),
        name: appointment.customerName || '',
        itemOrServiceOrDesign: getAppointmentServiceLabel(appointment),
        date: formatDateOnly(appointment.date),
        time: String(appointment.time || '').trim(),
        location: String(appointment.branch || '').trim(),
      },
    };
  }

  if (normalizedType === 'bespoke') {
    const order = await CustomOrder.findById(recordId).lean();
    if (!order) {
      return null;
    }

    const status = String(order.status || '').trim();
    const date = status === 'design-approval'
      ? String(order.consultationDate || '').trim()
      : status === 'fitting'
        ? String(order.fittingDate || '').trim()
        : String(order.eventDate || '').trim();
    const time = status === 'design-approval'
      ? String(order.consultationTime || '').trim()
      : status === 'fitting'
        ? String(order.fittingTime || '').trim()
        : '';

    return {
      action: 'custom_order_notification_sent',
      targetUserId: String(order.customerId || order.email || ''),
      details: {
        customOrderId: String(order._id || ''),
        referenceId: String(order.referenceId || ''),
        status,
        orderType: order.orderType || '',
        email: order.email || '',
      },
      email: order.email || '',
      payload: {
        type: 'bespoke',
        status,
        name: order.customerName || '',
        itemOrServiceOrDesign: order.orderType || 'Custom Gown Order',
        date,
        time,
        location: String(order.branch || '').trim(),
      },
    };
  }

  throw new Error('Unsupported notification type.');
}

export async function sendServiceNotification(req, res) {
  try {
    if (!isElevatedRole(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const type = String(req.body?.type || '').trim().toLowerCase();
    const recordId = String(req.body?.recordId || '').trim();

    if (!type || !recordId) {
      return res.status(400).json({ message: 'type and recordId are required.' });
    }

    const notificationInput = await buildNotificationInput(type, recordId);
    if (!notificationInput) {
      return res.status(404).json({ message: 'Notification target not found.' });
    }

    if (!String(notificationInput.email || '').trim()) {
      return res.status(400).json({ message: 'Customer email is missing for this notification.' });
    }

    const deliveryResult = await sendNotificationEmail({
      email: notificationInput.email,
      ...notificationInput.payload,
    });

    await logAdminAction(req, {
      action: notificationInput.action,
      targetUserId: notificationInput.targetUserId,
      targetRole: 'Customer',
      details: {
        ...notificationInput.details,
        delivered: Boolean(deliveryResult.delivered),
        skipped: Boolean(deliveryResult.skipped),
        reason: deliveryResult.reason || '',
      },
    });

    return res.json({
      message: deliveryResult.delivered
        ? 'Notification email sent successfully.'
        : 'Notification email was not delivered.',
      result: deliveryResult,
    });
  } catch (error) {
    console.error('sendServiceNotification error:', error);
    return res.status(500).json({ message: error.message || 'Failed to send notification email.' });
  }
}