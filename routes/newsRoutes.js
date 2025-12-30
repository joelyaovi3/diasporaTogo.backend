import express from 'express';
import { Auth, OptionalAuth } from '../middleware/user.js';
import { upload, formatImageResponse } from '../middleware/cloudinaryMiddleware.js';
import {
  createNews,
  getAllNews,
  getNewsById,
  updateNews,
  deleteNews,
  addComment,
  moderateComment,
  reportNews,
  reportComment,
  handleLike,
  addInternalNote,
  moderateNews,
  getPopularNews,
  getUserNews,
  getUserNewsStats
} from '../controllers/newsController.js';

const router = express.Router();

// Routes publiques
router.get('/', OptionalAuth, getAllNews);
router.get('/popular', getPopularNews);
router.get('/:id', getNewsById);
router.get('/user/:userId', getUserNews);

// Routes protégées
router.post('/', Auth, upload.single('image'), formatImageResponse, createNews);
router.post('/:id/like', Auth, handleLike);
router.post('/:id/comments', Auth, addComment);
router.post('/:id/report', Auth, reportNews);
router.post('/:id/comments/:commentId/report', Auth, reportComment);

// Routes auteurs (propriétaires des news)
router.put('/:id', Auth, upload.single('image'), formatImageResponse, updateNews);
router.delete('/:id', Auth, deleteNews);

// Routes admin/moderator
router.post('/:id/internal-notes', Auth, addInternalNote);
router.put('/:id/comments/:commentId/moderate', Auth, moderateComment);
router.put('/:id/moderate', Auth, moderateNews);

router.get('/user/:userId/stats', Auth, getUserNewsStats);


export default router;