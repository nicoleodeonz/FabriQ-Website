import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { archiveUser, createUser, getAdminActions, getUsers, restoreUser } from '../controllers/usersController.js';

const router = express.Router();

router.get('/', authenticate, getUsers);
router.get('/actions', authenticate, getAdminActions);
router.post('/', authenticate, createUser);
router.patch('/:role/:id/archive', authenticate, archiveUser);
router.patch('/:role/:id/restore', authenticate, restoreUser);

export default router;
