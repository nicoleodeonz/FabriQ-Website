import { buildNotificationEmailPayload, sendNotificationEmail } from './emailService.js';
import CustomerNotification from '../models/CustomerNotification.js';
import {
  isSmsConfigError,
  isSmsPhoneNumberError,
  sendNotificationSms,
  sendVerificationCodeSms,
} from './smsService.js';

const PERSISTED_NOTIFICATION_TYPES = new Set(['rental', 'appointment', 'bespoke']);

function buildSkippedResult(reason, details = '') {
  return {
    delivered: false,
    skipped: true,
    reason,
    details,
  };
}

export async function persistCustomerNotification({ customerId, customerEmail, payload, metadata = null }) {
  const normalizedType = String(payload?.type || '').trim().toLowerCase();
  if (!PERSISTED_NOTIFICATION_TYPES.has(normalizedType)) {
    return null;
  }

  const resolvedCustomerId = String(customerId || '').trim();
  const resolvedCustomerEmail = String(customerEmail || '').trim();
  if (!resolvedCustomerId && !resolvedCustomerEmail) {
    return null;
  }

  const emailPayload = buildNotificationEmailPayload(payload || {});

  return CustomerNotification.create({
    customerId: resolvedCustomerId,
    customerEmail: resolvedCustomerEmail,
    type: normalizedType,
    status: String(payload?.status || '').trim(),
    title: String(emailPayload.subject || '').trim() || 'Notification Update',
    message: String(emailPayload.message_body || '').trim(),
    itemLabel: String(payload?.itemOrServiceOrDesign || '').trim(),
    date: String(emailPayload.date || '').trim(),
    dateType: String(emailPayload.date_type || '').trim(),
    time: String(emailPayload.time || '').trim(),
    location: String(emailPayload.location || '').trim(),
    metadata: {
      recordId: String(payload?.recordId || '').trim(),
      customerId: resolvedCustomerId,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    },
  });
}

export async function sendNotificationAcrossChannels({ email, phoneNumber, payload }) {
  let emailResult = null;
  let smsResult = null;

  if (String(email || '').trim()) {
    try {
      emailResult = await sendNotificationEmail({
        email,
        ...payload,
      });
    } catch (error) {
      emailResult = buildSkippedResult('email-error', error.message || 'Email delivery failed.');
    }
  } else {
    emailResult = buildSkippedResult('missing-email', 'Customer email is missing for this notification.');
  }

  if (String(phoneNumber || '').trim()) {
    try {
      const providerResponse = await sendNotificationSms({
        phoneNumber,
        message: buildNotificationEmailPayload(payload).message_body,
      });

      smsResult = {
        delivered: true,
        provider: 'semaphore',
        response: providerResponse,
      };
    } catch (error) {
      smsResult = buildSkippedResult(
        isSmsConfigError(error)
          ? 'missing-config'
          : isSmsPhoneNumberError(error)
            ? 'invalid-phone-number'
            : 'sms-error',
        error.message || 'SMS delivery failed.',
      );
    }
  } else {
    smsResult = buildSkippedResult('missing-phone-number', 'Customer phone number is missing for this notification.');
  }

  try {
    await persistCustomerNotification({
      customerId: payload?.customerId,
      customerEmail: email,
      payload,
      metadata: {
        email: emailResult,
        sms: smsResult,
      },
    });
  } catch (error) {
    console.error('persistCustomerNotification error:', error);
  }

  return {
    email: emailResult,
    sms: smsResult,
  };
}

export async function sendVerificationAcrossChannels({
  phoneNumber,
  code,
  purpose,
  expiresInMinutes,
  expiresInHours,
}) {
  if (!String(phoneNumber || '').trim()) {
    return buildSkippedResult('missing-phone-number', 'Phone number is missing for SMS verification delivery.');
  }

  try {
    const providerResponse = await sendVerificationCodeSms({
      phoneNumber,
      code,
      purpose,
      expiresInMinutes,
      expiresInHours,
    });

    return {
      delivered: true,
      provider: 'semaphore',
      response: providerResponse,
    };
  } catch (error) {
    return buildSkippedResult(
      isSmsConfigError(error)
        ? 'missing-config'
        : isSmsPhoneNumberError(error)
          ? 'invalid-phone-number'
          : 'sms-error',
      error.message || 'SMS verification delivery failed.',
    );
  }
}

export async function sendPhoneVerifiedCongratulations({ email, phoneNumber, name }) {
  const now = new Date();

  return sendNotificationAcrossChannels({
    email,
    phoneNumber,
    payload: {
      type: 'bespoke',
      status: 'completed',
      name,
      itemOrServiceOrDesign: 'Verified Phone Number',
      date: now.toISOString().slice(0, 10),
      dateType: 'Time Sent',
      time: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      location: '',
      subject: 'Phone Number Verified',
      detailsOverride: 'Your verified phone number is now ready for rentals, appointments, and bespoke orders.',
      messageBody: 'Congratulations. Your phone number has been verified successfully. You can now use this verified number to rent gowns, book appointments, and create bespoke orders with Hannah Vanessa Boutique.',
    },
  });
}