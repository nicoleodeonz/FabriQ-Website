import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import AdminAccount from '../models/Admin.js';
import CustomerAccount from '../models/Customer.js';
import AdminAction from '../models/AdminAction.js';
import StaffAccount from '../models/Staff.js';
import { isElevatedRole } from '../utils/roles.js';
import { sendVerificationCodeEmail } from '../services/emailService.js';
import { sendVerificationAcrossChannels } from '../services/messageDeliveryService.js';
import {
  isSmsConfigError,
  isSmsPhoneNumberError,
  sendPhoneVerificationCode,
} from '../services/smsService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SIGNUP_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const PHONE_VERIFICATION_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const IS_PRODUCTION = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';
const pendingSignups = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function buildStrongPasswordErrors(password) {
  const value = String(password || '');
  const errors = [];

  if (value.length < 8) errors.push('Password must be at least 8 characters long.');
  if (!/[a-z]/.test(value)) errors.push('Password must include at least one lowercase letter.');
  if (!/[A-Z]/.test(value)) errors.push('Password must include at least one uppercase letter.');
  if (!/\d/.test(value)) errors.push('Password must include at least one number.');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('Password must include at least one special character.');

  return errors;
}

async function findAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const [adminAccount, staffAccount, customerAccount] = await Promise.all([
    AdminAccount.findOne({ email: normalizedEmail }),
    StaffAccount.findOne({ email: normalizedEmail }),
    CustomerAccount.findOne({ email: normalizedEmail })
  ]);

  if (adminAccount) return { account: adminAccount, role: 'admin' };
  if (staffAccount) return { account: staffAccount, role: 'staff' };
  if (customerAccount) return { account: customerAccount, role: 'customer' };

  return { account: null, role: '' };
}

function clearResetFields(account) {
  account.resetPasswordCodeHash = null;
  account.resetPasswordCodeExpiresAt = null;
  account.resetPasswordVerifiedAt = null;
  account.resetPasswordSentAt = null;
}

function buildCodeDeliveryMessage(baseMessage, codeDeliveryResult, code, codeLabel) {
  return baseMessage;
}

function buildAdminName(email) {
  const prefix = String(email || '').split('@')[0] || 'Admin';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Admin';
}

function buildElevatedDisplayName(user, role = 'admin') {
  const normalizedRole = String(role || '').toLowerCase();
  const firstName = String(user?.firstName || '').trim();
  const lastName = String(user?.lastName || '').trim();
  const fallbackFirstName = buildAdminName(user?.email);
  const fallbackLastName = normalizedRole === 'staff' ? 'Staff' : 'Admin';
  const fullName = `${firstName || fallbackFirstName} ${lastName || ''}`.trim();

  if (fullName) {
    return fullName;
  }

  return `${fallbackFirstName} ${fallbackLastName}`.trim();
}

function clearPhoneVerificationCode(account) {
  account.phoneVerificationCodeHash = null;
  account.phoneVerificationExpiresAt = null;
  account.phoneVerificationSentAt = null;
}

function clearPhoneVerificationState(account) {
  account.phoneVerified = false;
  account.phoneVerifiedAt = null;
  clearPhoneVerificationCode(account);
}

function mapSmsVerificationError(error) {
  if (isSmsConfigError(error)) {
    const missingKeys = Array.isArray(error?.missingKeys) ? error.missingKeys.join(', ') : '';

    return {
      status: 503,
      message: missingKeys
        ? `SMS verification is not configured on the server yet. Missing or placeholder values: ${missingKeys}.`
        : 'SMS verification is not configured on the server yet.',
    };
  }

  const status = Number(error?.status || 0);
  const code = Number(error?.code || 0);

  if (status === 429) {
    return { status: 429, message: 'Too many verification attempts. Please wait before trying again.' };
  }

  if (isSmsPhoneNumberError(error)) {
    return { status: 400, message: 'The mobile number is not valid for SMS delivery.' };
  }

  if (status >= 400 && status < 500) {
    return { status, message: 'SMS delivery failed. Please verify the mobile number and try again.' };
  }

  if (code === 60200 || code === 60202 || code === 20404) {
    return { status: 400, message: 'Invalid or expired verification code.' };
  }

  return { status: 500, message: 'Phone verification failed. Please try again.' };
}

