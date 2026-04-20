import jwt from 'jsonwebtoken';
import AdminAccount from '../models/Admin.js';
import CustomerAccount from '../models/Customer.js';
import StaffAccount from '../models/Staff.js';
import { isElevatedRole } from '../utils/roles.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization header.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { id, email, role, tokenVersion } = decoded;

    let user;
    if (role === 'admin') {
      user = await AdminAccount.findById(id);
      if (user) user = user.toObject();
    } else if (role === 'staff') {
      user = await StaffAccount.findById(id);
      if (user) user = user.toObject();
    } else {
      user = await CustomerAccount.findById(id);
      if (user) user = user.toObject();
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    if (user.status === 'archived') {
      return res.status(403).json({ message: 'This account has been archived.' });
    }

    const accountTokenVersion = Number(user.tokenVersion || 0);
    const requestTokenVersion = Number(tokenVersion || 0);
    if (accountTokenVersion !== requestTokenVersion) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    // Ensure basic auth info is present
    user.id = id;
    user.email = email;
    user.role = isElevatedRole(role) ? role : 'customer';

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};
