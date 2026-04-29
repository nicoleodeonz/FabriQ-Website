import crypto from 'crypto';
import CustomerAccount from '../models/Customer.js';
import CustomerDetail from '../models/CustomerDetail.js';
import AdminAccount from '../models/Admin.js';
import StaffAccount from '../models/Staff.js';
import {
  isSmsConfigError,
  isSmsPhoneNumberError,
  sendPhoneVerificationCode,
} from '../services/smsService.js';
import { sendPhoneVerifiedCongratulations } from '../services/messageDeliveryService.js';
import { isElevatedRole } from '../utils/roles.js';
import { toPublicUrl } from '../utils/media.js';

const PHONE_VERIFICATION_TTL_MS = 10 * 60 * 1000;

function sanitizeFavoriteGowns(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.name || '').trim(),
      category: String(item?.category || '').trim(),
      color: String(item?.color || '').trim(),
      size: Array.isArray(item?.size) ? item.size.map((size) => String(size || '').trim()).filter(Boolean) : [],
      price: Number(item?.price || 0),
      status: ['available', 'rented', 'reserved'].includes(String(item?.status || '').toLowerCase())
        ? String(item.status).toLowerCase()
        : 'available',
      branch: String(item?.branch || '').trim(),
      image: String(item?.image || '').trim(),
      rating: Number(item?.rating || 0),
    }))
    .filter((item) => item.id && item.name)
    .map((item) => ({
      ...item,
      price: Number.isFinite(item.price) ? item.price : 0,
      rating: Number.isFinite(item.rating) ? item.rating : 0,
    }));
}

function normalizeFavoriteGownImages(req, favoriteGowns) {
  if (!Array.isArray(favoriteGowns)) {
    return [];
  }

  return favoriteGowns.map((gown) => ({
    ...gown,
    image: toPublicUrl(req, gown?.image),
  }));
}

async function ensureCustomerDetail(customer) {
  let detail = await CustomerDetail.findOne({ email: customer.email });

  if (!detail) {
    detail = new CustomerDetail({
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phoneNumber: customer.phoneNumber,
      phoneVerified: Boolean(customer.phoneVerified),
      phoneVerifiedAt: customer.phoneVerifiedAt || null,
      address: customer.address || '',
      favoriteGowns: [],
    });
  }

  return detail;
}

function buildElevatedName(email) {
  const prefix = String(email || '').split('@')[0] || 'Admin';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Admin';
}