function getElevatedProfile(user, role) {
  const normalizedRole = String(role || '').toLowerCase();
  const fallbackFirstName = buildAdminName(user?.email);
  const fallbackLastName = normalizedRole === 'staff' ? 'Staff' : 'Admin';

  return {
    firstName: String(user?.firstName || '').trim() || fallbackFirstName,
    lastName: String(user?.lastName || '').trim() || fallbackLastName,
    phoneNumber: String(user?.phoneNumber || '').trim(),
    address: String(user?.address || '').trim(),
    preferredBranch: String(user?.preferredBranch || '').trim() || 'Taguig Main - Cadena de Amor'
  };
}

async function logAdminAuthAction(user, action, details = null, role = 'admin') {
  try {
    const normalizedRole = String(role || '').toLowerCase();
    if (!user || !isElevatedRole(normalizedRole)) {
      return;
    }

    const adminId = String(user._id || user.id || '');
    const adminEmail = String(user.email || '').trim().toLowerCase();

    await AdminAction.create({
      adminId,
      adminEmail,
      adminLabel: buildElevatedDisplayName(user, normalizedRole),
      action,
      targetUserId: '',
      targetRole: normalizedRole,
      details,
    });
  } catch (error) {
    console.error('auth logAdminAuthAction error:', error);
  }
}

// Normalize various phone input shapes to +63XXXXXXXXXX
const normalizePhone = (input) => {
  if (!input && input !== '') return input;
  let s = String(input || '').replace(/\D/g, '');
  if (s.length === 0) return undefined;
  // remove leading 0
  if (s.startsWith('0')) s = s.slice(1);
  // remove leading country code 63
  if (s.startsWith('63')) s = s.slice(2);
  // take last 10 digits
  s = s.slice(-10);
  if (s.length !== 10) return undefined;
  return '+63' + s;
};

async function validatePendingCustomerEligibility(normalizedEmail, existingCustomerAccount = null) {
  const existingElevated = await Promise.all([
    AdminAccount.findOne({ email: normalizedEmail }).lean(),
    StaffAccount.findOne({ email: normalizedEmail }).lean(),
  ]);

  if (existingElevated[0] || existingElevated[1]) {
    return { status: 409, message: 'Account already exists. Please log in instead.' };
  }

  if (existingCustomerAccount && existingCustomerAccount.status !== 'pending_verification') {
    return { status: 409, message: 'Account already exists. Please log in instead.' };
  }

  return null;
}

async function ensureUniqueCustomerPhone(normalizedPhone, excludedCustomerId = null) {
  if (!normalizedPhone) {
    return null;
  }

  const existingPhone = await CustomerAccount.findOne({
    phoneNumber: normalizedPhone,
    ...(excludedCustomerId ? { _id: { $ne: excludedCustomerId } } : {}),
  }).lean();

  if (existingPhone) {
    return { status: 409, message: 'This phone number is already registered.' };
  }

  return null;
}

