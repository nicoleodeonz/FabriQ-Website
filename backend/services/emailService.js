const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const EMAILJS_ENABLED = String(process.env.EMAILJS_ENABLED || 'true').toLowerCase() !== 'false';
const EMAILJS_TEST_MODE = String(process.env.EMAILJS_TEST_MODE || 'false').toLowerCase() === 'true';
const IS_PRODUCTION = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';

const EMAILJS_CONFIG = {
  publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
  privateKey: process.env.EMAILJS_PRIVATE_KEY || '',
  serviceId: process.env.EMAILJS_SERVICE_ID || '',
  templateId: process.env.EMAILJS_TEMPLATE_ID || '',
  fromName: process.env.EMAILJS_FROM_NAME || 'FabriQ',
  appName: process.env.EMAIL_APP_NAME || 'FabriQ',
};

function getEmailContent(purpose) {
  if (purpose === 'account_verification') {
    return {
      subject: 'Verify Your Account',
      messageBody: 'Use the verification code below to complete your account registration.',
    };
  }

  if (purpose === 'password_reset') {
    return {
      subject: 'Password Reset Request',
      messageBody: 'Use the verification code below to reset your password. This code will expire shortly.',
    };
  }

  throw new Error(`Unsupported email purpose: ${purpose}`);
}

function ensureEmailConfig() {
  if (!EMAILJS_ENABLED) return { ok: true, mode: 'disabled' };

  const missing = [];

  if (!EMAILJS_CONFIG.publicKey) missing.push('EMAILJS_PUBLIC_KEY');
  if (!EMAILJS_CONFIG.serviceId) missing.push('EMAILJS_SERVICE_ID');
  if (!EMAILJS_CONFIG.templateId) {
    missing.push('EMAILJS_TEMPLATE_ID');
  }

  if (missing.length > 0) {
    if (!IS_PRODUCTION) {
      console.warn(`[email:dev-fallback] Missing EmailJS config: ${missing.join(', ')}`);
      return { ok: false, mode: 'missing-config', missing };
    }

    throw new Error(`EmailJS is not fully configured. Missing: ${missing.join(', ')}`);
  }

  return { ok: true, mode: 'configured' };
}

function buildProviderErrorDetails(responseText, fallbackStatusText) {
  return String(responseText || fallbackStatusText || 'Unknown email provider error').trim();
}

export async function sendVerificationCodeEmail({
  email,
  name = '',
  code,
  purpose,
  expiresInMinutes,
  expiresInHours,
}) {
  const configStatus = ensureEmailConfig();

  if (!EMAILJS_ENABLED) {
    return { delivered: false, skipped: true, reason: 'disabled' };
  }

  if (!configStatus.ok) {
    return {
      delivered: false,
      skipped: true,
      reason: configStatus.mode,
      missing: configStatus.missing || [],
    };
  }

  const { subject, messageBody } = getEmailContent(purpose);
  const templateParams = {
    to_email: email,
    email,
    purpose,
    code,
    verification_code: code,
    reset_code: code,
    otp_code: code,
    name: String(name || '').trim() || 'Customer',
    business_name: EMAILJS_CONFIG.appName,
    from_name: EMAILJS_CONFIG.fromName,
    subject,
    message_body: messageBody,
    app_name: EMAILJS_CONFIG.appName,
    expiry_minutes: expiresInMinutes,
    expiry_hours: expiresInHours,
  };

  if (EMAILJS_TEST_MODE) {
    console.log('[email:test-mode]', {
      purpose,
      email,
      code,
      templateId: EMAILJS_CONFIG.templateId,
      templateParams,
    });
    return { delivered: false, skipped: true, reason: 'test-mode' };
  }

  try {
    const response = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_CONFIG.serviceId,
        template_id: EMAILJS_CONFIG.templateId,
        user_id: EMAILJS_CONFIG.publicKey,
        accessToken: EMAILJS_CONFIG.privateKey || undefined,
        template_params: templateParams,
      }),
    });

    if (!response.ok) {
      const details = buildProviderErrorDetails(await response.text(), response.statusText);

      if (!IS_PRODUCTION) {
        console.warn(`[email:dev-fallback] EmailJS rejected ${purpose} email: ${details}`);
        return {
          delivered: false,
          skipped: true,
          reason: 'provider-rejected',
          details,
        };
      }

      throw new Error(`Email delivery failed: ${details}`);
    }

    return { delivered: true };
  } catch (error) {
    if (!IS_PRODUCTION) {
      console.warn(`[email:dev-fallback] EmailJS request failed for ${purpose}: ${error.message}`);
      return {
        delivered: false,
        skipped: true,
        reason: 'provider-error',
        details: error.message,
      };
    }

    throw error;
  }
}