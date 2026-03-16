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
    const customer = await CustomerDetail.findOne({ email });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update customer profile
export const updateCustomer = async (req, res) => {
  try {
    const email = req.user.email;
    const customer = await CustomerDetail.findOne({ email });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Update allowed fields
    const allowedFields = ['firstName', 'lastName', 'phoneNumber', 'address'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'phoneNumber') {
          const normalized = normalizePhone(req.body.phoneNumber);
          if (normalized) customer.phoneNumber = normalized;
        } else {
          customer[field] = req.body[field];
        }
      }
    });

    const updatedCustomer = await customer.save();
    res.json(updatedCustomer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};