// controllers/chatController.js
import path from 'path';
import Invitation from '../models/invitationModel.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import User from '../models/userModel.js';
import Block from '../models/blockModel.js';
import { deleteCloudinaryFile } from '../middleware/cloudinaryChat.js';
import { cloudinary } from '../utils/cloudinary.js';
import { createAndEmitNotification } from './notificationController.js';

const INVITATION_DAILY_LIMIT = 20;

// Contrôleur pour les invitations
export const invitationController = {
  // Envoyer une invitation
 // controllers/chatController.js - fonction sendInvitation
sendInvitation: async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    
    // Vérifier que req.user existe
    if (!req.user || !req.user._id) {
      console.error('❌ User not found in request:', req.user);
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié'
      });
    }
    
    const senderId = req.user._id;

    console.log('=== DEBUG sendInvitation ===');
    console.log('Sender ID:', senderId);
    console.log('Receiver ID:', receiverId);
    console.log('Request user:', req.user);
    console.log('Request body:', req.body);
    console.log('===========================');

    // Vérifier que receiverId est fourni
    if (!receiverId) {
      return res.status(400).json({
        success: false,
        error: 'ID du destinataire requis'
      });
    }

    // Vérifier que l'utilisateur ne s'envoie pas d'invitation à lui-même
    if (senderId.toString() === receiverId.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas vous envoyer une invitation à vous-même'
      });
    }

    // Vérifier que le destinataire existe
    const receiver = await User.findById(receiverId)
      .select('firstName lastName username userName userType companyName email avatar isActive isVerified');
    
    if (!receiver) {
      return res.status(404).json({
        success: false,
        error: 'Destinataire introuvable'
      });
    }

    // Vérifier que le destinataire est actif
    if (!receiver.isActive || !receiver.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'Le destinataire n\'a pas activé son compte'
      });
    }

    // Vérifier si l'un a bloqué l'autre
    const blockDirection = await Block.getBlockDirection(senderId, receiverId);
    if (blockDirection) {
      const error = blockDirection === 'blocker'
        ? 'Vous avez bloqué cet utilisateur. Débloquez-le d\'abord pour pouvoir l\'inviter.'
        : 'Vous ne pouvez pas envoyer d\'invitation à cet utilisateur.';
      return res.status(403).json({ success: false, error });
    }

    // Rate limiting : max INVITATION_DAILY_LIMIT invitations par 24h
    const recentCount = await Invitation.countRecentSent(senderId);
    if (recentCount >= INVITATION_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error: `Vous avez atteint la limite de ${INVITATION_DAILY_LIMIT} invitations par jour`
      });
    }

    // Vérifier si une conversation active existe déjà entre les deux utilisateurs
    const existingConversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
      isActive: true
    });

    if (existingConversation) {
      return res.status(400).json({
        success: false,
        error: 'Vous discutez déjà avec cet utilisateur',
        conversationId: existingConversation._id
      });
    }

    // Vérifier si une invitation est déjà en attente
    const existingInvitation = await Invitation.findOne({
      $or: [
        { sender: senderId, receiver: receiverId, status: 'pending' },
        { sender: receiverId, receiver: senderId, status: 'pending' }
      ]
    });

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        error: 'Une invitation est déjà en attente',
        existingInvitation: {
          id: existingInvitation._id,
          status: existingInvitation.status
        }
      });
    }

    // Créer l'invitation
    const invitation = await Invitation.create({
      sender: senderId,
      receiver: receiverId,
      message: message || `Bonjour, je souhaite discuter avec vous`
    });

    console.log('Invitation créée (raw):', invitation);

    // Population avec approche différente pour éviter les erreurs
    let populatedSender = req.user; // Utiliser l'utilisateur déjà authentifié
    let populatedReceiver = receiver;

    // Si on veut les données complètes, on peut les récupérer
    if (!populatedSender.avatar || !populatedSender.firstName) {
      populatedSender = await User.findById(senderId)
        .select('firstName lastName username userName userType companyName email avatar')
        .lean();
    }

    if (!populatedReceiver.avatar || !populatedReceiver.firstName) {
      populatedReceiver = await User.findById(receiverId)
        .select('firstName lastName username userName userType companyName email avatar')
        .lean();
    }

    console.log('Sender populated:', populatedSender);
    console.log('Receiver populated:', populatedReceiver);

    // Préparer la réponse
    const responseInvitation = {
      _id: invitation._id,
      sender: {
        _id: populatedSender._id,
        firstName: populatedSender.firstName,
        lastName: populatedSender.lastName,
        userName: populatedSender.userName,
        email: populatedSender.email,
        avatar: populatedSender.avatar
      },
      receiver: {
        _id: populatedReceiver._id,
        firstName: populatedReceiver.firstName,
        lastName: populatedReceiver.lastName,
        userName: populatedReceiver.userName,
        email: populatedReceiver.email,
        avatar: populatedReceiver.avatar
      },
      status: invitation.status,
      message: invitation.message,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt
    };

    console.log('DEBUG invitation final:', responseInvitation);

    res.status(201).json({
      success: true,
      message: 'Invitation envoyée avec succès',
      invitation: responseInvitation
    });

    // Notification persistante + Socket.IO au destinataire
    await createAndEmitNotification(req.io, {
      recipient: receiverId,
      type: 'invitation_received',
      refModel: 'Invitation',
      refId: invitation._id,
      data: {
        sender: {
          _id: responseInvitation.sender._id,
          firstName: responseInvitation.sender.firstName,
          lastName: responseInvitation.sender.lastName,
          avatar: responseInvitation.sender.avatar
        },
        message: invitation.message
      }
    });

    if (req.io) {
      req.io.to(receiverId.toString()).emit('new-invitation', responseInvitation);
    }

  } catch (error) {
    console.error('❌ Erreur détaillée envoi invitation:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      user: req.user,
      errorName: error.name,
      errorCode: error.code
    });
    
    // Gérer les erreurs spécifiques
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'ID invalide'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi de l\'invitation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

  // Accepter une invitation
  acceptInvitation: async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.user._id;

      const invitation = await Invitation.findById(invitationId)
        .populate('sender', 'firstName lastName username userName userType companyName email avatar')
        .populate('receiver', 'firstName lastName username userName userType companyName email avatar');

      if (!invitation) {
        return res.status(404).json({
          success: false,
          error: 'Invitation introuvable'
        });
      }

      // Vérifier que l'utilisateur est bien le destinataire
      if (invitation.receiver._id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Vous n\'êtes pas autorisé à accepter cette invitation'
        });
      }

      // Vérifier le statut
      if (invitation.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: `Cette invitation a déjà été ${invitation.status === 'accepted' ? 'acceptée' : 'refusée'}`
        });
      }

      // Vérifier l'expiration
      if (invitation.pendingExpiresAt && invitation.pendingExpiresAt < new Date()) {
        invitation.status = 'expired';
        await invitation.save();
        return res.status(400).json({
          success: false,
          error: 'Cette invitation a expiré'
        });
      }

      // Accepter l'invitation
      invitation.status = 'accepted';
      await invitation.save();

      // Créer la conversation
      const conversation = await Conversation.create({
        participants: [invitation.sender._id, invitation.receiver._id],
        invitation: invitation._id
      });

      // Populer les informations
      await conversation.populate('participants', 'firstName lastName username userName userType companyName email avatar');

      res.status(200).json({
        success: true,
        message: 'Invitation acceptée avec succès',
        conversation
      });

      if (req.io) {
        req.io.to(userId.toString()).emit('invitation-accepted', { invitationId: invitation._id, conversation });
        req.io.to(invitation.sender._id.toString()).emit('invitation-accepted', {
          invitationId: invitation._id,
          conversation,
          acceptedBy: invitation.receiver
        });
        [invitation.sender._id.toString(), invitation.receiver._id.toString()].forEach(pid => {
          req.io.to(pid).emit('new-conversation', conversation);
        });
      }

      // Notification persistante à l'expéditeur
      await createAndEmitNotification(req.io, {
        recipient: invitation.sender._id,
        type: 'invitation_accepted',
        refModel: 'Invitation',
        refId: invitation._id,
        data: {
          acceptedBy: {
            _id: invitation.receiver._id,
            firstName: invitation.receiver.firstName,
            lastName: invitation.receiver.lastName,
            avatar: invitation.receiver.avatar
          },
          conversationId: conversation._id
        }
      });

    } catch (error) {
      console.error('Erreur acceptation invitation:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'acceptation de l\'invitation'
      });
    }
  },

  // Refuser une invitation
  rejectInvitation: async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.user._id;

      const invitation = await Invitation.findById(invitationId);

      if (!invitation) {
        return res.status(404).json({
          success: false,
          error: 'Invitation introuvable'
        });
      }

      // Vérifier que l'utilisateur est bien le destinataire
      if (invitation.receiver.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Vous n\'êtes pas autorisé à refuser cette invitation'
        });
      }

      // Refuser l'invitation
      invitation.status = 'rejected';
      await invitation.save();

      res.status(200).json({
        success: true,
        message: 'Invitation refusée avec succès'
      });

      // Notifier l'expéditeur via Socket.IO
      if (req.io) {
        req.io.to(invitation.sender.toString()).emit('invitation-rejected', {
          invitationId: invitation._id,
          rejectedBy: userId
        });
      }

    } catch (error) {
      console.error('Erreur refus invitation:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du refus de l\'invitation'
      });
    }
  },

  // Annuler une invitation
  cancelInvitation: async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.user._id;

      const invitation = await Invitation.findById(invitationId);

      if (!invitation) {
        return res.status(404).json({
          success: false,
          error: 'Invitation introuvable'
        });
      }

      // Vérifier que l'utilisateur est bien l'expéditeur
      if (invitation.sender.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Vous n\'êtes pas autorisé à annuler cette invitation'
        });
      }

      // Annuler l'invitation
      invitation.status = 'cancelled';
      await invitation.save();

      res.status(200).json({
        success: true,
        message: 'Invitation annulée avec succès'
      });

      // Notifier le destinataire via Socket.IO
      if (req.io) {
        req.io.to(invitation.receiver.toString()).emit('invitation-cancelled', {
          invitationId: invitation._id,
          cancelledBy: userId
        });
      }

    } catch (error) {
      console.error('Erreur annulation invitation:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'annulation de l\'invitation'
      });
    }
  },

  // Obtenir les invitations reçues
  getReceivedInvitations: async (req, res) => {
    try {
      const userId = req.user._id;
      const { status = 'pending' } = req.query;

      const invitations = await Invitation.find({
        receiver: userId,
        status: status
      })
        .populate('sender', 'firstName lastName username userName userType companyName email avatar')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        invitations,
        count: invitations.length
      });

    } catch (error) {
      console.error('Erreur récupération invitations:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des invitations'
      });
    }
  },

  // Obtenir les invitations envoyées
  getSentInvitations: async (req, res) => {
    try {
      const userId = req.user._id;
      const { status = 'pending' } = req.query;

      const invitations = await Invitation.find({
        sender: userId,
        status: status
      })
        .populate('receiver', 'firstName lastName username userName userType companyName email avatar')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        invitations,
        count: invitations.length
      });

    } catch (error) {
      console.error('Erreur récupération invitations envoyées:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des invitations envoyées'
      });
    }
  }
};

