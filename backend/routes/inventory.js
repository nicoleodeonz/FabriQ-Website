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
  uploadImage
} from '../controllers/inventoryController.js';
import { upload } from '../config/upload.js';

const router = express.Router();

router.get('/public', getPublicInventory);
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

export default router;
