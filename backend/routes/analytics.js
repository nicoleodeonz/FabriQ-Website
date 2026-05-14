import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { createAnalyticsNarrative, createStoreOverviewNarrative } from '../controllers/analyticsController.js';

const router = express.Router();

router.post('/report-narrative', authenticate, createAnalyticsNarrative);
router.post('/store-overview-narrative', authenticate, createStoreOverviewNarrative);

export default router;
