// config/socketConfig.js - Version corrigée et complète
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import Invitation from '../models/invitationModel.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';

export const configureSocket = (server) => {
  const socketAllowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://diasporatogo-teal.vercel.app',
    'https://diasporatogo.com',
    'https://www.diasporatogo.com',
  ];

  if (process.env.CLIENT_URL) {
    socketAllowedOrigins.push(process.env.CLIENT_URL);
  }

  const io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        if (
          !origin ||
          socketAllowedOrigins.includes(origin) ||
          /^https:\/\/diasporatogo[\w-]*\.vercel\.app$/.test(origin)
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 10000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true
    }
  });

  // Middleware d'authentification
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.split(' ')[1] ||
                   socket.handshake.query.token;

      if (!token) {
        console.log('❌ Socket auth: Token manquant');
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, process.env.SECRET);
      const user = await User.findById(decoded.id || decoded.userId)
        .select('-password -verificationCode');

      if (!user) {
        console.log('❌ Socket auth: Utilisateur non trouvé');
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      socket.connectedAt = new Date();
      
      console.log(`✅ Socket auth réussie: ${user.email} (${socket.userId})`);
      next();
    } catch (error) {
      console.error('❌ Socket auth error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

 
  
  // Émettre un événement de bienvenue
  
  io.on('connection', (socket) => {
    console.log(`✅ Socket connecté: ${socket.userId} (${socket.user.userName})`);
    
    // Rejoindre la room personnelle
    socket.join(`user:${socket.userId}`);
    
    socket.emit('welcome', {
      message: 'Bienvenue sur le chat',
      userId: socket.userId,
      socketId: socket.id,
      connectedAt: socket.connectedAt
    });
    // Événement pour rejoindre une conversation
    socket.on('join-conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} a rejoint conversation ${conversationId}`);
      
      // Notifier les autres participants
      socket.to(`conversation:${conversationId}`).emit('user-joined-conversation', {
        userId: socket.userId,
        username: socket.user.userName
      });
    });

    // Événement pour quitter une conversation
    socket.on('leave-conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} a quitté conversation ${conversationId}`);
    });

    // Événement pour envoyer un message
   // config/socketConfig.js - Version corrigée avec gestion des conversations
socket.on('send-message', async (data) => {
  try {
    const { conversationId, content, attachments = [] } = data;
    
    console.log('📨 Nouveau message reçu:', {
      from: socket.userId,
      conversationId,
      content: content?.substring(0, 50) + '...'
    });

    // Vérifier si c'est une nouvelle conversation ou une conversation existante
    let conversation = await Conversation.findOne({
      _id: conversationId,
      participants: socket.userId,
      isActive: true
    });

    let isNewConversation = false;
    
    if (!conversation) {
      // Si la conversation n'existe pas, vérifier si c'est un destinataire direct
      const receiverId = conversationId; // Dans ce cas, conversationId est en fait receiverId
      
      // Vérifier si une conversation existe déjà entre ces deux utilisateurs
      conversation = await Conversation.findOne({
        participants: { $all: [socket.userId, receiverId] },
        isActive: true
      });

      if (!conversation) {
        // Créer une nouvelle conversation
        isNewConversation = true;
        conversation = await Conversation.create({
          participants: [socket.userId, receiverId]
        });
        console.log(`💬 Nouvelle conversation créée: ${conversation._id}`);
      }
    }

    // Trouver le destinataire
    const receiverId = conversation.participants.find(
      id => id.toString() !== socket.userId.toString()
    );

    // Récupérer les informations du destinataire
    const receiver = await User.findById(receiverId).select('firstName lastName username email avatar');

    // Créer le message dans la base de données
    const message = await Message.create({
      conversation: conversation._id,
      sender: socket.userId,
      receiver: receiverId,
      content: content?.trim() || '',
      attachments: attachments
    });

    // Mettre à jour la conversation
    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    // Populer les infos de l'expéditeur
    await message.populate('sender', 'firstName lastName username email avatar');

    console.log('✅ Message créé:', message._id);

    // Émettre le message à tous les participants de la conversation
    io.to(`conversation:${conversation._id}`).emit('new-message', {
      conversationId: conversation._id,
      message: {
        _id: message._id,
        content: message.content,
        sender: message.sender,
        attachments: message.attachments,
        isRead: message.isRead,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt
      }
    });

    // Si c'est une nouvelle conversation, notifier les deux utilisateurs
    if (isNewConversation) {
      io.to(`user:${receiverId}`).emit('new-conversation', {
        conversationId: conversation._id,
        participants: conversation.participants,
        otherParticipant: socket.user,
        lastMessage: message,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      });

      io.to(`user:${socket.userId}`).emit('new-conversation', {
        conversationId: conversation._id,
        participants: conversation.participants,
        otherParticipant: receiver,
        lastMessage: message,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      });
    } else {
      // Si c'est une conversation existante, émettre une mise à jour
      const conversationUpdate = {
        _id: conversation._id,
        lastMessage: message,
        updatedAt: conversation.updatedAt
      };

      io.to(`user:${receiverId}`).emit('conversation-updated', {
        ...conversationUpdate,
        unreadCount: 1 // Le destinataire a un nouveau message non lu
      });

      io.to(`user:${socket.userId}`).emit('conversation-updated', {
        ...conversationUpdate,
        unreadCount: 0 // L'expéditeur a déjà vu le message
      });
    }

    // Notifier le destinataire s'il n'est pas dans la conversation
    if (!io.sockets.adapter.rooms.get(`conversation:${conversation._id}`)?.has(socket.id)) {
      io.to(`user:${receiverId}`).emit('new-message-notification', {
        conversationId: conversation._id,
        message: {
          _id: message._id,
          content: message.content,
          sender: message.sender,
          createdAt: message.createdAt
        }
      });
    }

    // Confirmer l'envoi à l'expéditeur
    socket.emit('message-sent', {
      conversationId: conversation._id,
      message: {
        _id: message._id,
        content: message.content,
        sender: message.sender,
        attachments: message.attachments,
        isRead: true, // L'expéditeur a déjà vu son message
        createdAt: message.createdAt,
        updatedAt: message.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Erreur envoi message:', error);
    socket.emit('message-error', { 
      error: 'Erreur lors de l\'envoi du message',
      details: error.message
    });
  }
});

    // Événement pour l'indicateur "en train d'écrire"
    socket.on('typing', (data) => {
      const { conversationId, isTyping } = data;
      
      socket.to(`conversation:${conversationId}`).emit('user-typing', {
        userId: socket.userId,
        username: socket.user.userName,
        isTyping,
        conversationId
      });
    });

    socket.on('invitation-accepted', async (data) => {
  try {
    const { invitationId } = data;
    
    const invitation = await Invitation.findById(invitationId)
      .populate('sender', 'firstName lastName username email avatar')
      .populate('receiver', 'firstName lastName username email avatar');

    if (!invitation || invitation.status !== 'accepted') {
      return;
    }

    // Créer une nouvelle conversation
    const conversation = await Conversation.create({
      participants: [invitation.sender._id, invitation.receiver._id],
      invitation: invitationId
    });

    // Notifier les deux utilisateurs
    io.to(`user:${invitation.sender._id}`).emit('new-conversation', {
      conversationId: conversation._id,
      participants: conversation.participants,
      otherParticipant: invitation.receiver,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    });

    io.to(`user:${invitation.receiver._id}`).emit('new-conversation', {
      conversationId: conversation._id,
      participants: conversation.participants,
      otherParticipant: invitation.sender,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    });

    console.log(`💬 Nouvelle conversation créée: ${conversation._id}`);

  } catch (error) {
    console.error('Erreur création conversation:', error);
  }
});

    // Événement pour marquer les messages comme lus
    socket.on('mark-messages-read', async (data) => {
      try {
        const { conversationId } = data;
        
        const result = await Message.updateMany(
          {
            conversation: conversationId,
            receiver: socket.userId,
            isRead: false
          },
          {
            isRead: true,
            readAt: new Date()
          }
        );

        if (result.modifiedCount > 0) {
          // Notifier l'expéditeur
          const conversation = await Conversation.findById(conversationId);
          if (conversation) {
            const otherParticipant = conversation.participants.find(
              id => id.toString() !== socket.userId
            );
            
            io.to(`user:${otherParticipant}`).emit('messages-read', {
              conversationId,
              readBy: socket.userId,
              count: result.modifiedCount
            });
          }
        }

      } catch (error) {
        console.error('Erreur marquage messages lus:', error);
      }
    });

    // Événements pour les invitations
    socket.on('send-invitation', async (data) => {
      try {
        const { receiverId, message } = data;
        
        // Vérifier que l'invitation n'existe pas déjà
        const existingInvitation = await Invitation.findOne({
          $or: [
            { sender: socket.userId, receiver: receiverId },
            { sender: receiverId, receiver: socket.userId }
          ],
          status: { $in: ['pending', 'accepted'] }
        });

        if (existingInvitation) {
          socket.emit('invitation-error', {
            error: existingInvitation.status === 'pending' 
              ? 'Une invitation est déjà en attente' 
              : 'Vous avez déjà une conversation active'
          });
          return;
        }

        // Créer l'invitation
        const invitation = await Invitation.create({
          sender: socket.userId,
          receiver: receiverId,
          message: message || `Bonjour, je souhaite discuter avec vous`
        });

        await invitation.populate([
          { path: 'sender', select: 'firstName lastName username email avatar' },
          { path: 'receiver', select: 'firstName lastName username email avatar' }
        ]);

        // Émettre au destinataire
        io.to(`user:${receiverId}`).emit('new-invitation', {
          invitation: {
            _id: invitation._id,
            sender: invitation.sender,
            receiver: invitation.receiver,
            status: invitation.status,
            message: invitation.message,
            createdAt: invitation.createdAt
          }
        });

        // Confirmer à l'expéditeur
        socket.emit('invitation-sent', { 
          invitation: {
            _id: invitation._id,
            sender: invitation.sender,
            receiver: invitation.receiver,
            status: invitation.status,
            message: invitation.message,
            createdAt: invitation.createdAt
          }
        });

      } catch (error) {
        console.error('Error sending invitation via socket:', error);
        socket.emit('invitation-error', { error: 'Failed to send invitation' });
      }
    });

    // Gestion de la déconnexion
    socket.on('disconnect', () => {
      console.log(`❌ Socket déconnecté: ${socket.userId}`);
    });

    // Gestion des erreurs
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);
    });
  });


  return io;
};