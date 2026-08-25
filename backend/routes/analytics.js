import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { createAnalyticsNarrative, createStoreOverviewNarrative, getColorAnalysisSummary, getChatBehaviorAnalytics } from '../controllers/analyticsController.js';

const router = express.Router();

router.post('/report-narrative', authenticate, createAnalyticsNarrative);
router.post('/store-overview-narrative', authenticate, createStoreOverviewNarrative);
router.get('/color-analysis-summary', authenticate, getColorAnalysisSummary);
router.get('/chat-behavior', authenticate, getChatBehaviorAnalytics);

export default router;
