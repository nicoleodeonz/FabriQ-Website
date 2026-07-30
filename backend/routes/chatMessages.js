import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  postChatMessage,
  postChatbotReply,
  getAdminConversations,
  getAdminConversationMessages,
  getAdminUnreadCount,
  postAdminReply,
} from '../controllers/chatMessageController.js';

const router = express.Router();

router.post('/', postChatMessage);
router.post('/reply', postChatbotReply);
router.get('/admin/unread-count', authenticate, getAdminUnreadCount);
router.get('/admin/conversations', authenticate, getAdminConversations);
router.get('/admin/conversations/:conversationId', authenticate, getAdminConversationMessages);
router.post('/admin/conversations/:conversationId/reply', authenticate, postAdminReply);

export default router;
