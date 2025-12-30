import express from 'express';
const router = express.Router();

import { createComment, getComment, getCommentBy } from '../controllers/commentController.js';
import { Auth } from '../middleware/user.js';

router.post("/", Auth, createComment)
router.get("/",Auth, getComment)
router.get("/:newsId", Auth, getCommentBy)

export default router;
