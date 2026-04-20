import express from 'express';
import {
	signUp,
	verifySignUp,
	login,
	logout,
	getMe,
	changePassword,
	verifyCurrentPassword,
	requestPasswordReset,
	verifyPasswordResetCode,
	resetPassword
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signUp);
router.post('/signup/verify', verifySignUp);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/verify-password', authenticate, verifyCurrentPassword);
router.post('/forgot-password/request', requestPasswordReset);
router.post('/forgot-password/verify', verifyPasswordResetCode);
router.post('/forgot-password/reset', resetPassword);
router.put('/change-password', authenticate, changePassword);
router.post('/change-password', authenticate, changePassword);

export default router;
