import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  getInventory,
  getPublicInventory,
  getArchivedProducts,
  getBranchInventory,
  getBranchPerformance,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  uploadImage,
  upload3DModel,
  recordClick,
  getBranchClickAnalysis
} from '../controllers/inventoryController.js';
import { upload, upload3DModel as upload3DModelFile } from '../config/upload.js';

const router = express.Router();

router.get('/public', getPublicInventory);
router.post('/:gownId/click', recordClick);
router.get('/branch-click-analysis', authenticate, getBranchClickAnalysis);
router.get('/', authenticate, getInventory);
router.get('/archive', authenticate, getArchivedProducts);
router.get('/branch-performance', authenticate, getBranchPerformance);
router.get('/branch/:branchId', authenticate, getBranchInventory);
router.post('/', authenticate, createProduct);
router.put('/:id', authenticate, updateProduct);
router.delete('/:id', authenticate, deleteProduct);
router.patch('/:id/restore', authenticate, restoreProduct);
router.post('/upload-image', authenticate, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Image exceeds 5 MB limit' });
      }
      return res.status(400).json({ message: err.message || 'Image upload failed' });
    }

    return res.status(400).json({ message: err.message || 'Invalid image upload' });
  });
}, uploadImage);

router.post('/upload-3d-model', authenticate, (req, res, next) => {
  upload3DModelFile.single('model')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: '3D model exceeds 75 MB limit' });
      }
      return res.status(400).json({ message: err.message || '3D model upload failed' });
    }

    return res.status(400).json({ message: err.message || 'Invalid 3D model upload' });
  });
}, upload3DModel);

export default router;
