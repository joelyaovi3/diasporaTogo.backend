import express from 'express';
import { Auth } from '../middleware/user.js';
import { isAdmin, isModerator } from '../middleware/roleMiddleware.js';
import {
  getPendingNews,
  getModerationStats,
  approveNews,
  rejectNews,
  blockNews,
  unblockNews,
  getModerationHistory,
  batchModerateNews,
  exportModerationStats
} from '../controllers/moderationController.js';

const router = express.Router();

// Middleware pour vérifier les permissions admin/moderator
const requireModerator = (req, res, next) => {
  const userRole = req.rootUser?.role;
  if (!['admin', 'Supervisor'].includes(userRole)) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Permissions insuffisantes.'
    });
  }
  next();
};

// Routes de modération
router.get('/pending', Auth, requireModerator, getPendingNews);
router.get('/stats', Auth, requireModerator, getModerationStats);
router.get('/export-stats', Auth, isAdmin, exportModerationStats);

router.get('/:id/moderation-history', Auth, requireModerator, getModerationHistory);
router.post('/:id/approve', Auth, requireModerator, approveNews);
router.post('/:id/reject', Auth, requireModerator, rejectNews);
router.post('/:id/block', Auth, requireModerator, blockNews);
router.post('/:id/unblock', Auth, requireModerator, unblockNews);

// Modération batch (seulement pour admin)
router.post('/batch-moderate', Auth, isAdmin, batchModerateNews);

export default router;