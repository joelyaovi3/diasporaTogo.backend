import express from "express";
const router = express.Router();
import { sendMessage, getMessages } from "../controllers/messageControllers.js";
import { Auth } from "../middleware/user.js";
import { uploadMiddleware } from '../middleware/upload.js';

router.post("/", Auth, uploadMiddleware, sendMessage);
router.get("/:chatId", Auth, getMessages);

export default router;