async function buildPendingCustomerFromSignup({ firstName, lastName, email, password, phoneNumber }) {
  if (!firstName || !lastName || !email || !password || !String(phoneNumber || '').trim()) {
    return { error: { status: 400, message: 'Missing required fields.' } };
  }

  const normalizedEmail = normalizeEmail(email);
  const passwordErrors = buildStrongPasswordErrors(password);
  if (passwordErrors.length > 0) {
    return {
      error: {
        status: 400,
        message: 'Password does not meet the required strength rules.',
        errors: passwordErrors,
      },
    };
  }

  const normalizedPhone = normalizePhone(phoneNumber);
  if (!normalizedPhone) {
    return { error: { status: 400, message: 'Invalid phone number format. Must be 10 digits.' } };
  }
  if (!normalizedPhone.startsWith('+639')) {
    return { error: { status: 400, message: 'Phone number must start with 9.' } };
  }

  const existingCustomerAccount = await CustomerAccount.findOne({ email: normalizedEmail });
  const eligibilityError = await validatePendingCustomerEligibility(normalizedEmail, existingCustomerAccount);
  if (eligibilityError) {
    return { error: eligibilityError };
  }

  const phoneConflict = await ensureUniqueCustomerPhone(
    normalizedPhone,
    existingCustomerAccount ? existingCustomerAccount._id : null,
  );
  if (phoneConflict) {
    return { error: phoneConflict };
  }

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    password,
    existingCustomerAccount,
    normalizedEmail,
    normalizedPhone,
  };
}

function createPendingSignup(data) {
  const token = crypto.randomBytes(32).toString('hex');
  pendingSignups.set(token, {
    ...data,
    expiresAt: Date.now() + SIGNUP_CODE_TTL_MS,
  });
  setTimeout(() => pendingSignups.delete(token), SIGNUP_CODE_TTL_MS).unref?.();
  return token;
}

function getPendingSignup(token) {
  const pendingSignup = pendingSignups.get(String(token || ''));
  if (!pendingSignup || pendingSignup.expiresAt < Date.now()) {
    if (token) pendingSignups.delete(String(token));
    return null;
  }
  return pendingSignup;
}

export const sendSignUpPhoneVerificationCode = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    const pendingResult = await buildPendingCustomerFromSignup({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
    });

    if (pendingResult.error) {
      const { status, message, errors } = pendingResult.error;
      return res.status(status).json(errors ? { message, errors } : { message });
    }

    const { normalizedEmail, normalizedPhone } = pendingResult;

    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Enter a valid mobile number before requesting verification.' });
    }

    const requestedToken = String(req.body?.signupToken || '');
    let signupToken = requestedToken;
    let pendingSignup = requestedToken ? getPendingSignup(requestedToken) : null;

    if (pendingSignup && (pendingSignup.email !== normalizedEmail || pendingSignup.phoneNumber !== normalizedPhone)) {
      pendingSignup = null;
      signupToken = '';
    }

    if (!pendingSignup) {
      signupToken = createPendingSignup({
        firstName: pendingResult.firstName,
        lastName: pendingResult.lastName,
        email: normalizedEmail,
        password: pendingResult.password,
        phoneNumber: normalizedPhone,
        phoneVerified: false,
      });
      pendingSignup = getPendingSignup(signupToken);
    }

    if (pendingSignup.phoneVerified) {
      return res.json({
        message: 'This mobile number is already verified.',
        phoneNumber: normalizedPhone,
        verified: true,
        signupToken,
      });
    }

    const code = generateCode();
    pendingSignup.phoneVerificationCodeHash = hashCode(code);
    pendingSignup.phoneVerificationExpiresAt = Date.now() + PHONE_VERIFICATION_TTL_MS;
    pendingSignup.phoneVerificationSentAt = Date.now();

    try {
      await sendPhoneVerificationCode(normalizedPhone, code);
    } catch (error) {
      pendingSignup.phoneVerificationCodeHash = null;
      pendingSignup.phoneVerificationExpiresAt = null;
      pendingSignup.phoneVerificationSentAt = null;
      throw error;
    }

    return res.json({
      message: 'Verification code sent successfully.',
      phoneNumber: normalizedPhone,
      verified: false,
      signupToken,
    });
  } catch (error) {
    console.error('sendSignUpPhoneVerificationCode error:', error);
    const mappedError = mapSmsVerificationError(error);
    return res.status(mappedError.status).json({ message: mappedError.message });
  }
};