function getElevatedModel(role) {
  return String(role || '').toLowerCase() === 'staff' ? StaffAccount : AdminAccount;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function clearPhoneVerificationCode(customer) {
  customer.phoneVerificationCodeHash = null;
  customer.phoneVerificationExpiresAt = null;
  customer.phoneVerificationSentAt = null;
}

function mapElevatedProfile(account, role) {
  const fallbackFirstName = buildElevatedName(account?.email);
  const fallbackLastName = String(role || '').toLowerCase() === 'staff' ? 'Staff' : 'Admin';

  return {
    id: account._id,
    firstName: String(account.firstName || '').trim() || fallbackFirstName,
    lastName: String(account.lastName || '').trim() || fallbackLastName,
    email: account.email,
    phoneNumber: String(account.phoneNumber || '').trim(),
    phoneVerified: false,
    phoneVerifiedAt: null,
    address: String(account.address || '').trim(),
    preferredBranch: String(account.preferredBranch || '').trim() || 'Taguig Main - Cadena de Amor',
    role,
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
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

// Get customer profile by email (from authenticated user)
export const getCustomer = async (req, res) => {
  try {
    const email = req.user.email;

    if (isElevatedRole(req.user.role)) {
      const ElevatedModel = getElevatedModel(req.user.role);
      const elevatedAccount = await ElevatedModel.findOne({ email }).lean();

      if (!elevatedAccount) {
        return res.status(404).json({ message: 'Profile not found' });
      }

      return res.json(mapElevatedProfile(elevatedAccount, req.user.role));
    }

    const customer = await CustomerAccount.findOne({ email });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Merge with customer details if they exist
    const details = await CustomerDetail.findOne({ email });
    const mergedCustomer = details
      ? { ...customer.toObject(), ...details.toObject() }
      : customer.toObject();

    // Do not return sensitive fields like password
    const { password, __v, ...safeCustomer } = mergedCustomer;
    safeCustomer.favoriteGowns = normalizeFavoriteGownImages(req, safeCustomer.favoriteGowns);

    res.json(safeCustomer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update customer profile
export const updateCustomer = async (req, res) => {
  try {
    const email = req.user.email;

    if (isElevatedRole(req.user.role)) {
      const ElevatedModel = getElevatedModel(req.user.role);
      const elevatedAccount = await ElevatedModel.findOne({ email });

      if (!elevatedAccount) {
        return res.status(404).json({ message: 'Profile not found' });
      }

      const allowedFields = ['firstName', 'lastName', 'phoneNumber', 'address', 'preferredBranch'];

      for (const field of allowedFields) {
        if (req.body[field] === undefined) continue;

        if (field === 'phoneNumber') {
          if (!req.body.phoneNumber) {
            elevatedAccount.phoneNumber = '';
            continue;
          }

          const normalized = normalizePhone(req.body.phoneNumber);
          if (!normalized) {
            return res.status(400).json({ message: 'Invalid phone number format. Must be 10 digits.' });
          }
          if (!normalized.startsWith('+639')) {
            return res.status(400).json({ message: 'Phone number must start with 9.' });
          }

          elevatedAccount.phoneNumber = normalized;
        } else if (field === 'address') {
          elevatedAccount.address = String(req.body.address || '').trim();
        } else if (field === 'preferredBranch') {
          elevatedAccount.preferredBranch = String(req.body.preferredBranch || '').trim() || 'Taguig Main - Cadena de Amor';
        } else {
          elevatedAccount[field] = String(req.body[field] || '').trim();
        }
      }

      await elevatedAccount.save();
      return res.json(mapElevatedProfile(elevatedAccount.toObject(), req.user.role));
    }

    const customer = await CustomerAccount.findOne({ email });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Update allowed fields
    const allowedFields = ['firstName', 'lastName', 'phoneNumber', 'address', 'preferredBranch'];
    const currentPhoneNumber = String(customer.phoneNumber || '');
    let nextPhoneNumber = currentPhoneNumber;
    let shouldResetPhoneVerification = false;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'phoneNumber') {
          if (!req.body.phoneNumber) {
            if (currentPhoneNumber) {
              shouldResetPhoneVerification = true;
            }
            customer.phoneNumber = undefined;
            nextPhoneNumber = '';
            continue;
          }

          const normalized = normalizePhone(req.body.phoneNumber);
          if (!normalized) {
            return res.status(400).json({ message: 'Invalid phone number format. Must be 10 digits.' });
          }
          if (!normalized.startsWith('+639')) {
            return res.status(400).json({ message: 'Phone number must start with 9.' });
          }
          // Check if phone number already exists for another customer
          const existingPhone = await CustomerAccount.findOne({ phoneNumber: normalized, _id: { $ne: customer._id } });
          if (existingPhone) {
            return res.status(409).json({ message: 'This phone number is already registered.' });
          }
          customer.phoneNumber = normalized;
          nextPhoneNumber = normalized;
          if (normalized !== currentPhoneNumber) {
            shouldResetPhoneVerification = true;
          }
        } else if (field === 'address') {
          customer.address = String(req.body.address || '').trim();
        } else {
          customer[field] = req.body[field];
        }
      }
    }

    if (shouldResetPhoneVerification) {
      customer.phoneVerified = false;
      customer.phoneVerifiedAt = null;
      clearPhoneVerificationCode(customer);
    }

    const updatedCustomer = await customer.save();

    // Keep legacy detail collection in sync; create it if missing.
    const detailUpdate = {
      email,
      firstName: updatedCustomer.firstName,
      lastName: updatedCustomer.lastName,
      address: updatedCustomer.address || '',
    };

    if (updatedCustomer.phoneNumber) {
      detailUpdate.phoneNumber = updatedCustomer.phoneNumber;
    }

    detailUpdate.phoneVerified = Boolean(updatedCustomer.phoneVerified);
    detailUpdate.phoneVerifiedAt = updatedCustomer.phoneVerifiedAt || null;

    await CustomerDetail.findOneAndUpdate(
      { email },
      {
        $set: detailUpdate,
        ...((updatedCustomer.phoneNumber || nextPhoneNumber) ? {} : { $unset: { phoneNumber: 1 } }),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Return merged profile so frontend immediately reflects persisted values.
    const latestCustomer = await CustomerAccount.findOne({ email }).lean();
    const latestDetails = await CustomerDetail.findOne({ email }).lean();
    const mergedCustomer = latestDetails
      ? { ...latestCustomer, ...latestDetails }
      : latestCustomer;

    const { password, __v, ...safeCustomer } = mergedCustomer;
    safeCustomer.favoriteGowns = normalizeFavoriteGownImages(req, safeCustomer.favoriteGowns);
    res.json(safeCustomer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Reset customer data (development only - requires admin)
export const resetCustomerData = async (req, res) => {
  try {
    // Only allow admins to reset customer data
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Admin or staff access required for this operation' });
    }

    await CustomerAccount.deleteMany({});
    await CustomerDetail.deleteMany({});

    console.log('Customer data reset by admin:', req.user.email);
    res.json({ message: 'Customer data reset successfully' });
  } catch (error) {
    console.error('Error resetting customer data:', error);
    res.status(500).json({ message: 'Failed to reset customer data' });
  }
};

const MEASUREMENT_FIELDS = ['bust', 'waist', 'hips', 'height', 'shoulderWidth', 'sleeveLength'];

export const getMeasurements = async (req, res) => {
  try {
    const email = req.user.email;
    const detail = await CustomerDetail.findOne({ email });
    if (!detail) {
      return res.json(Object.fromEntries(MEASUREMENT_FIELDS.map(f => [f, null])));
    }
    const result = Object.fromEntries(MEASUREMENT_FIELDS.map(f => [f, detail[f] ?? null]));
    result.updatedAt = detail.updatedAt;
    return res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMeasurements = async (req, res) => {
  try {
    const email = req.user.email;
    const validData = {};

    const fieldRanges = {
      bust: { min: 0.1, max: 99, unit: 'inches' },
      waist: { min: 0.1, max: 99, unit: 'inches' },
      hips: { min: 0.1, max: 99, unit: 'inches' },
      height: { min: 50, max: 250, unit: 'cm' },
      shoulderWidth: { min: 0.1, max: 99, unit: 'inches' },
      sleeveLength: { min: 0.1, max: 99, unit: 'inches' },
    };

    for (const field of MEASUREMENT_FIELDS) {
      const val = req.body[field];
      if (val === undefined) continue;
      if (val === null || val === '') {
        validData[field] = null;
        continue;
      }
      const num = Number(val);
      const { min, max, unit } = fieldRanges[field];
      if (isNaN(num) || num < min) {
        return res.status(400).json({ message: `Invalid value for ${field}. Must be a positive number (min ${min} ${unit}).` });
      }
      if (num > max) {
        return res.status(400).json({ message: `Value for ${field} is too large (max ${max} ${unit}).` });
      }
      validData[field] = num;
    }

    const customer = await CustomerAccount.findOne({ email });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    let detail = await CustomerDetail.findOne({ email });
    if (!detail) {
      detail = new CustomerDetail({
        email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phoneNumber: customer.phoneNumber,
        address: customer.address || ''
      });
    }

    for (const [key, value] of Object.entries(validData)) {
      detail[key] = value;
    }
    detail.updatedAt = new Date();
    await detail.save();

    const measurements = Object.fromEntries(MEASUREMENT_FIELDS.map(f => [f, detail[f] ?? null]));
    return res.json({ message: 'Measurements saved successfully.', measurements, updatedAt: detail.updatedAt });
  } catch (error) {
    console.error('Update measurements error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const updateFavoriteGowns = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customer accounts can manage favorites.' });
    }

    const customer = await CustomerAccount.findOne({ email: req.user.email });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const favoriteGowns = sanitizeFavoriteGowns(req.body.favoriteGowns);
    const detail = await ensureCustomerDetail(customer);
    detail.favoriteGowns = favoriteGowns;
    detail.updatedAt = new Date();
    await detail.save();

    return res.json({ favoriteGowns: normalizeFavoriteGownImages(req, detail.favoriteGowns) });
  } catch (error) {
    console.error('Update favorite gowns error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update favorites.' });
  }
};

function buildSafeCustomerProfile(accountDoc, detailDoc = null) {
  const mergedCustomer = detailDoc
    ? { ...accountDoc, ...detailDoc }
    : accountDoc;

  const { password, __v, ...safeCustomer } = mergedCustomer;
  return safeCustomer;
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
    return { status: 400, message: 'The saved phone number is not valid for SMS delivery.' };
  }

  if (status >= 400 && status < 500) {
    return { status, message: 'SMS delivery failed. Please verify the phone number and try again.' };
  }

  if (code === 60200 || code === 60202 || code === 20404) {
    return { status: 400, message: 'Invalid or expired verification code.' };
  }

  return { status: 500, message: 'Phone verification failed. Please try again.' };
}

export const sendCustomerPhoneVerificationCode = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can verify phone numbers.' });
    }

    const customer = await CustomerAccount.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    if (!customer.phoneNumber) {
      return res.status(400).json({ message: 'Add a phone number to your profile before requesting a verification code.' });
    }

    if (customer.phoneVerified) {
      return res.status(400).json({ message: 'This phone number is already verified.' });
    }

    const code = generateCode();
    customer.phoneVerificationCodeHash = hashCode(code);
    customer.phoneVerificationExpiresAt = new Date(Date.now() + PHONE_VERIFICATION_TTL_MS);
    customer.phoneVerificationSentAt = new Date();
    await customer.save();

    try {
      await sendPhoneVerificationCode(customer.phoneNumber, code);
    } catch (error) {
      clearPhoneVerificationCode(customer);
      await customer.save();
      throw error;
    }

    return res.json({
      message: 'Verification code sent successfully.',
      phoneNumber: customer.phoneNumber,
    });
  } catch (error) {
    console.error('sendCustomerPhoneVerificationCode error:', error);
    const mappedError = mapSmsVerificationError(error);
    return res.status(mappedError.status).json({ message: mappedError.message });
  }
};

export const verifyCustomerPhoneVerificationCode = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can verify phone numbers.' });
    }

    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit verification code.' });
    }

    const customer = await CustomerAccount.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    if (!customer.phoneNumber) {
      return res.status(400).json({ message: 'Add a phone number to your profile before verifying it.' });
    }

    if (!customer.phoneVerificationCodeHash || !customer.phoneVerificationExpiresAt) {
      return res.status(400).json({ message: 'Request a verification code before verifying your phone number.' });
    }

    if (new Date(customer.phoneVerificationExpiresAt).getTime() < Date.now()) {
      clearPhoneVerificationCode(customer);
      await customer.save();
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    if (hashCode(code) !== customer.phoneVerificationCodeHash) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    customer.phoneVerified = true;
    customer.phoneVerifiedAt = new Date();
    clearPhoneVerificationCode(customer);
    await customer.save();

    const detail = await CustomerDetail.findOneAndUpdate(
      { email: customer.email },
      {
        $set: {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phoneNumber: customer.phoneNumber,
          phoneVerified: true,
          phoneVerifiedAt: customer.phoneVerifiedAt,
          address: customer.address || '',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    try {
      const deliveryResult = await sendPhoneVerifiedCongratulations({
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer',
      });

      if (!deliveryResult?.email?.delivered && !deliveryResult?.sms?.delivered) {
        console.warn('phone verification congratulations not delivered:', deliveryResult);
      }
    } catch (notificationError) {
      console.error('phone verification congratulations error:', notificationError);
    }

    return res.json({
      message: 'Phone number verified successfully.',
      customer: buildSafeCustomerProfile(customer.toObject(), detail),
    });
  } catch (error) {
    console.error('verifyCustomerPhoneVerificationCode error:', error);
    const mappedError = mapSmsVerificationError(error);
    return res.status(mappedError.status).json({ message: mappedError.message });
  }
};