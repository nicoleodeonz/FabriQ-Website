import twilio from 'twilio';

let cachedClient = null;

function isUnset(value) {
  const normalized = String(value || '').trim();
  const lowerValue = normalized.toLowerCase();
  return !normalized || lowerValue.startsWith('your_') || lowerValue.startsWith('replace_with_');
}

function getTwilioConfig() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const verifyServiceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();

  const missingKeys = [
    isUnset(accountSid) ? 'TWILIO_ACCOUNT_SID' : null,
    isUnset(authToken) ? 'TWILIO_AUTH_TOKEN' : null,
    isUnset(verifyServiceSid) ? 'TWILIO_VERIFY_SERVICE_SID' : null,
  ].filter(Boolean);

  if (missingKeys.length > 0) {
    const error = new Error('Twilio Verify is not configured on the server.');
    error.code = 'TWILIO_VERIFY_NOT_CONFIGURED';
    error.missingKeys = missingKeys;
    throw error;
  }

  return { accountSid, authToken, verifyServiceSid };
}

function getClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const { accountSid, authToken } = getTwilioConfig();
  cachedClient = twilio(accountSid, authToken);
  return cachedClient;
}

function getVerifyService() {
  const { verifyServiceSid } = getTwilioConfig();
  return getClient().verify.v2.services(verifyServiceSid);
}

export async function sendPhoneVerificationCode(phoneNumber) {
  return getVerifyService().verifications.create({
    to: phoneNumber,
    channel: 'sms',
  });
}

export async function checkPhoneVerificationCode(phoneNumber, code) {
  return getVerifyService().verificationChecks.create({
    to: phoneNumber,
    code,
  });
}

export function isTwilioVerifyConfigError(error) {
  return error?.code === 'TWILIO_VERIFY_NOT_CONFIGURED';
}