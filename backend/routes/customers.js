import express from 'express';
import {
  getCustomer,
  updateCustomer,
  resetCustomerData,
  getMeasurements,
  updateMeasurements,
  updateFavoriteGowns,
  sendCustomerPhoneVerificationCode,
  verifyCustomerPhoneVerificationCode,
} from '../controllers/customerController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Customer routes (authenticated, uses user email)
router.get('/profile', authenticate, getCustomer);
router.put('/profile', authenticate, updateCustomer);

router.get('/measurements', authenticate, getMeasurements);
router.put('/measurements', authenticate, updateMeasurements);
router.put('/favorites', authenticate, updateFavoriteGowns);
router.post('/phone-verification/send', authenticate, sendCustomerPhoneVerificationCode);
router.post('/phone-verification/verify', authenticate, verifyCustomerPhoneVerificationCode);

// Admin only routes
router.post('/reset', authenticate, resetCustomerData);

export default router;
