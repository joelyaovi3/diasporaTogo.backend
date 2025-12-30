import mongoose from 'mongoose';

const chatSchema = mongoose.Schema(
  {
    photo: {
      type: String,
      default: 'https://cdn-icons-png.flaticon.com/512/9790/9790561.png',
    },
    chatName: { type: String },
    image: {type: String, default:''},
    isGroup: { type: Boolean, default: false },
    isNews: { type: Boolean, default: false },
    status: { 
      type: String, 
      default: 'pending', 
      enum: ['pending', 'accepted', 'declined'] 
    },
    description: { type: String },
    comment: { type: String },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    dislikedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    newsAuth: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
      },
    ],
    unreadMessages: {
      type: Map,
      of: Number,
      default: {}
    },
    // Nouvelle fonctionnalité de signalement
    reports: [
      {
        reportedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        reason: {
          type: String,
          required: true,
          enum: [
            'spam', 
            'inappropriate', 
            'false_information', 
            'hate_speech', 
            'harassment',
            'other'
          ]
        },
        description: {
          type: String,
          maxlength: 500
        },
        status: {
          type: String,
          enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
          default: 'pending'
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    reportCount: {
      type: Number,
      default: 0
    },
    isBlocked: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

// Méthode pour ajouter un signalement
chatSchema.methods.addReport = async function(userId, reason, description = '') {
  this.reports.push({
    reportedBy: userId,
    reason,
    description,
    status: 'pending'
  });
  
  this.reportCount = this.reports.length;
  
  // Si le nombre de signalements dépasse un seuil (ex: 5), bloquer la news
  if (this.reportCount >= 5) {
    this.isBlocked = true;
  }
  
  await this.save();
  return this;
};

// Méthode pour traiter un signalement (admin)
chatSchema.methods.handleReport = async function(reportId, status) {
  const report = this.reports.id(reportId);
  if (!report) {
    throw new Error('Report not found');
  }
  
  report.status = status;
  
  // Si le statut est "resolved" et qu'il n'y a plus de signalements en attente, débloquer
  if (status === 'resolved' && !this.reports.some(r => r.status === 'pending')) {
    this.isBlocked = false;
  }
  
  await this.save();
  return this;
};

const chatModel = mongoose.model('Chat', chatSchema);
export default chatModel;