export const verifySignUpPhoneVerificationCode = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    const signupToken = String(req.body?.signupToken || '');

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit verification code.' });
    }

    const pendingSignup = getPendingSignup(signupToken);
    if (!pendingSignup || pendingSignup.email !== normalizedEmail) {
      return res.status(404).json({ message: 'No pending signup was found for this email.' });
    }

    if (!pendingSignup.phoneNumber) {
      return res.status(400).json({ message: 'Add a mobile number before verifying it.' });
    }

    if (pendingSignup.phoneVerified) {
      return res.json({
        message: 'This mobile number is already verified.',
        phoneNumber: pendingSignup.phoneNumber,
        verified: true,
        signupToken,
      });
    }

    if (!pendingSignup.phoneVerificationCodeHash || !pendingSignup.phoneVerificationExpiresAt) {
      return res.status(400).json({ message: 'Request a verification code before verifying your mobile number.' });
    }

    if (pendingSignup.phoneVerificationExpiresAt < Date.now()) {
      pendingSignup.phoneVerificationCodeHash = null;
      pendingSignup.phoneVerificationExpiresAt = null;
      pendingSignup.phoneVerificationSentAt = null;
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    if (hashCode(code) !== pendingSignup.phoneVerificationCodeHash) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    pendingSignup.phoneVerified = true;
    pendingSignup.phoneVerifiedAt = new Date();
    pendingSignup.phoneVerificationCodeHash = null;
    pendingSignup.phoneVerificationExpiresAt = null;
    pendingSignup.phoneVerificationSentAt = null;

    return res.json({
      message: 'Mobile number verified successfully.',
      phoneNumber: pendingSignup.phoneNumber,
      verified: true,
      signupToken,
    });
  } catch (error) {
    console.error('verifySignUpPhoneVerificationCode error:', error);
    const mappedError = mapSmsVerificationError(error);
    return res.status(mappedError.status).json({ message: mappedError.message });
  }
};

