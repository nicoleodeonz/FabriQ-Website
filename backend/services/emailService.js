const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const EMAILJS_ENABLED = String(process.env.EMAILJS_ENABLED || 'true').toLowerCase() !== 'false';
const EMAILJS_TEST_MODE = String(process.env.EMAILJS_TEST_MODE || 'false').toLowerCase() === 'true';
const IS_PRODUCTION = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';

const EMAILJS_CONFIG = {
  publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
  privateKey: process.env.EMAILJS_PRIVATE_KEY || '',
  serviceId: process.env.EMAILJS_SERVICE_ID || '',
  signupTemplateId: process.env.EMAILJS_SIGNUP_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID || '',
  resetTemplateId: process.env.EMAILJS_RESET_TEMPLATE_ID || '',
  fromName: process.env.EMAILJS_FROM_NAME || 'FabriQ',
  appName: process.env.EMAIL_APP_NAME || 'FabriQ',
};

function getTemplateId(templateKey) {
  if (templateKey === 'signup') return EMAILJS_CONFIG.signupTemplateId;
  if (templateKey === 'password-reset') return EMAILJS_CONFIG.resetTemplateId;
  return '';
}

function getTemplateSubject(templateKey) {
  if (templateKey === 'signup') return `Verify Your Email - ${EMAILJS_CONFIG.appName}`;
  if (templateKey === 'password-reset') return `Reset Your Password - ${EMAILJS_CONFIG.appName}`;
  return EMAILJS_CONFIG.appName;
}

function ensureEmailConfig(templateKey) {
  if (!EMAILJS_ENABLED) return { ok: true, mode: 'disabled' };

  const templateId = getTemplateId(templateKey);
  const missing = [];

  if (!EMAILJS_CONFIG.publicKey) missing.push('EMAILJS_PUBLIC_KEY');
  if (!EMAILJS_CONFIG.serviceId) missing.push('EMAILJS_SERVICE_ID');
  if (!templateId) {
    missing.push(templateKey === 'signup' ? 'EMAILJS_SIGNUP_TEMPLATE_ID' : 'EMAILJS_RESET_TEMPLATE_ID');
  }

  if (missing.length > 0) {
    if (!IS_PRODUCTION) {
      console.warn(`[email:dev-fallback] Missing EmailJS config for ${templateKey}: ${missing.join(', ')}`);
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
  code,
  templateKey,
  firstName = '',
  lastName = '',
  expiresInMinutes,
  expiresInHours,
}) {
  const configStatus = ensureEmailConfig(templateKey);

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

  const templateId = getTemplateId(templateKey);
  const subject = getTemplateSubject(templateKey);
  const templateParams = {
    to_email: email,
    email,
    code,
    verification_code: code,
    reset_code: code,
    from_name: EMAILJS_CONFIG.fromName,
    subject,
    app_name: EMAILJS_CONFIG.appName,
    first_name: firstName,
    last_name: lastName,
    expiry_minutes: expiresInMinutes,
    expiry_hours: expiresInHours,
  };

  if (EMAILJS_TEST_MODE) {
    console.log('[email:test-mode]', {
      templateKey,
      email,
      code,
      templateId,
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
        template_id: templateId,
        user_id: EMAILJS_CONFIG.publicKey,
        accessToken: EMAILJS_CONFIG.privateKey || undefined,
        template_params: templateParams,
      }),
    });

    if (!response.ok) {
      const details = buildProviderErrorDetails(await response.text(), response.statusText);

      if (!IS_PRODUCTION) {
        console.warn(`[email:dev-fallback] EmailJS rejected ${templateKey} email: ${details}`);
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
      console.warn(`[email:dev-fallback] EmailJS request failed for ${templateKey}: ${error.message}`);
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