import ChatMessage from '../models/ChatMessage.js';
import Customer from '../models/Customer.js';
import { isElevatedRole } from '../utils/roles.js';
import { generateGeminiChatReply } from '../services/geminiChatService.js';

function buildConversationId(customerId, guestToken) {
  if (customerId) return `cust_${customerId}`;
  if (guestToken) return `guest_${guestToken}`;
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function buildCustomerContext(customerId) {
  let customerName = 'Guest Customer';
  let customerEmail = '';
  let customerPhone = '';
  let preferredBranch = '';

  if (customerId) {
    try {
      const cust = await Customer.findById(customerId).select('firstName lastName email phoneNumber preferredBranch');
      if (cust) {
        customerName = [cust.firstName, cust.lastName].filter(Boolean).join(' ').trim() || 'Customer';
        customerEmail = cust.email || '';
        customerPhone = cust.phoneNumber || '';
        preferredBranch = cust.preferredBranch || '';
      }
    } catch (_err) {
      /* ignore */
    }
  }

  return { customerName, customerEmail, customerPhone, preferredBranch };
}

export const postChatMessage = async (req, res) => {
  try {
    const { customerId, guestToken, text, chat, sender = 'customer', uid, name, time, date } = req.body || {};
    const normalizedText = String(text ?? chat ?? '').trim();
    if (!normalizedText) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const conversationId = buildConversationId(customerId, guestToken);
    let customerName = 'Guest Customer';
    let customerEmail = '';
    let customerPhone = '';

    if (customerId) {
      try {
        const cust = await Customer.findById(customerId).select('firstName lastName email phoneNumber');
        if (cust) {
          customerName = [cust.firstName, cust.lastName].filter(Boolean).join(' ').trim() || 'Customer';
          customerEmail = cust.email || '';
          customerPhone = cust.phoneNumber || '';
        }
      } catch (_err) {
        /* ignore */
      }
    }

    const resolvedUid = String(uid || customerId || guestToken || '').trim();
    const resolvedName = String(name || customerName || 'Guest Customer').trim();
    const resolvedTime = String(time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })).trim();
    const resolvedDate = String(date || new Date().toISOString().slice(0, 10)).trim();

    const record = new ChatMessage({
      conversationId,
      customerId: customerId || '',
      customerName,
      customerEmail,
      customerPhone,
      sender,
      uid: resolvedUid,
      name: resolvedName,
      chat: normalizedText,
      time: resolvedTime,
      date: resolvedDate,
      text: normalizedText,
    });
    await record.save();

    if (String(sender).toLowerCase() === 'admin') {
      try {
        await ChatMessage.updateMany(
          { conversationId, read: false, sender: 'customer' },
          { $set: { read: true, readAt: new Date() } }
        );
      } catch (_err) { /* ignore */ }
    }

    res.status(201).json({
      ok: true,
      message: record.toObject(),
      conversationId,
    });
  } catch (err) {
    console.error('[chatMessages::postChatMessage]', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

export const postChatbotReply = async (req, res) => {
  try {
    const {
      conversationId: incomingConversationId,
      customerId,
      guestToken,
      userQuery,
      uid,
      name,
      time,
      date,
    } = req.body || {};

    const normalizedQuery = String(userQuery || '').trim();
    if (!normalizedQuery) {
      return res.status(400).json({ message: 'userQuery is required' });
    }

    const conversationId = incomingConversationId || buildConversationId(customerId, guestToken);
    const customerContext = await buildCustomerContext(customerId);
    const conversationHistory = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 }).lean();

    const replyText = await generateGeminiChatReply({
      customerId,
      preferredBranch: customerContext.preferredBranch,
      conversationHistory,
      userQuery: normalizedQuery,
    });

    const resolvedUid = String(uid || customerId || guestToken || '').trim();
    const resolvedName = String(name || customerContext.customerName || 'Chat Assistant').trim();
    const resolvedTime = String(time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })).trim();
    const resolvedDate = String(date || new Date().toISOString().slice(0, 10)).trim();

    const record = new ChatMessage({
      conversationId,
      customerId: customerId || '',
      customerName: customerContext.customerName,
      customerEmail: customerContext.customerEmail,
      customerPhone: customerContext.customerPhone,
      sender: 'system',
      uid: resolvedUid,
      name: resolvedName,
      chat: replyText,
      time: resolvedTime,
      date: resolvedDate,
      text: replyText,
    });
    await record.save();

    res.status(201).json({ ok: true, message: record.toObject(), conversationId });
  } catch (err) {
    console.error('[chatMessages::postChatbotReply]', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to generate chatbot reply' });
  }
};

