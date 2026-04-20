import express from 'express';
import { createCustomOrder, getMyCustomOrders, getAllCustomOrders, updateCustomOrderConsultationSchedule, updateCustomOrderStatus } from '../controllers/customOrderController.js';
import { upload } from '../config/upload.js';
import { uploadDesignImage } from '../controllers/customOrderController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();
// Admin: Get all custom orders
router.get('/', authenticate, getAllCustomOrders);


// Upload design inspiration image
router.post('/upload-image', authenticate, upload.single('image'), uploadDesignImage);

// Customer: Create a new custom order
router.post('/', authenticate, createCustomOrder);

// Customer: Get all custom orders for the authenticated user
router.get('/my-orders', authenticate, getMyCustomOrders);

// Customer: Set or reschedule design consultation visit
router.patch('/:id/consultation-schedule', authenticate, updateCustomOrderConsultationSchedule);

// Admin: Update custom order status
router.patch('/:id/status', authenticate, updateCustomOrderStatus);

export default router;
