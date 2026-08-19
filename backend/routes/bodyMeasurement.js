import express from 'express';
import { analyzeImage, getMeasurements, saveMeasurements } from '../controllers/bodyMeasurementController.js';

const router = express.Router();

router.post('/analyze', analyzeImage);
router.post('/save', saveMeasurements);
router.get('/:customerId', getMeasurements);

export default router;
