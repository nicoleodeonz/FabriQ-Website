import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware.js';
import { upload } from '../config/upload.js';
import { createRental, getAdminRentals, getMyRentals, getRentalAvailability, scheduleRentalPickup, submitRentalPayment, updateRentalStatus } from '../controllers/rentalController.js';

const router = express.Router();

router.get('/availability', authenticate, getRentalAvailability);
router.get('/mine', authenticate, getMyRentals);
router.get('/admin', authenticate, getAdminRentals);
router.post('/', authenticate, createRental);
router.post('/:id/payment', authenticate, (req, res, next) => {
	upload.single('receipt')(req, res, (err) => {
		if (!err) {
			return next();
		}

		if (err instanceof multer.MulterError) {
			if (err.code === 'LIMIT_FILE_SIZE') {
				return res.status(400).json({ message: 'Receipt image exceeds 5 MB limit' });
			}
			return res.status(400).json({ message: err.message || 'Receipt upload failed' });
		}

		return res.status(400).json({ message: err.message || 'Invalid receipt upload' });
	});
}, submitRentalPayment);
router.post('/:id/pickup-schedule', authenticate, scheduleRentalPickup);
router.patch('/:id/status', authenticate, updateRentalStatus);

export default router;
