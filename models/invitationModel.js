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
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'],
    default: 'pending'
  },
  message: {
    type: String,
    maxlength: 200
  },
  // Seules les invitations "pending" expirent et sont supprimées par le TTL.
  // Les invitations acceptées/rejetées sont conservées indéfiniment via pendingExpiresAt=null.
  pendingExpiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
  },
  respondedAt: Date
}, {
  timestamps: true
});

invitationSchema.index({ sender: 1, receiver: 1 });
invitationSchema.index({ receiver: 1, status: 1, createdAt: -1 });
invitationSchema.index({ sender: 1, status: 1, createdAt: -1 });
// TTL uniquement sur les invitations pending (pendingExpiresAt est mis à null dès qu'on répond)
invitationSchema.index({ pendingExpiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

// Neutraliser le TTL dès qu'une réponse est donnée
invitationSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status !== 'pending') {
    this.pendingExpiresAt = null;
    this.respondedAt = new Date();
  }
  next();
});

invitationSchema.statics.invitationExists = async function(senderId, receiverId) {
  return await this.findOne({
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId }
    ],
    status: { $in: ['pending', 'accepted'] }
  });
};

// Nombre d'invitations envoyées dans les dernières 24h (rate limiting)
invitationSchema.statics.countRecentSent = async function(senderId) {
  return await this.countDocuments({
    sender: senderId,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
};

const Invitation = mongoose.model('Invitation', invitationSchema);
export default Invitation;