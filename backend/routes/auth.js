import express from 'express';
import { signUp, login, getMe, changePassword, verifyCurrentPassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signUp);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/verify-password', authenticate, verifyCurrentPassword);
router.put('/change-password', authenticate, changePassword);
router.post('/change-password', authenticate, changePassword);

export default router;