const generateToken = (user) => {
  // Accept both Mongoose documents (with _id) and plain objects (with id)
  const id = user._id || user.id;
  return jwt.sign(
    {
      id,
      email: user.email,
      role: user.role,
      tokenVersion: Number(user.tokenVersion || 0)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export const signUp = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, signupToken } = req.body;

    const pendingResult = await buildPendingCustomerFromSignup({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
    });

    if (pendingResult.error) {
      const { status, message, errors } = pendingResult.error;
      return res.status(status).json(errors ? { message, errors } : { message });
    }

    const { normalizedEmail, normalizedPhone } = pendingResult;
    const pendingSignup = getPendingSignup(signupToken);

    if (!pendingSignup || pendingSignup.email !== normalizedEmail || pendingSignup.phoneNumber !== normalizedPhone) {
      return res.status(400).json({ message: 'Your signup session expired. Please verify your mobile number again.' });
    }

    if (normalizedPhone && !pendingSignup.phoneVerified) {
      return res.status(400).json({ message: 'Verify your mobile number before creating your account.' });
    }

    const signupCode = generateCode();
    const signupVerificationCodeHash = hashCode(signupCode);
    const signupVerificationExpiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MS);
    const signupVerificationSentAt = new Date();
    pendingSignup.signupVerificationCodeHash = signupVerificationCodeHash;
    pendingSignup.signupVerificationExpiresAt = signupVerificationExpiresAt.getTime();
    pendingSignup.signupVerificationSentAt = signupVerificationSentAt.getTime();

    let codeDeliveryResult;
    try {
      codeDeliveryResult = await sendVerificationCodeEmail({
        email: normalizedEmail,
        name: `${pendingSignup.firstName} ${pendingSignup.lastName}`,
        code: signupCode,
        purpose: 'account_verification',
        expiresInHours: 24,
      });
    } catch (deliveryError) {
      console.error('Signup verification email delivery error:', deliveryError);
      return res.status(503).json({
        message: 'Unable to send the verification email right now. Please try again in a moment.',
      });
    }

    res.status(200).json({
      message: buildCodeDeliveryMessage(
        'Verification code sent. Please check your email to complete signup.',
        codeDeliveryResult,
        signupCode,
        'verification code'
      ),
      email: normalizedEmail,
      expiresInMinutes: 24 * 60,
      signupToken,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Failed to start signup.' });
  }
};

export const verifySignUp = async (req, res) => {
  try {
    const { email, code, signupToken } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const pendingSignup = getPendingSignup(signupToken);
    if (!pendingSignup || pendingSignup.email !== normalizedEmail) {
      return res.status(404).json({ message: 'No pending signup was found for this email.' });
    }

    if (!pendingSignup.signupVerificationCodeHash || !pendingSignup.signupVerificationExpiresAt) {
      return res.status(400).json({ message: 'No signup verification code is active. Please request a new code.' });
    }

    if (pendingSignup.signupVerificationExpiresAt < Date.now()) {
      pendingSignup.signupVerificationCodeHash = null;
      pendingSignup.signupVerificationExpiresAt = null;
      pendingSignup.signupVerificationSentAt = null;
      return res.status(400).json({ message: 'The verification code has expired. Please request a new one.' });
    }

    if (pendingSignup.signupVerificationCodeHash !== hashCode(code)) {
      return res.status(400).json({ message: 'The verification code is incorrect.' });
    }

    const existingCustomerAccount = await CustomerAccount.findOne({ email: normalizedEmail });
    if (existingCustomerAccount && existingCustomerAccount.status !== 'pending_verification') {
      return res.status(409).json({ message: 'Account already exists. Please log in instead.' });
    }
    if (existingCustomerAccount) await CustomerAccount.deleteOne({ _id: existingCustomerAccount._id });

    const customerAccount = new CustomerAccount({
      firstName: pendingSignup.firstName,
      lastName: pendingSignup.lastName,
      email: pendingSignup.email,
      password: pendingSignup.password,
      phoneNumber: pendingSignup.phoneNumber,
      phoneVerified: pendingSignup.phoneVerified,
      phoneVerifiedAt: pendingSignup.phoneVerifiedAt || null,
      status: 'active',
      preferredBranch: 'Taguig Main - Cadena de Amor',
      address: '',
    });
    await customerAccount.save();
    pendingSignups.delete(String(signupToken));

    const token = generateToken({
      id: customerAccount._id,
      email: customerAccount.email,
      role: 'customer',
      tokenVersion: customerAccount.tokenVersion,
    });

    return res.json({
      user: {
        id: customerAccount._id,
        firstName: customerAccount.firstName,
        lastName: customerAccount.lastName,
        email: customerAccount.email,
        role: 'customer',
        phoneNumber: customerAccount.phoneNumber,
        phoneVerified: Boolean(customerAccount.phoneVerified),
        phoneVerifiedAt: customerAccount.phoneVerifiedAt,
        address: customerAccount.address,
        preferredBranch: customerAccount.preferredBranch,
      },
      token,
    });
  } catch (error) {
    console.error('Verify signup error:', error);
    return res.status(500).json({ message: 'Failed to verify signup.' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);

    // Check elevated accounts first, then customer_accounts.
    let user = await AdminAccount.findOne({ email: normalizedEmail });
    let role = 'admin';

    if (!user) {
      user = await StaffAccount.findOne({ email: normalizedEmail });
      if (user) {
        role = 'staff';
      }
    }

    if (!user) {
      user = await CustomerAccount.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({ message: 'Account isn\'t registered yet, please create an account.' });
      }
      role = 'customer';
    }

    if (user.status === 'pending_verification') {
      return res.status(403).json({ message: 'Please verify your email before logging in.' });
    }

    if (user.status === 'archived') {
      return res.status(403).json({ message: 'This account has been archived. Please contact support.' });
    }

    // Email exists, now check password
    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    if (isElevatedRole(role)) {
      await logAdminAuthAction(user, `${role}_login`, {
        status: 'success',
      }, role);
    }

    const token = generateToken({
      id: user._id,
      email: normalizedEmail,
      role,
      tokenVersion: user.tokenVersion
    });

    const elevatedProfile = isElevatedRole(role) ? getElevatedProfile(user, role) : null;

    res.json({
      user: {
        id: user._id,
        firstName: role === 'customer' ? user.firstName : elevatedProfile.firstName,
        lastName: role === 'customer' ? user.lastName : elevatedProfile.lastName,
        email: normalizedEmail,
        role,
        phoneNumber: role === 'customer' ? user.phoneNumber : elevatedProfile.phoneNumber,
        phoneVerified: role === 'customer' ? Boolean(user.phoneVerified) : false,
        phoneVerifiedAt: role === 'customer' ? user.phoneVerifiedAt : null,
        address: role === 'customer' ? user.address : elevatedProfile.address,
        preferredBranch: role === 'customer' ? user.preferredBranch : elevatedProfile.preferredBranch,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to log in.' });
  }
};

export const logout = async (req, res) => {
  try {
    if (isElevatedRole(req.user?.role)) {
      await logAdminAuthAction(req.user, `${req.user.role}_logout`, {
        status: 'success',
      }, req.user.role);
    }

    return res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'Failed to log out.' });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const elevatedProfile = isElevatedRole(user.role) ? getElevatedProfile(user, user.role) : null;

    res.json({
      user: {
        id: user._id,
        firstName: isElevatedRole(user.role) ? elevatedProfile.firstName : user.firstName,
        lastName: isElevatedRole(user.role) ? elevatedProfile.lastName : user.lastName,
        email: user.email,
        role: user.role,
        phoneNumber: isElevatedRole(user.role) ? elevatedProfile.phoneNumber : user.phoneNumber,
        phoneVerified: isElevatedRole(user.role) ? false : Boolean(user.phoneVerified),
        phoneVerifiedAt: isElevatedRole(user.role) ? null : user.phoneVerifiedAt,
        address: isElevatedRole(user.role) ? elevatedProfile.address : user.address,
        preferredBranch: isElevatedRole(user.role) ? elevatedProfile.preferredBranch : user.preferredBranch,
        mustChangePassword: Boolean(user.mustChangePassword),
      }
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ message: 'Could not retrieve user.' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    const passwordErrors = buildStrongPasswordErrors(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        message: 'New password does not meet the required strength rules.',
        errors: passwordErrors,
      });
    }

    let account = null;

    if (req.user.role === 'admin') {
      account = await AdminAccount.findById(req.user.id);
    } else if (req.user.role === 'staff') {
      account = await StaffAccount.findById(req.user.id);
    } else {
      account = await CustomerAccount.findById(req.user.id);
    }

    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const isCurrentPasswordValid = await account.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    const isSamePassword = await account.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password cannot be the same as the current password.' });
    }

    account.password = newPassword;
    account.tokenVersion = Number(account.tokenVersion || 0) + 1;
    if (typeof account.mustChangePassword !== 'undefined') {
      account.mustChangePassword = false;
    }
    clearResetFields(account);
    await account.save();

    return res.json({
      message: 'Password updated successfully. Please log in again.',
      requireReauth: true
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Failed to update password.' });
  }
};

export const verifyCurrentPassword = async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ message: 'Current password is required.' });
    }

    let account = null;

    if (req.user.role === 'admin') {
      account = await AdminAccount.findById(req.user.id);
    } else if (req.user.role === 'staff') {
      account = await StaffAccount.findById(req.user.id);
    } else {
      account = await CustomerAccount.findById(req.user.id);
    }

    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const isValid = await account.comparePassword(currentPassword);
    return res.json({ isValid });
  } catch (error) {
    console.error('Verify current password error:', error);
    return res.status(500).json({ message: 'Failed to verify current password.' });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const { account } = await findAccountByEmail(normalizedEmail);

    if (account && account.status !== 'archived') {
      const resetCode = generateCode();
      account.resetPasswordCodeHash = hashCode(resetCode);
      account.resetPasswordCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
      account.resetPasswordVerifiedAt = null;
      account.resetPasswordSentAt = new Date();
      await account.save();

      const codeDeliveryResult = await sendVerificationCodeEmail({
        email: normalizedEmail,
        name: `${account.firstName || ''} ${account.lastName || ''}`,
        code: resetCode,
        purpose: 'password_reset',
        expiresInMinutes: 15,
      });

      const smsDeliveryResult = await sendVerificationAcrossChannels({
        phoneNumber: account.phoneNumber || '',
        code: resetCode,
        purpose: 'password_reset',
        expiresInMinutes: 15,
      });

      if (!smsDeliveryResult?.delivered && !smsDeliveryResult?.skipped) {
        console.warn('Password reset SMS was not delivered:', smsDeliveryResult);
      }

      const message = buildCodeDeliveryMessage(
        'If an account exists for that email, a reset code has been sent.',
        codeDeliveryResult,
        resetCode,
        'reset code'
      );

      return res.json({
        message,
        email: normalizedEmail,
        expiresInMinutes: 15,
      });
    }

    return res.json({
      message: 'If an account exists for that email, a reset code has been sent.',
      email: normalizedEmail,
      expiresInMinutes: 15,
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    return res.status(500).json({ message: 'Failed to start password reset.' });
  }
};

export const verifyPasswordResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and reset code are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const { account } = await findAccountByEmail(normalizedEmail);

    if (!account || !account.resetPasswordCodeHash || !account.resetPasswordCodeExpiresAt) {
      return res.status(400).json({ message: 'The reset code is invalid or has expired.' });
    }

    if (account.resetPasswordCodeExpiresAt.getTime() < Date.now()) {
      clearResetFields(account);
      await account.save();
      return res.status(400).json({ message: 'The reset code has expired. Please request a new one.' });
    }

    if (account.resetPasswordCodeHash !== hashCode(code)) {
      return res.status(400).json({ message: 'The reset code is incorrect.' });
    }

    account.resetPasswordVerifiedAt = new Date();
    await account.save();

    return res.json({
      message: 'Reset code verified successfully.',
      verified: true,
    });
  } catch (error) {
    console.error('Verify password reset code error:', error);
    return res.status(500).json({ message: 'Failed to verify the reset code.' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, reset code, and new password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const { account } = await findAccountByEmail(normalizedEmail);

    if (!account || !account.resetPasswordCodeHash || !account.resetPasswordCodeExpiresAt) {
      return res.status(400).json({ message: 'The reset code is invalid or has expired.' });
    }

    if (account.resetPasswordCodeExpiresAt.getTime() < Date.now()) {
      clearResetFields(account);
      await account.save();
      return res.status(400).json({ message: 'The reset code has expired. Please request a new one.' });
    }

    if (account.resetPasswordCodeHash !== hashCode(code)) {
      return res.status(400).json({ message: 'The reset code is incorrect.' });
    }

    const passwordErrors = buildStrongPasswordErrors(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        message: 'New password does not meet the required strength rules.',
        errors: passwordErrors,
      });
    }

    const isSamePassword = await account.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password cannot be the same as the current password.' });
    }

    account.password = newPassword;
    account.tokenVersion = Number(account.tokenVersion || 0) + 1;
    clearResetFields(account);
    await account.save();

    return res.json({
      message: 'Password reset successfully. Please log in with your new password.',
      requireReauth: true,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Failed to reset password.' });
  }
};
