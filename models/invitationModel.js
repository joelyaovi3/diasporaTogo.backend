// models/invitationModel.js
import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
    default: 'pending'
  },
  message: {
    type: String,
    maxlength: 200
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
  }
}, {
  timestamps: true
});

// Index pour les recherches rapides
invitationSchema.index({ sender: 1, receiver: 1 });
invitationSchema.index({ status: 1, expiresAt: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Vérifier si une invitation existe déjà
invitationSchema.statics.invitationExists = async function(senderId, receiverId) {
  return await this.findOne({
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId }
    ],
    status: { $in: ['pending', 'accepted'] }
  });
};

const Invitation = mongoose.model('Invitation', invitationSchema);
export default Invitation;