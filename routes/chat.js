import express from 'express';
import { Auth } from '../middleware/user.js';
const router = express.Router();

import {
  accessChats,
  fetchAllChats,
  creatGroup,
  renameGroup,
  addToGroup,
  removeFromGroup,
  createNews,
  getAllNews,
  getNewsById,
  getGrpList,
  addComment,
  // likeComment,
  disLikesComment,
  // removeLikeComment,
  // removeDisLiskeComment,
  likeCt,
  deleteNews,
  resetUnreadCount,
  acceptNews,
  declinedNews,
  pendingNews,
  likeNews,
  dislikeNews,
  getNewsReactionStatus,
  reportNews,
  handleReport,
  updateNews,
  getUserNews,
  getNewsByUserConnected,
  updateNewsV2
} from '../controllers/chatControllers.js';

router.post('/', Auth, accessChats);
router.get('/', Auth, fetchAllChats);
router.get("/news/myNews", Auth, getUserNews);
router.get('/news/user', Auth, getNewsByUserConnected)
router.post('/group', Auth, creatGroup);
router.patch('/group/rename', Auth, renameGroup);
router.patch('/groupAdd', Auth, addToGroup);
router.patch('/groupRemove', Auth, removeFromGroup);
router.delete('/removeuser', Auth);
router.post("/createN", Auth,createNews)
router.get('/allNews', getAllNews)
router.get('/news/:id', getNewsById)
router.get("/grp/list",getGrpList)
router.put('/add/comment/:id', addComment)

router.put('/news/accept/:id', acceptNews)
router.put('/news/decline/:id', declinedNews)
router.put('/news/pending/:id', pendingNews)

router.post('/news/:newsId/like', Auth, likeNews);
router.post('/news/:newsId/dislike', Auth, dislikeNews);
router.get('/news/:newsId/reaction-status', Auth, getNewsReactionStatus);

router.post('/news/:id/report', Auth, reportNews)
router.get('/news/:id/report-status', Auth, handleReport)
// router.put("/news/:id/like", Auth, likeCt)
router.post("/news/like", likeCt)
router.delete("/news/:id", deleteNews)
// router.put("/news/:id/removelike",removeLikeComment)
router.post("/news/dislike", disLikesComment)
router.post("/reset-unread", resetUnreadCount)
// router.get('/news/public', getPublicNews);
router.put("/news/:id", Auth, updateNews);
router.put("/news/v2/:id", Auth, updateNewsV2);



export default router;
