import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { createAppointment, getAdminAppointments, getBookedAppointmentSlots, getMyAppointments, rescheduleMyAppointment, updateAppointmentStatus } from '../controllers/appointmentController.js';

const router = express.Router();

router.get('/mine', authenticate, getMyAppointments);
router.get('/admin', authenticate, getAdminAppointments);
router.get('/availability', authenticate, getBookedAppointmentSlots);
router.post('/', authenticate, createAppointment);
router.patch('/:id/reschedule', authenticate, rescheduleMyAppointment);
router.patch('/:id/status', authenticate, updateAppointmentStatus);

export default router;