// Contrôleur pour les conversations
export const conversationController = {
  // Obtenir les conversations de l'utilisateur
  getConversations: async (req, res) => {
    try {
      const userId = req.user._id;

      const conversations = await Conversation.find({
        participants: userId,
        isActive: true
      })
        .populate('participants', 'firstName lastName username userName userType companyName email avatar')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

      // Calculer les messages non lus pour chaque conversation
      const conversationsWithUnread = await Promise.all(
        conversations.map(async (conversation) => {
          const unreadCount = await Message.countDocuments({
            conversation: conversation._id,
            receiver: userId,
            isRead: false
          });

          return {
            ...conversation.toObject(),
            unreadCount
          };
        })
      );

      res.status(200).json({
        success: true,
        conversations: conversationsWithUnread,
        count: conversationsWithUnread.length
      });

    } catch (error) {
      console.error('Erreur récupération conversations:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des conversations'
      });
    }
  },

  // Obtenir une conversation spécifique
  getConversation: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        isActive: true
      })
        .populate('participants', 'firstName lastName username userName userType companyName email avatar')
        .populate('invitation');

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation introuvable ou inaccessible'
        });
      }

      // Trouver l'autre participant
      const otherParticipant = conversation.participants.find(
        participant => participant._id.toString() !== userId.toString()
      );

      res.status(200).json({
        success: true,
        conversation: {
          ...conversation.toObject(),
          otherParticipant
        }
      });

    } catch (error) {
      console.error('Erreur récupération conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération de la conversation'
      });
    }
  },

  // Archiver une conversation
  archiveConversation: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation introuvable'
        });
      }

      conversation.isActive = false;
      await conversation.save();

      res.status(200).json({
        success: true,
        message: 'Conversation archivée avec succès'
      });

    } catch (error) {
      console.error('Erreur archivage conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'archivage de la conversation'
      });
    }
  }
};

