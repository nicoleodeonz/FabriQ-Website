import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  saveSkinAnalysis,
  updateSkinAnalysisApplied,
  getAllSkinAnalyses,
} from '../controllers/skinAnalysisController.js';

const router = express.Router();

router.post('/save', authenticate, saveSkinAnalysis);
router.put('/:analysisId/applied', authenticate, updateSkinAnalysisApplied);
router.get('/all', authenticate, getAllSkinAnalyses);

export default router;
