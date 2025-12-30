import express from 'express';
const router = express.Router();

import { createContact, getContact } from '../controllers/contactControler.js';

router.post("/", createContact)
router.get("/", getContact)

export default router;