export const getAdminConversations = async (req, res) => {
  try {
    if (!isElevatedRole(req.user?.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const rows = await ChatMessage.find().sort({ createdAt: -1 }).lean();
    const byConv = new Map();

    for (const msg of rows) {
      if (!byConv.has(msg.conversationId)) {
        byConv.set(msg.conversationId, {
          conversationId: msg.conversationId,
          customerId: msg.customerId,
          customerName: msg.customerName,
          customerEmail: msg.customerEmail,
          customerPhone: msg.customerPhone,
          unreadCount: 0,
          lastMessageText: '',
          lastMessageAt: null,
          messages: [],
        });
      }
      const conv = byConv.get(msg.conversationId);
      conv.messages.push(msg);
      if (!msg.read && msg.sender === 'customer') conv.unreadCount += 1;
      const ts = new Date(msg.createdAt).getTime();
      if (!conv.lastMessageAt || ts > new Date(conv.lastMessageAt).getTime()) {
        conv.lastMessageAt = msg.createdAt;
        conv.lastMessageText = msg.text;
      }
    }

    const list = Array.from(byConv.values())
      .map((c) => ({ ...c, messages: undefined }))
      .sort((a, b) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      });

    res.json({ ok: true, conversations: list });
  } catch (err) {
    console.error('[chatMessages::getAdminConversations]', err);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

export const getAdminConversationMessages = async (req, res) => {
  try {
    if (!isElevatedRole(req.user?.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const { conversationId } = req.params;
    if (!conversationId) return res.status(400).json({ message: 'conversationId required' });

    const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 }).lean();

    await ChatMessage.updateMany(
      { conversationId, read: false, sender: 'customer' },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ ok: true, messages });
  } catch (err) {
    console.error('[chatMessages::getAdminConversationMessages]', err);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

export const getAdminUnreadCount = async (req, res) => {
  try {
    if (!isElevatedRole(req.user?.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const count = await ChatMessage.countDocuments({ sender: 'customer', read: false });
    res.json({ ok: true, unreadCount: count });
  } catch (err) {
    console.error('[chatMessages::getAdminUnreadCount]', err);
    res.status(500).json({ message: 'Failed to count unread' });
  }
};

export const postAdminReply = async (req, res) => {
  try {
    if (!isElevatedRole(req.user?.role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const { conversationId } = req.params;
    const { text, adminId, adminName, uid, name, time, date } = req.body || {};
    const normalizedText = String(text || '').trim();
    if (!conversationId) return res.status(400).json({ message: 'conversationId required' });
    if (!normalizedText) return res.status(400).json({ message: 'Message text is required' });

    const sample = await ChatMessage.findOne({ conversationId }).sort({ createdAt: 1 }).lean();
    const resolvedUid = String(uid || sample?.uid || sample?.customerId || req.user?.id || '').trim();
    const resolvedName = String(name || adminName || (req.user ? [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') : 'Admin') || 'Admin').trim();
    const resolvedTime = String(time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })).trim();
    const resolvedDate = String(date || new Date().toISOString().slice(0, 10)).trim();

    const record = new ChatMessage({
      conversationId,
      customerId: sample?.customerId || '',
      customerName: sample?.customerName || 'Guest Customer',
      customerEmail: sample?.customerEmail || '',
      customerPhone: sample?.customerPhone || '',
      sender: 'admin',
      adminId: adminId || (req.user ? req.user.id : '') || '',
      adminName: adminName || (req.user ? [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') : 'Admin'),
      uid: resolvedUid,
      name: resolvedName,
      chat: normalizedText,
      time: resolvedTime,
      date: resolvedDate,
      text: normalizedText,
    });
    await record.save();
    res.status(201).json({ ok: true, message: record.toObject() });
  } catch (err) {
    console.error('[chatMessages::postAdminReply]', err);
    res.status(500).json({ message: 'Failed to send reply' });
  }
};
