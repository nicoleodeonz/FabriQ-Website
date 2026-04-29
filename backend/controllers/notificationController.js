import AdminAction from '../models/AdminAction.js';
import AppointmentDetail from '../models/AppointmentDetail.js';
import CustomOrder from '../models/CustomOrder.js';
import RentalDetail from '../models/RentalDetail.js';
import { buildNotificationEmailPayload, sendNotificationEmail } from '../services/emailService.js';
import { isSmsConfigError, isSmsPhoneNumberError, sendNotificationSms } from '../services/smsService.js';
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

function normalizeDeliveryMethod(value) {
  const method = String(value || 'email').trim().toLowerCase();
  if (method === 'sms' || method === 'email' || method === 'both') {
    return method;
  }
  return '';
}

function buildSkippedResult(reason, details = '') {
  return {
    delivered: false,
    skipped: true,
    reason,
    details,
  };
}

function buildDeliverySummary({ emailResult, smsResult, requestedMethod }) {
  const emailDelivered = Boolean(emailResult?.delivered);
  const smsDelivered = Boolean(smsResult?.delivered);

  if (requestedMethod === 'both') {
    if (emailDelivered && smsDelivered) {
      return 'Notification sent successfully via SMS and email.';
    }
    if (emailDelivered || smsDelivered) {
      return 'Notification sent partially. One delivery channel completed successfully.';
    }
    return 'Notification was not delivered.';
  }

  if (requestedMethod === 'sms') {
    return smsDelivered ? 'Notification SMS sent successfully.' : 'Notification SMS was not delivered.';
  }

  return emailDelivered ? 'Notification email sent successfully.' : 'Notification email was not delivered.';
}

