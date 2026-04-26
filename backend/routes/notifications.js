import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { sendServiceNotification } from '../controllers/notificationController.js';

const router = express.Router();

router.post('/send', authenticate, sendServiceNotification);

export default router;