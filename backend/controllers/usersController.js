import AdminAccount from '../models/Admin.js';
import CustomerAccount from '../models/Customer.js';
import AdminAction from '../models/AdminAction.js';

function normalizePhone(input) {
  if (!input && input !== '') return undefined;
  let s = String(input || '').replace(/\D/g, '');
  if (s.length === 0) return undefined;
  if (s.startsWith('0')) s = s.slice(1);
  if (s.startsWith('63')) s = s.slice(2);
  s = s.slice(-10);
  if (s.length !== 10) return undefined;
  return '+63' + s;
}

function buildAdminName(email) {
  const prefix = String(email || '').split('@')[0] || 'Admin';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Admin';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function logAdminAction(req, payload) {
  try {
    await AdminAction.create({
      adminId: String(req.user?.id || ''),
      adminEmail: String(req.user?.email || ''),
      adminLabel: buildAdminName(req.user?.email || ''),
      action: payload.action,
      targetUserId: payload.targetUserId || '',
      targetRole: payload.targetRole || '',
      details: payload.details || null
    });
  } catch (error) {
    console.error('logAdminAction error:', error);
  }
}

export async function createUser(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      role,
      email,
      password,
      firstName,
      lastName,
      phoneNumber
    } = req.body;

    const normalizedRole = String(role || '').toLowerCase();
    if (!['admin', 'customer'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Role must be admin or customer' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const [existingAdmin, existingCustomer] = await Promise.all([
      AdminAccount.findOne({ email: normalizedEmail }).lean(),
      CustomerAccount.findOne({ email: normalizedEmail }).lean()
    ]);

    if (existingAdmin || existingCustomer) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    if (normalizedRole === 'admin') {
      const admin = await AdminAccount.create({
        email: normalizedEmail,
        password,
        status: 'active'
      });

      await logAdminAction(req, {
        action: 'user_created',
        targetUserId: String(admin._id),
        targetRole: 'Admin',
        details: {
          createdRole: 'Admin',
          email: admin.email
        }
      });

      return res.status(201).json({
        message: 'Admin account created successfully',
        user: {
          id: String(admin._id),
          firstName: buildAdminName(admin.email),
          lastName: 'Admin',
          email: admin.email,
          phoneNumber: '',
          role: 'Admin',
          status: admin.status || 'active',
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt
        }
      });
    }

    if (!firstName || !lastName || !phoneNumber) {
      return res.status(400).json({ message: 'First name, last name, and phone number are required for customer accounts' });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone || !normalizedPhone.startsWith('+639')) {
      return res.status(400).json({ message: 'Invalid phone number format. Use a valid PH mobile number.' });
    }

    const existingPhone = await CustomerAccount.findOne({ phoneNumber: normalizedPhone }).lean();
    if (existingPhone) {
      return res.status(409).json({ message: 'Phone number is already registered' });
    }

    const customer = await CustomerAccount.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      password,
      phoneNumber: normalizedPhone,
      status: 'active'
    });

    await logAdminAction(req, {
      action: 'user_created',
      targetUserId: String(customer._id),
      targetRole: 'Customer',
      details: {
        createdRole: 'Customer',
        email: customer.email
      }
    });

    return res.status(201).json({
      message: 'Customer account created successfully',
      user: {
        id: String(customer._id),
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        role: 'Customer',
        status: customer.status || 'active',
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      }
    });
  } catch (error) {
    console.error('createUser error:', error);
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'User already exists' });
    }
    return res.status(500).json({ message: 'Failed to create user' });
  }
}

export async function getUsers(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [admins, customers] = await Promise.all([
      AdminAccount.find({}, { email: 1, status: 1, createdAt: 1, updatedAt: 1 }).lean(),
      CustomerAccount.find({}, {
        firstName: 1,
        lastName: 1,
        email: 1,
        phoneNumber: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1
      }).lean()
    ]);

    const adminUsers = admins.map((admin) => ({
      id: String(admin._id),
      firstName: buildAdminName(admin.email),
      lastName: 'Admin',
      email: admin.email,
      phoneNumber: '',
      role: 'Admin',
      status: admin.status || 'active',
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt
    }));

    const customerUsers = customers.map((customer) => ({
      id: String(customer._id),
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      role: 'Customer',
      status: customer.status || 'active',
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    }));

    const users = [...adminUsers, ...customerUsers].sort((a, b) => {
      const aDate = new Date(a.createdAt || 0).getTime();
      const bDate = new Date(b.createdAt || 0).getTime();
      return bDate - aDate;
    });

    return res.json({ users });
  } catch (error) {
    console.error('getUsers error:', error);
    return res.status(500).json({ message: 'Failed to fetch users' });
  }
}

export async function archiveUser(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id, role } = req.params;
    const normalizedRole = String(role || '').toLowerCase();

    if (!['admin', 'customer'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid user role' });
    }

    if (normalizedRole === 'admin' && id === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot archive your own account' });
    }

    const Model = normalizedRole === 'admin' ? AdminAccount : CustomerAccount;
    const updated = await Model.findByIdAndUpdate(
      id,
      { status: 'archived', updatedAt: new Date() },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAdminAction(req, {
      action: 'user_archived',
      targetUserId: String(updated.email || ''),
      targetRole: normalizedRole === 'admin' ? 'Admin' : 'Customer',
      details: {
        status: 'archived',
        email: updated.email || ''
      }
    });

    return res.json({
      message: 'User archived successfully',
      user: {
        id: String(updated._id),
        role: normalizedRole === 'admin' ? 'Admin' : 'Customer',
        status: updated.status || 'archived',
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    console.error('archiveUser error:', error);
    return res.status(500).json({ message: 'Failed to archive user' });
  }
}

export async function restoreUser(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id, role } = req.params;
    const normalizedRole = String(role || '').toLowerCase();

    if (!['admin', 'customer'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid user role' });
    }

    const Model = normalizedRole === 'admin' ? AdminAccount : CustomerAccount;
    const updated = await Model.findByIdAndUpdate(
      id,
      { status: 'active', updatedAt: new Date() },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAdminAction(req, {
      action: 'user_restored',
      targetUserId: String(updated.email || ''),
      targetRole: normalizedRole === 'admin' ? 'Admin' : 'Customer',
      details: {
        status: 'active',
        email: updated.email || ''
      }
    });

    return res.json({
      message: 'User restored successfully',
      user: {
        id: String(updated._id),
        role: normalizedRole === 'admin' ? 'Admin' : 'Customer',
        status: updated.status || 'active',
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    console.error('restoreUser error:', error);
    return res.status(500).json({ message: 'Failed to restore user' });
  }
}

export async function getAdminActions(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const actions = await AdminAction.find({}, {
      adminLabel: 1,
      adminEmail: 1,
      action: 1,
      targetUserId: 1,
      targetRole: 1,
      details: 1,
      createdAt: 1
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    return res.json({
      actions: actions.map((entry) => ({
        id: String(entry._id),
        adminLabel: entry.adminLabel || 'Admin',
        adminEmail: entry.adminEmail || '',
        action: entry.action,
        targetUserId: entry.targetUserId || '',
        targetRole: entry.targetRole || '',
        details: entry.details || null,
        createdAt: entry.createdAt
      }))
    });
  } catch (error) {
    console.error('getAdminActions error:', error);
    return res.status(500).json({ message: 'Failed to fetch admin actions' });
  }
}
