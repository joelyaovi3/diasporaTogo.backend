// models/conversationModel.js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  invitation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invitation',
    required: true
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// S'assurer qu'il y a exactement 2 participants
conversationSchema.pre('validate', function(next) {
  if (this.participants && this.participants.length !== 2) {
    next(new Error('Une conversation doit avoir exactement 2 participants'));
  } else {
    next();
  }
});

// Index pour les recherches
conversationSchema.index({ participants: 1 });
conversationSchema.index({ isActive: 1, updatedAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;