import { buildNotificationEmailPayload, sendNotificationEmail } from './emailService.js';
import {
  isSmsConfigError,
  isSmsPhoneNumberError,
  sendNotificationSms,
  sendVerificationCodeSms,
} from './smsService.js';

function buildSkippedResult(reason, details = '') {
  return {
    delivered: false,
    skipped: true,
    reason,
    details,
  };
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