// Contrôleur pour les messages
export const messageController = {
sendMessage: async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    const userId = req.user._id;
    const files = req.files || [];

    // Vérifier que la conversation existe et que l'utilisateur en fait partie
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true
    });

    if (!conversation) {
      // Supprimer les fichiers uploadés si la conversation n'existe pas
      if (files.length > 0) {
        files.forEach(async (file) => {
          try {
            const resourceType = file.mimetype?.startsWith('image/') ? 'image' : 'raw';
            await deleteCloudinaryFile(file.filename, resourceType);
          } catch (error) {
            console.error('Erreur suppression fichier:', error);
          }
        });
      }

      return res.status(404).json({
        success: false,
        error: 'Conversation introuvable ou inaccessible'
      });
    }

    // Trouver le destinataire
    const receiverId = conversation.participants.find(
      id => id.toString() !== userId.toString()
    );

    // Vérifier que le contenu ou les fichiers sont présents
    if ((!content || content.trim() === '') && files.length === 0) {
      // Supprimer les fichiers uploadés si aucun contenu
      if (files.length > 0) {
        files.forEach(async (file) => {
          try {
            const resourceType = file.mimetype?.startsWith('image/') ? 'image' : 'raw';
            await deleteCloudinaryFile(file.filename, resourceType);
          } catch (error) {
            console.error('Erreur suppression fichier:', error);
          }
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Le message ne peut pas être vide'
      });
    }

    // Préparer les pièces jointes
    const attachments = files.map(file => ({
      url: file.path,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      cloudinaryPublicId: file.filename
    }));

    // Créer le message
    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      receiver: receiverId,
      content: content?.trim() || '',
      attachments: attachments
    });

    // Mettre à jour la dernière conversation
    conversation.lastMessage = message._id;
    await conversation.save();

    // Populer les informations de l'expéditeur
    await message.populate('sender', 'firstName lastName username userName userType companyName email avatar');

    // Émettre l'événement Socket.IO
    if (req.io) {
      const socketData = {
        conversationId,
        message: {
          _id: message._id,
          content: message.content,
          sender: message.sender,
          attachments: message.attachments,
          isRead: message.isRead,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt
        }
      };

      // Envoyer à tous les participants de la conversation
      req.io.to(`conversation:${conversationId}`).emit('new-message', socketData);

      // Notifier le destinataire s'il n'est pas dans la conversation
      const sockets = req.io.sockets.sockets;
      const isReceiverInConversation = Array.from(sockets.values()).some(
        socket => socket.userId === receiverId.toString() && 
                 socket.rooms.has(`conversation:${conversationId}`)
      );

      if (!isReceiverInConversation) {
        req.io.to(`user:${receiverId}`).emit('new-message-notification', {
          conversationId,
          message: {
            _id: message._id,
            content: message.content.substring(0, 100),
            sender: message.sender,
            createdAt: message.createdAt
          }
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Message envoyé avec succès',
      data: message
    });

  } catch (error) {
    console.error('Erreur envoi message:', error);
    
    // Supprimer les fichiers uploadés en cas d'erreur
    if (req.files && req.files.length > 0) {
      req.files.forEach(async (file) => {
        try {
          const resourceType = file.mimetype?.startsWith('image/') ? 'image' : 'raw';
          await deleteCloudinaryFile(file.filename, resourceType);
        } catch (error) {
          console.error('Erreur suppression fichier après erreur:', error);
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du message'
    });
  }
},
  // Obtenir les messages d'une conversation
  getMessages: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;
      const { page = 1, limit = 50 } = req.query;

      // Vérifier que l'utilisateur a accès à la conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation introuvable ou inaccessible'
        });
      }

      // Calculer la pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Récupérer les messages
      const messages = await Message.find({ conversation: conversationId })
        .populate('sender', 'firstName lastName username userName userType companyName email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      // Compter le total des messages
      const total = await Message.countDocuments({ conversation: conversationId });

      // Marquer les messages comme lus (seulement ceux destinés à l'utilisateur)
      await Message.updateMany(
        {
          conversation: conversationId,
          receiver: userId,
          isRead: false
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      res.status(200).json({
        success: true,
        messages: messages.reverse(), // Remettre dans l'ordre chronologique
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

      // Notifier l'expéditeur que ses messages ont été lus
      if (req.io) {
        const unreadMessages = await Message.find({
          conversation: conversationId,
          sender: { $ne: userId },
          receiver: userId,
          isRead: false
        });

        if (unreadMessages.length > 0) {
          const otherParticipant = conversation.participants.find(
            id => id.toString() !== userId.toString()
          );

          req.io.to(otherParticipant.toString()).emit('messages-read', {
            conversationId,
            readBy: userId,
            messageIds: unreadMessages.map(msg => msg._id)
          });
        }
      }

    } catch (error) {
      console.error('Erreur récupération messages:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des messages'
      });
    }
  },

  // Supprimer un message
  deleteMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = req.user._id;

      const message = await Message.findById(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'Message introuvable'
        });
      }

      // Vérifier que l'utilisateur est l'expéditeur
      if (message.sender.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Vous ne pouvez supprimer que vos propres messages'
        });
      }

      // Vérifier que le message n'a pas plus de 1 heure
      const messageAge = Date.now() - new Date(message.createdAt).getTime();
      const oneHour = 60 * 60 * 1000;

      if (messageAge > oneHour) {
        return res.status(400).json({
          success: false,
          error: 'Vous ne pouvez supprimer que les messages de moins d\'une heure'
        });
      }

      // Supprimer les fichiers Cloudinary associés
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          if (attachment.cloudinaryPublicId) {
            try {
              const resourceType = attachment.mimetype?.startsWith('image/') ? 'image' : 'raw';
              await deleteCloudinaryFile(attachment.cloudinaryPublicId, resourceType);
            } catch (error) {
              console.error('Erreur suppression fichier Cloudinary:', error);
            }
          }
        }
      }

      // Supprimer le message
      await message.deleteOne();

      res.status(200).json({
        success: true,
        message: 'Message supprimé avec succès'
      });

      // Notifier via Socket.IO
      if (req.io) {
        req.io.to(message.receiver.toString()).emit('message-deleted', {
          conversationId: message.conversation,
          messageId: message._id,
          deletedBy: userId
        });

        // Mettre à jour la dernière conversation si nécessaire
        const lastMessage = await Message.findOne({ conversation: message.conversation })
          .sort({ createdAt: -1 });

        const conversationUpdate = {
          _id: message.conversation,
          lastMessage: lastMessage?._id || null,
          updatedAt: new Date()
        };

        const conversation = await Conversation.findById(message.conversation);
        if (conversation) {
          conversation.participants.forEach(participantId => {
            req.io.to(participantId.toString()).emit('conversation-updated', conversationUpdate);
          });
        }
      }

    } catch (error) {
      console.error('Erreur suppression message:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la suppression du message'
      });
    }
  },

  // Marquer les messages comme lus
  markAsRead: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;

      // Vérifier que l'utilisateur a accès à la conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation introuvable ou inaccessible'
        });
      }

      // Marquer tous les messages non lus comme lus
      const result = await Message.updateMany(
        {
          conversation: conversationId,
          receiver: userId,
          isRead: false
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} messages marqués comme lus`,
        modifiedCount: result.modifiedCount
      });

      // Notifier l'expéditeur via Socket.IO
      if (req.io && result.modifiedCount > 0) {
        const otherParticipant = conversation.participants.find(
          id => id.toString() !== userId.toString()
        );

        req.io.to(otherParticipant.toString()).emit('messages-read', {
          conversationId,
          readBy: userId,
          count: result.modifiedCount
        });
      }

    } catch (error) {
      console.error('Erreur marquage messages lus:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du marquage des messages comme lus'
      });
    }
  }
};

// ─── URL de téléchargement authentifiée Cloudinary ───────────────────────────
// Utilise private_download_url qui génère une URL api.cloudinary.com avec
// l'authentification dans les query params. Contourne les restrictions CDN (401).
// Calcul purement local (HMAC) : aucun appel réseau.
export const signAttachment = (req, res) => {
  res.set('Cache-Control', 'no-store');

  const { publicId, resourceType } = req.query;

  if (!publicId) {
    return res.status(400).json({ success: false, error: 'publicId requis' });
  }

  try {
    const rType = resourceType === 'image' ? 'image' : 'raw';
    const ext = path.extname(publicId).replace('.', '').toLowerCase();

    // sign_url:true génère une signature HMAC dans l'URL (s--xxx--) nécessaire quand
    // le compte Cloudinary a le mode "Signed URLs" activé (CDN retourne 401 sinon).
    // Pour les docs Office, fl_attachment force le téléchargement au lieu d'afficher du binaire.
    const isPDF = ext === 'pdf';
    const downloadUrl = cloudinary.url(publicId, {
      resource_type: rType,
      type: 'upload',
      sign_url: true,
      secure: true,
      ...(rType === 'raw' && !isPDF ? { flags: 'attachment' } : {}),
    });

    return res.json({ success: true, url: downloadUrl });
  } catch (error) {
    console.error('Erreur génération URL Cloudinary:', error);
    return res.status(500).json({ success: false, error: "Impossible de générer l'URL" });
  }
};

// ─── Statut de relation entre deux utilisateurs ──────────────────────────────
export const getRelationshipStatus = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { userId: otherUserId } = req.params;

    if (currentUserId.toString() === otherUserId) {
      return res.status(400).json({ success: false, error: 'Action impossible sur soi-même' });
    }

    const [blockDirection, conversation, invitation] = await Promise.all([
      Block.getBlockDirection(currentUserId, otherUserId),
      Conversation.findOne({
        participants: { $all: [currentUserId, otherUserId] },
        isActive: true,
      }),
      Invitation.findOne({
        $or: [
          { sender: currentUserId, receiver: otherUserId },
          { sender: otherUserId, receiver: currentUserId },
        ],
        status: 'pending',
      }),
    ]);

    res.json({
      success: true,
      status: {
        hasConversation: !!conversation,
        conversationId: conversation?._id ?? null,
        blockDirection,
        invitation: invitation
          ? {
              _id: invitation._id,
              direction: invitation.sender.toString() === currentUserId.toString() ? 'sent' : 'received',
              status: invitation.status,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Erreur statut relation:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// Correspondance extension → Content-Type correct
const MIME_BY_EXT = {
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':  'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt':  'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// Proxy de fichiers :
//  - PDF  → Content-Disposition: inline  (s'ouvre dans le viewer du navigateur)
//  - Docs → Content-Disposition: attachment (téléchargement forcé)
// Nécessaire car l'attribut HTML `download` est ignoré pour les URLs cross-origin,
// et Cloudinary raw/image peut renvoyer un Content-Type incorrect.
export const downloadController = {
  serveFile: async (req, res) => {
    const { url, filename, inline } = req.query;

    if (!url || !url.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ success: false, error: 'URL invalide' });
    }
    if (!filename || filename.length > 255) {
      return res.status(400).json({ success: false, error: 'Nom de fichier invalide' });
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ success: false, error: 'Fichier inaccessible sur Cloudinary' });
      }

      // Forcer le bon Content-Type à partir de l'extension du fichier original
      const ext = path.extname(filename).toLowerCase();
      const contentType = MIME_BY_EXT[ext] || response.headers.get('content-type') || 'application/octet-stream';

      // inline=1 → lecture dans le navigateur (PDF), sinon téléchargement
      const disposition = inline === '1'
        ? `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
        : `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;

      const buffer = await response.arrayBuffer();

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Content-Length': buffer.byteLength,
        'Cache-Control': 'private, max-age=3600',
      });

      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Erreur proxy fichier:', error);
      res.status(500).json({ success: false, error: 'Échec du chargement du fichier' });
    }
  },
};