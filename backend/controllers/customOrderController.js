import CustomOrder from '../models/CustomOrder.js';
import CustomerAccount from '../models/Customer.js';
import AdminAction from '../models/AdminAction.js';
import { storeUploadedImage } from '../services/mediaStorageService.js';
import { isElevatedRole } from '../utils/roles.js';

const CUSTOM_ORDER_STATUSES = ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed', 'rejected'];
const CUSTOM_ORDER_REFERENCE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

function buildAdminName(email) {
  const prefix = String(email || '').split('@')[0] || 'Admin';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Admin';
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
      details: payload.details || null,
    });
  } catch (error) {
    console.error('customOrder logAdminAction error:', error);
  }
}

function buildFallbackCustomOrderReferenceId(sourceId) {
  return String(sourceId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(-7)
    .padStart(7, '0');
}

function createRandomCustomOrderReferenceId() {
  let result = '';
  for (let index = 0; index < 7; index += 1) {
    const nextIndex = Math.floor(Math.random() * CUSTOM_ORDER_REFERENCE_CHARACTERS.length);
    result += CUSTOM_ORDER_REFERENCE_CHARACTERS[nextIndex];
  }
  return result;
}

async function generateCustomOrderReferenceId() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = createRandomCustomOrderReferenceId();
    const exists = await CustomOrder.exists({ referenceId: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return createRandomCustomOrderReferenceId();
}

function mapCustomOrder(doc) {
  const source = typeof doc?.toJSON === 'function' ? doc.toJSON() : doc;
  const sourceId = String(source?._id || source?.id || '');
  return {
    ...source,
    id: sourceId,
    referenceId: source?.referenceId || buildFallbackCustomOrderReferenceId(sourceId),
  };
}

export const getAllCustomOrders = async (req, res) => {
  try {
    if (!req.user || !isElevatedRole(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'Forbidden: Admin or staff only.' });
    }

    const orders = await CustomOrder.find({}).sort({ createdAt: -1 }).lean();
    res.json(orders.map(mapCustomOrder));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const uploadDesignImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded.' });
    }

    const result = await storeUploadedImage(req.file, { folder: 'custom_orders/design_inspiration' });
    res.json({ url: result.url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createCustomOrder = async (req, res) => {
  try {
    const user = req.user;
    const {
      orderType,
      eventDate,
      preferredColors,
      fabricPreference,
      specialRequests,
      budget,
      branch,
      designImageUrl
    } = req.body;

    const customer = await CustomerAccount.findById(user.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const customOrder = new CustomOrder({
      customerId: customer._id,
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      contactNumber: customer.phoneNumber || '',
      email: customer.email,
      orderType,
      eventDate,
      preferredColors,
      fabricPreference,
      specialRequests,
      budget,
      branch,
      referenceId: await generateCustomOrderReferenceId(),
      designImageUrl
    });

    await customOrder.save();
    res.status(201).json(mapCustomOrder(customOrder));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyCustomOrders = async (req, res) => {
  try {
    const user = req.user;
    const orders = await CustomOrder.find({ customerId: user.id }).sort({ createdAt: -1 }).lean();
    res.json(orders.map(mapCustomOrder));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCustomOrderStatus = async (req, res) => {
  try {
    if (!req.user || !isElevatedRole(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'Forbidden: Admin or staff only.' });
    }

    const { id } = req.params;
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();

    if (!CUSTOM_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid custom order status.' });
    }

    const order = await CustomOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Custom order not found.' });
    }

    const previousStatus = String(order.status || '').trim().toLowerCase();
    order.status = nextStatus;
    order.updatedAt = new Date();
    await order.save();

    await logAdminAction(req, {
      action: 'custom_order_status_updated',
      targetUserId: String(order.customerId || order.email || ''),
      targetRole: 'Customer',
      details: {
        customOrderId: String(order._id),
        customOrderReferenceId: order.referenceId || buildFallbackCustomOrderReferenceId(order._id),
        customerName: order.customerName || '',
        email: order.email || '',
        orderType: order.orderType || '',
        branch: order.branch || '',
        eventDate: order.eventDate || '',
        previousStatus,
        newStatus: nextStatus,
      },
    });

    res.json({ order: mapCustomOrder(order) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
