import { loadEnvironment } from '../config/loadEnv.js';

loadEnvironment();

const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4';
const DEFAULT_OTP_TEMPLATE = 'Your FabriQ verification code is {otp}. It expires in 10 minutes.';

function buildVerificationMessage({ purpose, expiresInMinutes, expiresInHours }) {
  const expiryLabel = expiresInMinutes
    ? `${expiresInMinutes} minutes`
    : expiresInHours
      ? `${expiresInHours} hours`
      : 'a short time';

  if (purpose === 'password_reset') {
    return `Your FabriQ password reset code is {otp}. It expires in ${expiryLabel}.`;
  }

  return `Your FabriQ account verification code is {otp}. It expires in ${expiryLabel}.`;
}

function isUnset(value) {
  const normalized = String(value || '').trim();
  const lowerValue = normalized.toLowerCase();
  return !normalized || lowerValue.startsWith('your_') || lowerValue.startsWith('replace_with_');
}

function normalizePhoneNumber(phoneNumber) {
  let digits = String(phoneNumber || '').replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('63')) {
    digits = digits.slice(2);
  }

  digits = digits.slice(-10);
  if (!/^9\d{9}$/.test(digits)) {
    const error = new Error('Invalid phone number for SMS delivery.');
    error.code = 'INVALID_SMS_PHONE_NUMBER';
    throw error;
  }

  return `63${digits}`;
}

function getSemaphoreConfig() {
  const apiKey = String(process.env.SEMAPHORE_API_KEY || '').trim();
  const senderName = String(process.env.SEMAPHORE_SENDER_NAME || '').trim();
  const otpTemplate = String(process.env.SEMAPHORE_OTP_TEMPLATE || '').trim() || DEFAULT_OTP_TEMPLATE;

  const missingKeys = [
    isUnset(apiKey) ? 'SEMAPHORE_API_KEY' : null,
  ].filter(Boolean);

  if (missingKeys.length > 0) {
    const error = new Error('Semaphore SMS is not configured on the server.');
    error.code = 'SEMAPHORE_NOT_CONFIGURED';
    error.missingKeys = missingKeys;
    throw error;
  }

  return {
    apiKey,
    senderName: isUnset(senderName) ? '' : senderName,
    otpTemplate,
  };
}

async function sendSemaphoreRequest(endpoint, payload) {
  const config = getSemaphoreConfig();
  const body = new URLSearchParams({
    apikey: config.apiKey,
    ...payload,
  });

  if (config.senderName) {
    body.set('sendername', config.senderName);
  }

  const response = await fetch(`${SEMAPHORE_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const raw = await response.text();
  let parsed;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  if (!response.ok) {
    const error = new Error('Semaphore SMS request failed.');
    error.code = 'SEMAPHORE_REQUEST_FAILED';
    error.status = response.status;
    error.details = parsed;
    throw error;
  }

  return parsed;
}

export async function sendPhoneVerificationCode(phoneNumber, code) {
  const { otpTemplate } = getSemaphoreConfig();

  return sendSemaphoreRequest('/otp', {
    number: normalizePhoneNumber(phoneNumber),
    message: otpTemplate,
    code: String(code),
  });
}

export async function sendNotificationSms({ phoneNumber, message }) {
  return sendSemaphoreRequest('/messages', {
    number: normalizePhoneNumber(phoneNumber),
    message: String(message || '').trim(),
  });
}

export async function sendVerificationCodeSms({
  phoneNumber,
  code,
  purpose,
  expiresInMinutes,
  expiresInHours,
}) {
  return sendSemaphoreRequest('/otp', {
    number: normalizePhoneNumber(phoneNumber),
    message: buildVerificationMessage({ purpose, expiresInMinutes, expiresInHours }),
    code: String(code),
  });
}

export function isSmsConfigError(error) {
  return error?.code === 'SEMAPHORE_NOT_CONFIGURED';
}

export function isSmsPhoneNumberError(error) {
  return error?.code === 'INVALID_SMS_PHONE_NUMBER';
}