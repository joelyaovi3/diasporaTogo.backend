// models/notificationModel.js
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'invitation_received',
      'invitation_accepted',
      'invitation_rejected',
      'new_message',
      'news_submitted',
      'news_accepted',
      'news_declined',
      'news_blocked'
    ],
    required: true
  },
  // Référence polymorphe vers l'objet source
  refModel: {
    type: String,
    enum: ['Invitation', 'Message', 'Conversation', 'News'],
    required: true
  },
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // Snapshot des données au moment de la création (évite les populate coûteux)
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date
}, {
  timestamps: true
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
// Suppression automatique après 30 jours
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
