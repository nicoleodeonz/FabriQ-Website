import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { addAdminDashboardClient, startAdminDashboardHeartbeat } from '../services/adminRealtimeService.js';
import { isElevatedRole } from '../utils/roles.js';

const router = express.Router();

router.get('/admin-dashboard', authenticate, (req, res) => {
  if (!isElevatedRole(String(req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');

  const removeClient = addAdminDashboardClient(res);
  const stopHeartbeat = startAdminDashboardHeartbeat(res);

  req.on('close', () => {
    stopHeartbeat();
    removeClient();
  });
});

export default router;