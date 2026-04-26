import { loadEnvironment } from '../config/loadEnv.js';

loadEnvironment();

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const EMAILJS_ENABLED = String(process.env.EMAILJS_ENABLED || 'true').toLowerCase() !== 'false';
const EMAILJS_TEST_MODE = String(process.env.EMAILJS_TEST_MODE || 'false').toLowerCase() === 'true';
const IS_PRODUCTION = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';

const EMAILJS_CONFIG = {
  publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
  privateKey: process.env.EMAILJS_PRIVATE_KEY || '',
  serviceId: process.env.EMAILJS_SERVICE_ID || '',
  templateId: process.env.EMAILJS_TEMPLATE_ID || '',
  notificationTemplateId: process.env.EMAILJS_NOTIFICATION_TEMPLATE_ID || '',
  fromName: process.env.EMAILJS_FROM_NAME || 'FabriQ',
  appName: process.env.EMAIL_APP_NAME || 'FabriQ',
  contactInfo: process.env.EMAIL_CONTACT_INFO || process.env.EMAILJS_CONTACT_INFO || '',
};

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatStatusLabel(status) {
  return normalizeStatus(status)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isOverdueRentalStatus(status) {
  return /(overdue|late|past return date)/i.test(String(status || ''));
}

function getNotificationSubject(type, status) {
  const normalizedType = String(type || '').trim().toLowerCase();
  const normalizedStatus = normalizeStatus(status);

  if (normalizedType === 'appointment') {
    if (normalizedStatus === 'pending') return 'Appointment Request Received';
    if (normalizedStatus === 'scheduled') return 'Appointment Confirmed';
    if (normalizedStatus === 'completed') return 'Appointment Completed';
    if (normalizedStatus === 'cancelled') return 'Appointment Cancelled';
    return `Appointment ${formatStatusLabel(status)}`.trim();
  }

  if (normalizedType === 'rental') {
    if (isOverdueRentalStatus(status)) return 'Rental Overdue';
    if (normalizedStatus === 'pending') return 'Rental Request Received';
    if (normalizedStatus === 'for_payment') return 'Rental Payment Required';
    if (normalizedStatus === 'paid_for_confirmation') return 'Rental Payment Under Review';
    if (normalizedStatus === 'for_pickup') return 'Rental Ready for Pickup';
    if (normalizedStatus === 'active') return 'Rental Active';
    if (normalizedStatus === 'completed') return 'Rental Completed';
    if (normalizedStatus === 'cancelled') return 'Rental Cancelled';
    return `Rental ${formatStatusLabel(status)}`.trim();
  }

  if (normalizedType === 'bespoke') {
    if (normalizedStatus === 'inquiry') return 'Bespoke Inquiry Received';
    if (normalizedStatus === 'design-approval') return 'Bespoke Consultation Update';
    if (normalizedStatus === 'in-progress') return 'Bespoke Order In Progress';
    if (normalizedStatus === 'fitting') return 'Bespoke Fitting Update';
    if (normalizedStatus === 'fitting-scheduled') return 'Bespoke Fitting Schedule Confirmed';
    if (normalizedStatus === 'completed') return 'Bespoke Order Completed';
    if (normalizedStatus === 'rejected') return 'Bespoke Order Update';
    return `Bespoke ${formatStatusLabel(status)}`.trim();
  }

  return formatStatusLabel(status) || 'Notification Update';
}

function getNotificationMessageBody(type, status, itemOrServiceOrDesign) {
  const normalizedType = String(type || '').trim().toLowerCase();
  const normalizedStatus = normalizeStatus(status);
  const itemLabel = String(itemOrServiceOrDesign || '').trim() || (normalizedType === 'appointment' ? 'your appointment' : normalizedType === 'bespoke' ? 'your bespoke order' : 'your rental');

  if (normalizedType === 'rental' && isOverdueRentalStatus(status)) {
    return `Your rental for ${itemLabel} is now overdue. Please return it as soon as possible, as late fees may apply until the item is received.`;
  }

  if (normalizedType === 'appointment') {
    if (normalizedStatus === 'pending') return `Your appointment request for ${itemLabel} has been received. Please wait for our confirmation and keep your schedule available for updates.`;
    if (normalizedStatus === 'scheduled') return `Your appointment for ${itemLabel} has been confirmed. Please arrive on time and contact us if you need to reschedule.`;
    if (normalizedStatus === 'completed') return `Your appointment for ${itemLabel} has been marked as completed. Please contact us if you need any further assistance.`;
    if (normalizedStatus === 'cancelled') return `Your appointment for ${itemLabel} has been cancelled. Please contact us if you would like to arrange a new schedule.`;
    return `Your appointment for ${itemLabel} is now ${formatStatusLabel(status).toLowerCase()}. Please contact us if you need any assistance.`;
  }

  if (normalizedType === 'rental') {
    if (normalizedStatus === 'pending') return `Your rental request for ${itemLabel} is pending review. Please wait for the next update from our team.`;
    if (normalizedStatus === 'for_payment') return `Your rental for ${itemLabel} is now awaiting payment. Please complete the required payment so we can proceed with your booking.`;
    if (normalizedStatus === 'paid_for_confirmation') return `We received your payment submission for ${itemLabel}. Please wait while we review and confirm your rental.`;
    if (normalizedStatus === 'for_pickup') return `Your rental for ${itemLabel} is ready for pickup. Please prepare for collection and contact us if you need any changes.`;
    if (normalizedStatus === 'active') return `Your rental for ${itemLabel} is currently active. Please keep the item in good condition and return it on time.`;
    if (normalizedStatus === 'completed') return `Your rental for ${itemLabel} has been completed. Thank you for choosing our service.`;
    if (normalizedStatus === 'cancelled') return `Your rental for ${itemLabel} has been cancelled. Please contact us if you need help with a new booking.`;
    return `Your rental for ${itemLabel} is now ${formatStatusLabel(status).toLowerCase()}. Please contact us if you need any assistance.`;
  }

  if (normalizedType === 'bespoke') {
    if (normalizedStatus === 'inquiry') return `Your bespoke order inquiry for ${itemLabel} has been received. Please wait for the next update from our team.`;
    if (normalizedStatus === 'design-approval') return `Your bespoke order for ${itemLabel} is ready for design approval. Please review the next steps and confirm your schedule if needed.`;
    if (normalizedStatus === 'in-progress') return `Your bespoke order for ${itemLabel} is now in progress. Please stay available for any design or fitting updates.`;
    if (normalizedStatus === 'fitting') return `Your bespoke order for ${itemLabel} is ready for fitting. Please set your fitting schedule so we can proceed with the next step.`;
    if (normalizedStatus === 'fitting-scheduled') return `Your fitting appointment for ${itemLabel} has been scheduled. Please attend on your selected date and time, or contact us if you need to reschedule.`;
    if (normalizedStatus === 'completed') return `Your bespoke order for ${itemLabel} is completed. Thank you for choosing FabriQ. Please review the order details below and contact us if you need any final assistance.`;
    if (normalizedStatus === 'rejected') return `Your bespoke order for ${itemLabel} has been updated. Please contact us if you would like to discuss the next available options.`;
    return `Your bespoke order for ${itemLabel} is now ${formatStatusLabel(status).toLowerCase()}. Please contact us if you need any assistance.`;
  }

  return `Your ${normalizedType || 'service'} update for ${itemLabel} is now available. Please contact us if you need any assistance.`;
}

export function buildNotificationEmailPayload({
  type,
  status,
  name,
  itemOrServiceOrDesign,
  date,
  time,
  location,
  businessName,
  contactInfo,
}) {
  const normalizedType = String(type || '').trim().toLowerCase();
  const normalizedStatus = normalizeStatus(status);
  const detailsLabel = normalizedType === 'appointment'
    ? 'Service'
    : normalizedType === 'bespoke'
      ? (normalizedStatus === 'completed' ? 'Order' : 'Design')
      : 'Item';
  const detailsValue = normalizedType === 'bespoke' && normalizedStatus === 'completed'
    ? `Bespoke ${String(itemOrServiceOrDesign || '').trim() || 'Custom Gown Order'}`
    : `${detailsLabel}: ${String(itemOrServiceOrDesign || '').trim() || 'N/A'}`;

  return {
    subject: getNotificationSubject(normalizedType, status),
    name: String(name || '').trim() || 'Customer',
    message_body: getNotificationMessageBody(normalizedType, status, itemOrServiceOrDesign),
    details: detailsValue,
    date: String(date || '').trim(),
    time: String(time || '').trim(),
    location: String(location || '').trim(),
    business_name: String(businessName || '').trim() || EMAILJS_CONFIG.appName,
    contact_info: String(contactInfo || '').trim() || EMAILJS_CONFIG.contactInfo,
  };
}

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

function ensureEmailConfig(templateType = 'verification') {
  if (!EMAILJS_ENABLED) return { ok: true, mode: 'disabled' };

  const templateId = templateType === 'notification'
    ? EMAILJS_CONFIG.notificationTemplateId
    : EMAILJS_CONFIG.templateId;

  const missing = [];

  if (!EMAILJS_CONFIG.publicKey) missing.push('EMAILJS_PUBLIC_KEY');
  if (!EMAILJS_CONFIG.serviceId) missing.push('EMAILJS_SERVICE_ID');
  if (!templateId) {
    missing.push(templateType === 'notification' ? 'EMAILJS_NOTIFICATION_TEMPLATE_ID' : 'EMAILJS_TEMPLATE_ID');
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

async function sendEmailJsTemplate({ templateId, templateParams, logLabel }) {
  if (EMAILJS_TEST_MODE) {
    console.log('[email:test-mode]', {
      logLabel,
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
        console.warn(`[email:dev-fallback] EmailJS rejected ${logLabel}: ${details}`);
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
      console.warn(`[email:dev-fallback] EmailJS request failed for ${logLabel}: ${error.message}`);
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

export async function sendVerificationCodeEmail({
  email,
  name = '',
  code,
  purpose,
  expiresInMinutes,
  expiresInHours,
}) {
  const configStatus = ensureEmailConfig('verification');

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

  return sendEmailJsTemplate({
    templateId: EMAILJS_CONFIG.templateId,
    templateParams,
    logLabel: `${purpose} email`,
  });
}

export async function sendNotificationEmail({
  email,
  type,
  status,
  name,
  itemOrServiceOrDesign,
  date,
  time,
  location,
  businessName,
  contactInfo,
}) {
  const configStatus = ensureEmailConfig('notification');

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

  const payload = buildNotificationEmailPayload({
    type,
    status,
    name,
    itemOrServiceOrDesign,
    date,
    time,
    location,
    businessName,
    contactInfo,
  });

  const templateParams = {
    to_email: email,
    email,
    type,
    status,
    subject: payload.subject,
    name: payload.name,
    message_body: payload.message_body,
    details: payload.details,
    date: payload.date,
    time: payload.time,
    location: payload.location,
    business_name: payload.business_name,
    contact_info: payload.contact_info,
    from_name: EMAILJS_CONFIG.fromName,
  };

  return sendEmailJsTemplate({
    templateId: EMAILJS_CONFIG.notificationTemplateId,
    templateParams,
    logLabel: `${type}:${status} notification`,
  });
}