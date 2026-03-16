import CustomerAccount from '../models/Customer.js';
import CustomerDetail from '../models/CustomerDetail.js';

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

    res.json(safeCustomer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update customer profile
export const updateCustomer = async (req, res) => {
  try {
    const email = req.user.email;
    const customer = await CustomerAccount.findOne({ email });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Update allowed fields
    const allowedFields = ['firstName', 'lastName', 'phoneNumber', 'address', 'preferredBranch'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'phoneNumber') {
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
        } else if (field === 'address') {
          customer.address = String(req.body.address || '').trim();
        } else {
          customer[field] = req.body[field];
        }
      }
    }

    const updatedCustomer = await customer.save();

    // Keep legacy detail collection in sync; create it if missing.
    await CustomerDetail.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          firstName: updatedCustomer.firstName,
          lastName: updatedCustomer.lastName,
          phoneNumber: updatedCustomer.phoneNumber,
          address: updatedCustomer.address || '',
        },
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
    res.json(safeCustomer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Reset customer data (development only - requires admin)
export const resetCustomerData = async (req, res) => {
  try {
    // Only allow admins to reset customer data
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required for this operation' });
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