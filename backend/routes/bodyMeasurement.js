import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { analyzeImage, getMeasurements, saveMeasurements } from '../controllers/bodyMeasurementController.js';

const router = express.Router();

router.post('/analyze', authenticate, analyzeImage);
router.post('/save', authenticate, saveMeasurements);
router.get('/:customerId', authenticate, getMeasurements);

export default router;