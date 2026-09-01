import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  postChatMessage,
  postChatbotReply,
  getAdminConversations,
  getAdminConversationMessages,
  getAdminUnreadCount,
  postAdminReply,
  markConversationOpenByAdmin,
  markConversationClosedByAdmin,
} from '../controllers/chatMessageController.js';

const router = express.Router();

router.post('/', postChatMessage);
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId is required' });
    }

    const { default: ChatMessage } = await import('../models/ChatMessage.js');
    const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 }).lean();
    return res.json({ ok: true, messages });
  } catch (err) {
    console.error('[chatMessages::customerConversationFetch]', err);
    return res.status(500).json({ message: 'Failed to fetch conversation messages' });
  }
});
router.post('/reply', postChatbotReply);
router.get('/admin/unread-count', authenticate, getAdminUnreadCount);
router.get('/admin/conversations', authenticate, getAdminConversations);
router.get('/admin/conversations/:conversationId', authenticate, getAdminConversationMessages);
router.post('/admin/conversations/:conversationId/open', authenticate, (req, res) => {
  const conversationId = String(req.params.conversationId || '').trim();
  const adminId = String(req.user?.id || '').trim();
  if (!conversationId || !adminId) {
    return res.status(400).json({ message: 'conversationId and adminId are required.' });
  }

  const opened = markConversationOpenByAdmin(conversationId, adminId);
  return res.json({ ok: true, opened });
});
router.delete('/admin/conversations/:conversationId/open', authenticate, (req, res) => {
  const conversationId = String(req.params.conversationId || '').trim();
  const adminId = String(req.user?.id || '').trim();
  if (!conversationId) {
    return res.status(400).json({ message: 'conversationId is required.' });
  }

  const closed = markConversationClosedByAdmin(conversationId, adminId);
  return res.json({ ok: true, closed });
});
router.post('/admin/conversations/:conversationId/reply', authenticate, postAdminReply);

export default router;
