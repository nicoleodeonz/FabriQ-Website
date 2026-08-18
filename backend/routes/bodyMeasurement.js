import express from 'express';
import { analyzeImage, saveMeasurements } from '../controllers/bodyMeasurementController.js';

const router = express.Router();

router.post('/analyze', analyzeImage);
router.post('/save', saveMeasurements);

export default router;
