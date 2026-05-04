import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getMyNotifications, markMyNotificationRead, sendServiceNotification } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/mine', authenticate, getMyNotifications);
router.patch('/mine/:id/read', authenticate, markMyNotificationRead);
router.post('/send', authenticate, sendServiceNotification);

export default router;