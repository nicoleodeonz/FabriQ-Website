import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { submitGownGeneration, getGownGenerationStatus } from '../controllers/gownDesignerController.js';

const router = express.Router();

router.post('/generate', authenticate, submitGownGeneration);
router.get('/status/:taskId', authenticate, getGownGenerationStatus);

export default router;