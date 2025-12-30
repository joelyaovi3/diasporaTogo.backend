import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
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
    maxlength: 500,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false }
});

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Le commentaire est obligatoire'],
    trim: true,
    minlength: [1, 'Le commentaire ne peut pas être vide'],
    maxlength: [2000, 'Le commentaire ne peut pas dépasser 2000 caractères']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'hidden', 'deleted', 'pending_moderation'],
    default: 'active'
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: Date,
    reason: String
  }],
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  depth: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reports: [reportSchema],
  reportCount: {
    type: Number,
    default: 0
  },
  moderatorNote: {
    type: String,
    maxlength: 500,
    trim: true
  }
}, {
  timestamps: true,
  _id: true // Important pour avoir des IDs pour les sous-documents
});

// Index pour les commentaires
commentSchema.index({ news: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: 1 });
commentSchema.index({ author: 1, status: 1 });
commentSchema.index({ status: 1, reportCount: -1 });

const NewsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Le titre est obligatoire'],
    trim: true,
    minlength: [5, 'Le titre doit contenir au moins 5 caractères'],
    maxlength: [200, 'Le titre ne peut pas dépasser 200 caractères']
  },
  image: {
    type: String,
    default: '',
    validate: {
      validator: function(v) {
        if (!v) return true;
        return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/');
      },
      message: 'URL d\'image invalide'
    }
  },
  description: {
    type: String,
    required: [true, 'La description est obligatoire'],
    minlength: [50, 'La description doit contenir au moins 50 caractères'],
    maxlength: [5000, 'La description ne peut pas dépasser 5000 caractères'],
    trim: true
  },
  status: { 
    type: String, 
    default: 'pending', 
    enum: {
      values: ['pending', 'accepted', 'declined', 'archived'],
      message: 'Statut invalide'
    }
  },
  // Commentaire interne pour les administrateurs/modérateurs
  internalNotes: [{
    note: {
      type: String,
      required: true,
      maxlength: [1000, 'La note ne peut pas dépasser 1000 caractères'],
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    visibility: {
      type: String,
      enum: ['admin', 'moderator', 'all_staff'],
      default: 'all_staff'
    },
    category: {
      type: String,
      enum: ['moderation', 'edit', 'info', 'warning', 'other'],
      default: 'other'
    }
  }],
  likes: { 
    type: Number, 
    default: 0,
    min: 0
  },
  dislikes: { 
    type: Number, 
    default: 0,
    min: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  dislikedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'auteur est obligatoire'],
    index: true
  },
  category: {
    type: String,
    enum: ['sports', 'technology', 'entertainment', 'health', 'business', 'science', 'other'],
    default: 'other',
    index: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  comments: [commentSchema], // Commentaires intégrés
  commentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  latestComments: [{ // Derniers commentaires (mis à jour régulièrement)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  reports: [reportSchema],
  reportCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isBlocked: {
    type: Boolean,
    default: false,
    index: true
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  commentSettings: {
    enabled: {
      type: Boolean,
      default: true
    },
    moderationRequired: {
      type: Boolean,
      default: false
    },
    maxCommentsPerUser: {
      type: Number,
      default: 50,
      min: 1
    },
    autoCloseAfterDays: {
      type: Number,
      default: 30, // Fermer les commentaires après 30 jours
      min: 0
    }
  },
  lastCommentAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index composés
NewsSchema.index({ status: 1, createdAt: -1 });
NewsSchema.index({ author: 1, createdAt: -1 });
NewsSchema.index({ isBlocked: 1, status: 1 });
NewsSchema.index({ reportCount: -1, createdAt: -1 });
NewsSchema.index({ commentCount: -1, createdAt: -1 });
NewsSchema.index({ lastCommentAt: -1 });

// Virtual pour calculer l'engagement
NewsSchema.virtual('engagement').get(function() {
  return this.likes + this.dislikes + this.views + this.commentCount;
});

// Virtual pour vérifier si les commentaires sont ouverts
NewsSchema.virtual('commentsOpen').get(function() {
  if (!this.commentSettings.enabled) return false;
  
  if (this.commentSettings.autoCloseAfterDays > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.commentSettings.autoCloseAfterDays);
    
    if (this.createdAt < cutoffDate) {
      return false;
    }
  }
  
  return true;
});

// Méthodes pour les commentaires

// Ajouter un commentaire
NewsSchema.methods.addComment = async function(content, authorId, parentCommentId = null) {
  if (!this.commentsOpen) {
    throw new Error('Les commentaires sont fermés pour cette news');
  }
  
  // Vérifier le nombre maximum de commentaires par utilisateur
  const userCommentCount = this.comments.filter(
    comment => comment.author.equals(authorId) && comment.status !== 'deleted'
  ).length;
  
  if (userCommentCount >= this.commentSettings.maxCommentsPerUser) {
    throw new Error(`Limite de ${this.commentSettings.maxCommentsPerUser} commentaires atteinte`);
  }
  
  let depth = 0;
  if (parentCommentId) {
    const parentComment = this.comments.id(parentCommentId);
    if (!parentComment) {
      throw new Error('Commentaire parent non trouvé');
    }
    if (parentComment.depth >= 5) {
      throw new Error('Profondeur maximale de réponse atteinte');
    }
    depth = parentComment.depth + 1;
  }
  
  const newComment = {
    content,
    author: authorId,
    status: this.commentSettings.moderationRequired ? 'pending_moderation' : 'active',
    parentComment: parentCommentId,
    depth
  };
  
  this.comments.push(newComment);
  this.commentCount = this.comments.filter(c => c.status === 'active').length;
  this.lastCommentAt = new Date();
  
  // Garder les 5 derniers commentaires actifs dans latestComments
  const activeComments = this.comments
    .filter(c => c.status === 'active')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .map(c => c._id);
  
  this.latestComments = activeComments;
  
  return this.save();
};

// Modifier un commentaire
NewsSchema.methods.editComment = async function(commentId, newContent, authorId, reason = '') {
  const comment = this.comments.id(commentId);
  
  if (!comment) {
    throw new Error('Commentaire non trouvé');
  }
  
  if (!comment.author.equals(authorId)) {
    throw new Error('Non autorisé à modifier ce commentaire');
  }
  
  // Sauvegarder l'ancienne version dans l'historique
  comment.editHistory.push({
    content: comment.content,
    editedAt: new Date(),
    reason
  });
  
  comment.content = newContent;
  comment.isEdited = true;
  comment.updatedAt = new Date();
  
  return this.save();
};

// Supprimer un commentaire (soft delete)
NewsSchema.methods.deleteComment = async function(commentId, authorId, isAdmin = false) {
  const comment = this.comments.id(commentId);
  
  if (!comment) {
    throw new Error('Commentaire non trouvé');
  }
  
  if (!isAdmin && !comment.author.equals(authorId)) {
    throw new Error('Non autorisé à supprimer ce commentaire');
  }
  
  comment.status = 'deleted';
  comment.content = '[Commentaire supprimé]';
  this.commentCount = this.comments.filter(c => c.status === 'active').length;
  
  return this.save();
};

// Modérer un commentaire (admin/moderator)
NewsSchema.methods.moderateComment = async function(commentId, action, moderatorId, note = '') {
  const comment = this.comments.id(commentId);
  
  if (!comment) {
    throw new Error('Commentaire non trouvé');
  }
  
  const validActions = {
    approve: 'active',
    hide: 'hidden',
    reject: 'deleted',
    pending: 'pending_moderation'
  };
  
  if (!validActions[action]) {
    throw new Error('Action de modération invalide');
  }
  
  comment.status = validActions[action];
  comment.moderatorNote = note;
  
  if (action === 'hide' || action === 'reject') {
    comment.reportCount = 0; // Réinitialiser les signalements
  }
  
  this.commentCount = this.comments.filter(c => c.status === 'active').length;
  
  return this.save();
};

// Ajouter une note interne (admin/staff)
NewsSchema.methods.addInternalNote = async function(note, createdBy, visibility = 'all_staff', category = 'other') {
  this.internalNotes.push({
    note,
    createdBy,
    visibility,
    category,
    createdAt: new Date()
  });
  
  return this.save();
};

// Méthode pour signaler un commentaire
NewsSchema.methods.reportComment = async function(commentId, userId, reason, description = '') {
  const comment = this.comments.id(commentId);
  
  if (!comment) {
    throw new Error('Commentaire non trouvé');
  }
  
  // Vérifier si l'utilisateur a déjà signalé ce commentaire
  const existingReport = comment.reports.find(
    report => report.reportedBy.equals(userId) && report.status === 'pending'
  );
  
  if (existingReport) {
    throw new Error('Vous avez déjà signalé ce commentaire');
  }
  
  comment.reports.push({
    reportedBy: userId,
    reason,
    description,
    status: 'pending'
  });
  
  comment.reportCount = comment.reports.filter(r => r.status === 'pending').length;
  
  // Si trop de signalements, mettre en attente de modération
  if (comment.reportCount >= 3 && comment.status === 'active') {
    comment.status = 'pending_moderation';
  }
  
  return this.save();
};

// Méthode pour liker un commentaire
NewsSchema.methods.likeComment = async function(commentId, userId) {
  const comment = this.comments.id(commentId);
  
  if (!comment) {
    throw new Error('Commentaire non trouvé');
  }
  
  if (!comment.likedBy.includes(userId)) {
    comment.likedBy.push(userId);
    comment.likes += 1;
  }
  
  return this.save();
};

// Méthodes héritées du modèle précédent (optimisées)
NewsSchema.methods.addReport = async function(userId, reason, description = '') {
  const existingReport = this.reports.find(
    report => report.reportedBy.equals(userId) && report.status === 'pending'
  );
  
  if (existingReport) {
    throw new Error('Vous avez déjà signalé cette news');
  }
  
  this.reports.push({
    reportedBy: userId,
    reason,
    description,
    status: 'pending'
  });
  
  this.reportCount = this.reports.filter(r => r.status === 'pending').length;
  
  const REPORT_THRESHOLD = 5;
  if (this.reportCount >= REPORT_THRESHOLD && !this.isBlocked) {
    this.isBlocked = true;
    this.status = 'declined';
  }
  
  return this.save();
};

// Méthodes pour likes/dislikes de la news
// Méthodes pour likes/dislikes de la news
NewsSchema.methods.addLike = async function(userId) {
  const likeIndex = this.likedBy.indexOf(userId);
  const dislikeIndex = this.dislikedBy.indexOf(userId);
  
  // Si l'utilisateur a déjà disliké, on retire le dislike d'abord
  if (dislikeIndex > -1) {
    this.dislikedBy.splice(dislikeIndex, 1);
    this.dislikes = Math.max(0, this.dislikes - 1);
  }
  
  // Si l'utilisateur n'a pas déjà liké, on ajoute le like
  if (likeIndex === -1) {
    this.likedBy.push(userId);
    this.likes += 1;
  } else {
    // Si l'utilisateur a déjà liké, on retire le like
    this.likedBy.splice(likeIndex, 1);
    this.likes = Math.max(0, this.likes - 1);
  }
  
  return this.save();
};

// Méthode pour ajouter/supprimer un dislike
NewsSchema.methods.addDislike = async function(userId) {
  const likeIndex = this.likedBy.indexOf(userId);
  const dislikeIndex = this.dislikedBy.indexOf(userId);
  
  // Si l'utilisateur a déjà liké, on retire le like d'abord
  if (likeIndex > -1) {
    this.likedBy.splice(likeIndex, 1);
    this.likes = Math.max(0, this.likes - 1);
  }
  
  // Si l'utilisateur n'a pas déjà disliké, on ajoute le dislike
  if (dislikeIndex === -1) {
    this.dislikedBy.push(userId);
    this.dislikes += 1;
  } else {
    // Si l'utilisateur a déjà disliké, on retire le dislike
    this.dislikedBy.splice(dislikeIndex, 1);
    this.dislikes = Math.max(0, this.dislikes - 1);
  }
  
  return this.save();
};

// Middleware pour nettoyer les tags
NewsSchema.pre('save', function(next) {
  if (this.tags) {
    this.tags = [...new Set(this.tags.map(tag => tag.toLowerCase().trim()))];
  }
  next();
});

// Méthodes statiques
NewsSchema.statics.findPopular = function(limit = 10) {
  return this.find({ 
    isBlocked: false, 
    status: 'accepted',
    'commentSettings.enabled': true 
  })
  .sort({ likes: -1, views: -1, commentCount: -1 })
  .limit(limit)
  .populate('author', 'username avatar')
  .populate('latestComments');
};

NewsSchema.statics.findWithComments = function(newsId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.findById(newsId)
    .populate({
      path: 'comments',
      match: { status: 'active' },
      options: {
        sort: { createdAt: -1 },
        skip: skip,
        limit: limit
      },
      populate: {
        path: 'author',
        select: 'username avatar'
      }
    })
    .populate('author', 'username avatar');
};

const NewsModel = mongoose.model('News', NewsSchema);

export default NewsModel;