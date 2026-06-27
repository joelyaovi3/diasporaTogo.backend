// models/messageModel.js
import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: function() {
      return !this.attachments || this.attachments.length === 0;
    },
    set: encrypt,
    get: decrypt
  },
  attachments: [new mongoose.Schema({
    url: {
      type: String,
      required: true,
      set: encrypt,
      get: decrypt
    },
    filename: {
      type: String,
      set: encrypt,
      get: decrypt
    },
    mimetype: String,
    size: Number,
    cloudinaryPublicId: String
  }, {
    toJSON: { getters: true },
    toObject: { getters: true }
  })],
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  deliveredAt: {
    type: Date,
    default: Date.now
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  // Historique limité aux 5 dernières versions pour garder une trace sans surcharger
  editHistory: [new mongoose.Schema({
    content: { type: String, set: encrypt, get: decrypt },
    editedAt: { type: Date, default: Date.now }
  }, {
    toJSON: { getters: true },
    toObject: { getters: true }
  })]
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Index pour les performances
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ isRead: 1 });
messageSchema.index({ createdAt: -1 });

// Middleware pour s'assurer que sender et receiver sont dans la conversation
messageSchema.pre('save', async function(next) {
  const Conversation = mongoose.model('Conversation');
  const conversation = await Conversation.findById(this.conversation);
  
  if (!conversation) {
    return next(new Error('Conversation introuvable'));
  }
  
  if (!conversation.participants.includes(this.sender)) {
    return next(new Error('L\'expéditeur ne fait pas partie de la conversation'));
  }
  
  if (!conversation.participants.includes(this.receiver)) {
    return next(new Error('Le destinataire ne fait pas partie de la conversation'));
  }
  
  next();
});

const Message = mongoose.model('Message', messageSchema);
export default Message;