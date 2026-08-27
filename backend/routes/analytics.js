import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { createAnalyticsNarrative, createStoreOverviewNarrative, getColorAnalysisSummary, getChatBehaviorAnalytics, getGeneralAnalytics, getBusinessActivityAnalytics, getRecentActivityAnalytics } from '../controllers/analyticsController.js';

const router = express.Router();

router.post('/report-narrative', authenticate, createAnalyticsNarrative);
router.post('/store-overview-narrative', authenticate, createStoreOverviewNarrative);
router.get('/color-analysis-summary', authenticate, getColorAnalysisSummary);
router.get('/chat-behavior', authenticate, getChatBehaviorAnalytics);
router.get('/general-analytics', authenticate, getGeneralAnalytics);
router.get('/business-activity', authenticate, getBusinessActivityAnalytics);
router.get('/recent-activity', authenticate, getRecentActivityAnalytics);

export default router;
