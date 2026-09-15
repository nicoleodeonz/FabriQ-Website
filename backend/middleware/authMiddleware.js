import jwt from 'jsonwebtoken';
import AdminAccount from '../models/Admin.js';
import CustomerAccount from '../models/Customer.js';
import StaffAccount from '../models/Staff.js';
import { isElevatedRole } from '../utils/roles.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : '';
  const queryToken = typeof req.query?.access_token === 'string'
    ? req.query.access_token.trim()
    : '';
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ message: 'Missing authorization header.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { id, email, role, tokenVersion } = decoded;

    let user;
    const AccountModel = role === 'admin'
      ? AdminAccount
      : role === 'staff'
        ? StaffAccount
        : CustomerAccount;

    try {
      user = await AccountModel.findById(id).lean();
    } catch (lookupError) {
      console.warn('Auth id lookup failed; trying email lookup:', lookupError.message);
    }

    // Restored MongoDB backups can contain new document ids. Recover the
    // account by the signed email so a valid session survives that restore.
    if (!user && email) {
      user = await AccountModel.findOne({ email }).lean();
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

    // Ensure basic auth info is present and use the restored document id.
    user.id = String(user._id);
    user.email = String(user.email || email).trim().toLowerCase();
    user.role = isElevatedRole(role) ? role : 'customer';

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};
