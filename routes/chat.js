// routes/chatRoutes.js
import express from 'express';
import { Auth } from '../middleware/user.js';
import { 
  invitationController, 
  conversationController, 
  messageController 
} from '../controllers/chatControllers.js';
import { uploadChatFiles } from '../middleware/cloudinaryChat.js';

const router = express.Router();

// Routes pour les invitations
router.post('/invitations/send', Auth, invitationController.sendInvitation);
router.post('/invitations/:invitationId/accept', Auth, invitationController.acceptInvitation);
router.post('/invitations/:invitationId/reject', Auth, invitationController.rejectInvitation);
router.post('/invitations/:invitationId/cancel', Auth, invitationController.cancelInvitation);
router.get('/invitations/received', Auth, invitationController.getReceivedInvitations);
router.get('/invitations/sent', Auth, invitationController.getSentInvitations);

// Routes pour les conversations
router.get('/conversations', Auth, conversationController.getConversations);
router.get('/conversations/:conversationId', Auth, conversationController.getConversation);
router.post('/conversations/:conversationId/archive', Auth, conversationController.archiveConversation);

// Routes pour les messages
router.post('/messages', 
  Auth, 
  uploadChatFiles.array('attachments', 5), 
  messageController.sendMessage
);
router.get('/conversations/:conversationId/messages', Auth, messageController.getMessages);
router.delete('/messages/:messageId', Auth, messageController.deleteMessage);
router.post('/conversations/:conversationId/read', Auth, messageController.markAsRead);

export default router;