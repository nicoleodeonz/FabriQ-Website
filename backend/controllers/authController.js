import jwt from 'jsonwebtoken';
import AdminAccount from '../models/Admin.js';
import CustomerAccount from '../models/Customer.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    if (!firstName || !lastName || !email || !password || !phoneNumber) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if email already exists in customer_accounts
    const existingCustomerAccount = await CustomerAccount.findOne({ email: normalizedEmail });
    if (existingCustomerAccount) {
      return res.status(409).json({ message: 'Account already exists. Please log in instead.' });
    }

    // Normalize and validate phone number
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Invalid phone number format. Must be 10 digits.' });
    }
    if (!normalizedPhone.startsWith('+639')) {
      return res.status(400).json({ message: 'Phone number must start with 9.' });
    }

    // Check if phone number already exists in customer_accounts
    const existingPhone = await CustomerAccount.findOne({ phoneNumber: normalizedPhone });
    if (existingPhone) {
      return res.status(409).json({ message: 'This phone number is already registered.' });
    }

    // Create customer account with all fields
    const newCustomerAccount = new CustomerAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password,
      phoneNumber: normalizedPhone,
      preferredBranch: 'Taguig Main - Cadena de Amor',
      address: ''
    });
    await newCustomerAccount.save();

    const token = generateToken({
      id: newCustomerAccount._id,
      email: normalizedEmail,
      role: 'customer',
      tokenVersion: newCustomerAccount.tokenVersion,
      firstName: newCustomerAccount.firstName,
      lastName: newCustomerAccount.lastName
    });

    res.status(201).json({
      user: {
        id: newCustomerAccount._id,
        firstName: newCustomerAccount.firstName,
        lastName: newCustomerAccount.lastName,
        email: normalizedEmail,
        role: 'customer',
        phoneNumber: newCustomerAccount.phoneNumber
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Failed to create account.' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check admin_accounts first, then customer_accounts
    let user = await AdminAccount.findOne({ email: normalizedEmail });
    let role = 'admin';

    if (!user) {
      user = await CustomerAccount.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({ message: 'Account isn\'t registered yet, please create an account.' });
      }
      role = 'customer';
    }

    if (user.status === 'archived') {
      return res.status(403).json({ message: 'This account has been archived. Please contact support.' });
    }

    // Email exists, now check password
    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    const token = generateToken({
      id: user._id,
      email: normalizedEmail,
      role,
      tokenVersion: user.tokenVersion
    });

    res.json({
      user: {
        id: user._id,
        firstName: role === 'customer' ? user.firstName : 'Admin',
        lastName: role === 'customer' ? user.lastName : 'User',
        email: normalizedEmail,
        role,
        phoneNumber: role === 'customer' ? user.phoneNumber : undefined
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to log in.' });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber
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

    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
    }

    let account = null;

    if (req.user.role === 'admin') {
      account = await AdminAccount.findById(req.user.id);
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