async function buildNotificationInput(type, recordId, options = {}) {
  const normalizedType = String(type || '').trim().toLowerCase();
  const messageBody = String(options.messageBody || '').trim();

  if (normalizedType === 'rental') {
    const rental = await RentalDetail.findById(recordId).lean();
    if (!rental) {
      return null;
    }

    const status = getRentalNotificationStatus(rental);
    const pickupDate = rental.pickupScheduleDate ? formatDateOnly(rental.pickupScheduleDate) : '';
    const hasPickupSchedule = Boolean(pickupDate && String(rental.pickupScheduleTime || '').trim());

    return {
      action: 'rental_notification_sent',
      targetUserId: String(rental.customerId || rental.customerEmail || ''),
      details: {
        rentalId: String(rental._id || ''),
        referenceId: String(rental.referenceId || ''),
        status,
        gownName: rental.gownName || '',
        email: rental.customerEmail || rental.email || '',
        phoneNumber: rental.contactNumber || '',
      },
      email: rental.customerEmail || rental.email || '',
      phoneNumber: rental.contactNumber || '',
      payload: {
        type: 'rental',
        status,
        name: rental.customerName || '',
        itemOrServiceOrDesign: rental.gownName || 'Rental Item',
        messageBody,
        date: status === 'for_pickup' ? pickupDate || formatDateOnly(rental.startDate) : formatDateOnly(rental.endDate),
        dateType: status === 'for_pickup' && hasPickupSchedule ? 'Scheduled Date' : 'Time Sent',
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
        phoneNumber: appointment.contactNumber || '',
      },
      email: appointment.customerEmail || appointment.email || '',
      phoneNumber: appointment.contactNumber || '',
      payload: {
        type: 'appointment',
        status: String(appointment.status || ''),
        name: appointment.customerName || '',
        itemOrServiceOrDesign: getAppointmentServiceLabel(appointment),
        messageBody,
        date: formatDateOnly(appointment.date),
        dateType: String(appointment.status || '').trim().toLowerCase() === 'scheduled' ? 'Scheduled Date' : 'Time Sent',
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
    const hasConsultationSchedule = Boolean(String(order.consultationDate || '').trim() || String(order.consultationTime || '').trim());
    const hasFittingSchedule = Boolean(String(order.fittingDate || '').trim() || String(order.fittingTime || '').trim());
    const dateType = status === 'design-approval' && hasConsultationSchedule
      ? 'Scheduled Date'
      : status === 'fitting-scheduled' && hasFittingSchedule
        ? 'Scheduled Date'
        : 'Time Sent';

    return {
      action: 'custom_order_notification_sent',
      targetUserId: String(order.customerId || order.email || ''),
      details: {
        customOrderId: String(order._id || ''),
        referenceId: String(order.referenceId || ''),
        status,
        orderType: order.orderType || '',
        email: order.email || '',
        phoneNumber: order.contactNumber || '',
      },
      email: order.email || '',
      phoneNumber: order.contactNumber || '',
      payload: {
        type: 'bespoke',
        status,
        name: order.customerName || '',
        itemOrServiceOrDesign: order.orderType || 'Custom Gown Order',
        messageBody,
        date,
        dateType,
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
    const messageBody = String(req.body?.messageBody || '').trim();
    const deliveryMethod = normalizeDeliveryMethod(req.body?.deliveryMethod);

    if (!type || !recordId) {
      return res.status(400).json({ message: 'type and recordId are required.' });
    }

    if (!deliveryMethod) {
      return res.status(400).json({ message: 'deliveryMethod must be email, sms, or both.' });
    }

    const notificationInput = await buildNotificationInput(type, recordId, { messageBody });
    if (!notificationInput) {
      return res.status(404).json({ message: 'Notification target not found.' });
    }

    if ((deliveryMethod === 'email' || deliveryMethod === 'both') && !String(notificationInput.email || '').trim()) {
      if (deliveryMethod === 'email') {
        return res.status(400).json({ message: 'Customer email is missing for this notification.' });
      }
    }

    if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && !String(notificationInput.phoneNumber || '').trim()) {
      if (deliveryMethod === 'sms') {
        return res.status(400).json({ message: 'Customer phone number is missing for this notification.' });
      }
    }

    const smsMessage = buildNotificationEmailPayload(notificationInput.payload).message_body;

    let emailResult = null;
    let smsResult = null;

    if (deliveryMethod === 'email' || deliveryMethod === 'both') {
      if (String(notificationInput.email || '').trim()) {
        emailResult = await sendNotificationEmail({
          email: notificationInput.email,
          ...notificationInput.payload,
        });
      } else {
        emailResult = buildSkippedResult('missing-email', 'Customer email is missing for this notification.');
      }
    }

    if (deliveryMethod === 'sms' || deliveryMethod === 'both') {
      if (String(notificationInput.phoneNumber || '').trim()) {
        try {
          const providerResponse = await sendNotificationSms({
            phoneNumber: notificationInput.phoneNumber,
            message: smsMessage,
          });

          smsResult = {
            delivered: true,
            provider: 'semaphore',
            response: providerResponse,
          };
        } catch (error) {
          if (deliveryMethod === 'sms') {
            if (isSmsConfigError(error)) {
              const missingKeys = Array.isArray(error?.missingKeys) ? error.missingKeys.join(', ') : '';
              return res.status(503).json({
                message: missingKeys
                  ? `SMS delivery is not configured on the server yet. Missing or placeholder values: ${missingKeys}.`
                  : 'SMS delivery is not configured on the server yet.',
              });
            }

            if (isSmsPhoneNumberError(error)) {
              return res.status(400).json({ message: 'Customer phone number is not valid for SMS delivery.' });
            }

            throw error;
          }

          smsResult = buildSkippedResult(
            isSmsConfigError(error)
              ? 'missing-config'
              : isSmsPhoneNumberError(error)
                ? 'invalid-phone-number'
                : 'provider-error',
            error?.message || 'SMS delivery failed.',
          );
        }
      } else {
        smsResult = buildSkippedResult('missing-phone-number', 'Customer phone number is missing for this notification.');
      }
    }

    await logAdminAction(req, {
      action: notificationInput.action,
      targetUserId: notificationInput.targetUserId,
      targetRole: 'Customer',
      details: {
        ...notificationInput.details,
        requestedMethod: deliveryMethod,
        email: emailResult,
        sms: smsResult,
      },
    });

    return res.json({
      message: buildDeliverySummary({ emailResult, smsResult, requestedMethod: deliveryMethod }),
      result: {
        requestedMethod: deliveryMethod,
        email: emailResult,
        sms: smsResult,
      },
    });
  } catch (error) {
    console.error('sendServiceNotification error:', error);
    return res.status(500).json({ message: error.message || 'Failed to send notification.' });
  }
}