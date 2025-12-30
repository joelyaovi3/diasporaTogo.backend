import News from '../models/NewsModel.js';
import { deleteOldImage } from '../middleware/cloudinaryMiddleware.js';
import mongoose from 'mongoose';

// @desc    Créer une nouvelle news
// @route   POST /api/news
// @access  Privé (Auteur)
export const createNews = async (req, res) => {
  try {
    const { title, description, category, tags } = req.body;
    
    // L'utilisateur est déjà disponible via le middleware Auth
    // req.rootUser contient l'utilisateur connecté (sans le mot de passe)
    
    // Vérifier si l'utilisateur a déjà posté trop de news en attente
    const pendingNewsCount = await News.countDocuments({
      author: req.rootUserId,
      status: 'pending'
    });
    
    if (pendingNewsCount >= 10) {
      return res.status(400).json({
        success: false,
        message: 'Vous avez trop de news en attente de validation'
      });
    }
    
    const news = new News({
      title,
      description,
      image: req.body.image || '',
      author: req.rootUserId,
      category: category || 'other',
      tags: tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : []
    });
    
    const savedNews = await news.save();
    
    // Populer les informations de l'auteur avant de renvoyer la réponse
    await savedNews.populate('author', 'username email avatar');
    
    // Option 1: Inclure directement les infos de l'utilisateur dans la réponse
    const responseData = {
      ...savedNews.toObject(),
      authorInfo: {
        username: req.rootUser.username,
        email: req.rootUser.email,
        avatar: req.rootUser.avatar,
        _id: req.rootUser._id
      }
    };
    
    // Option 2: Utiliser populate standard (recommandé pour la cohérence)
    // const populatedNews = await News.findById(savedNews._id)
    //   .populate('author', 'username email avatar');
    
    res.status(201).json({
      success: true,
      data: responseData, // Utilisez cette option
      message: 'News créée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur création news:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création'
    });
  }
};

// @desc    Récupérer toutes les news (avec filtres)
// @route   GET /api/news
// @access  Public
export const getAllNews = async (req, res) => {
 try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      author,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Construction des filtres avec validations
    const filter = { isBlocked: false };
    
    // Si l'utilisateur n'est pas authentifié, afficher seulement les news acceptées
    if (!req.user) {
      filter.status = 'accepted';
    } else if (status && ['pending', 'accepted', 'declined', 'archived'].includes(status)) {
      filter.status = status;
    } else {
      filter.status = 'accepted'; // Par défaut
    }
    
    // Filtres conditionnels
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (author) {
      filter.author = author;
    }
    
    // Recherche optimisée
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ];
    }
    
    // Tri avec validation
    const sortOptions = {
      createdAt: sortBy === 'createdAt',
      likes: sortBy === 'likes',
      views: sortBy === 'views',
      comments: sortBy === 'comments'
    };
    
    const sortField = sortBy in sortOptions ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortDirection };
    
    // Pagination sécurisée
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Limite max à 100
    const skip = (pageNum - 1) * limitNum;
    
    // Requête optimisée avec projection
    const [news, total] = await Promise.all([
      News.find(filter)
        .populate({
          path: 'author',
          select: 'username email avatar _id',
          model: 'User'
        })
        .select('-internalNotes -reports -__v -comments')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      News.countDocuments(filter)
    ]);
    
    // Calcul du nombre de pages
    const totalPages = Math.ceil(total / limitNum);
    
    // Pour chaque news, récupérer les derniers commentaires séparément si nécessaire
    // Option 1: Inclure seulement le count
    const newsWithComments = news.map(item => ({
      ...item,
      // Vous pouvez ajouter d'autres données de commentaire si besoin
      latestComments: [] // Vide ou avec des données basiques
    }));
    
    res.json({
      success: true,
      data: newsWithComments,
      pagination: {
        total,
        page: pageNum,
        pages: totalPages,
        limit: limitNum,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      filters: {
        status: filter.status,
        ...(category && { category }),
        ...(search && { search })
      }
    });
    
  } catch (error) {
    console.error('Erreur récupération news:', error);
    
    // Gestion d'erreur plus détaillée
    const errorMessage = error.name === 'CastError' 
      ? 'Paramètres de requête invalides'
      : 'Erreur serveur lors de la récupération des articles';
    
    res.status(error.name === 'CastError' ? 400 : 500).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

// @desc    Récupérer les news populaires
// @route   GET /api/news/popular
// @access  Public
export const getPopularNews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const popularNews = await News.findPopular(limit);
    
    res.json({
      success: true,
      data: popularNews
    });
  } catch (error) {
    console.error('Erreur récupération news populaires:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Récupérer une news par ID
// @route   GET /api/news/:id
// @access  Public
export const getNewsById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeComments = 'false', commentPage = 1, commentLimit = 20 } = req.query;
    
    let news;
    
    if (includeComments === 'true') {
      news = await News.findWithComments(id, parseInt(commentPage), parseInt(commentLimit));
    } else {
      news = await News.findById(id)
        .populate('author', 'username avatar')
        .select('-internalNotes -reports');
    }
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    // Incrémenter le compteur de vues
    news.views += 1;
    await news.save();
    
    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    console.error('Erreur récupération news:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID invalide'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Mettre à jour une news
// @route   PUT /api/news/:id
// @access  Privé (Auteur ou Admin)
export const updateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Récupérer la news
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    // Vérifier les permissions
    const isAuthor = news.author.toString() === req.rootUserId.toString();
    const isAdmin = req.rootUser.role === 'admin' || req.rootUser.role === 'moderator';
    
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à modifier cette news'
      });
    }
    
    // Si c'est un auteur (non-admin), on ne permet que certaines modifications
    if (isAuthor && !isAdmin) {
      // Les auteurs ne peuvent modifier que le titre, description, image, catégorie et tags
      const allowedFields = ['title', 'description', 'image', 'category', 'tags'];
      Object.keys(updateData).forEach(key => {
        if (!allowedFields.includes(key)) {
          delete updateData[key];
        }
      });
      
      // Réinitialiser le statut si l'auteur modifie
      updateData.status = 'pending';
    }
    
    // Gérer les tags
    if (updateData.tags && typeof updateData.tags === 'string') {
      updateData.tags = updateData.tags.split(',').map(tag => tag.trim().toLowerCase());
    }
    
    // Gérer l'image : supprimer l'ancienne si une nouvelle est fournie
    if (req.body.image && news.image && req.body.image !== news.image) {
      await deleteOldImage(news.image);
    }
    
    const updatedNews = await News.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'username avatar');
    
    res.json({
      success: true,
      data: updatedNews,
      message: 'News mise à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur mise à jour news:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour'
    });
  }
};

// @desc    Supprimer une news
// @route   DELETE /api/news/:id
// @access  Privé (Auteur ou Admin)
export const deleteNews = async (req, res) => {
  try {
    const { id } = req.params;
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    // Vérifier les permissions
    const isAuthor = news.author.toString() === req.rootUserId.toString();
    const isAdmin = req.rootUser.role === 'admin' || req.rootUser.role === 'moderator';
    
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à supprimer cette news'
      });
    }
    
    // Supprimer l'image de Cloudinary si elle existe
    if (news.image) {
      await deleteOldImage(news.image);
    }
    
    await News.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'News supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur suppression news:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
};

// @desc    Ajouter un commentaire à une news
// @route   POST /api/news/:id/comments
// @access  Privé
export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, parentCommentId } = req.body;
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    await news.addComment(content, req.rootUserId, parentCommentId);
    
    // Récupérer la news mise à jour avec les commentaires
    const updatedNews = await News.findById(id)
      .populate({
        path: 'comments',
        match: { status: 'active' },
        options: { sort: { createdAt: -1 }, limit: 5 },
        populate: { path: 'author', select: 'username avatar' }
      });
    
    res.status(201).json({
      success: true,
      data: updatedNews.comments[0], // Retourner le nouveau commentaire
      message: 'Commentaire ajouté avec succès'
    });
  } catch (error) {
    console.error('Erreur ajout commentaire:', error);
    
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Modérer un commentaire
// @route   PUT /api/news/:id/comments/:commentId/moderate
// @access  Privé (Admin/Moderator)
export const moderateComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { action, note } = req.body;
    
    // Vérifier si l'utilisateur est admin ou modérateur
    if (!['admin', 'moderator'].includes(req.rootUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Action non autorisée'
      });
    }
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    await news.moderateComment(commentId, action, req.rootUserId, note);
    
    res.json({
      success: true,
      message: `Commentaire ${action === 'approve' ? 'approuvé' : action === 'hide' ? 'masqué' : 'rejeté'}`
    });
  } catch (error) {
    console.error('Erreur modération commentaire:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Signaler une news
// @route   POST /api/news/:id/report
// @access  Privé
export const reportNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    await news.addReport(req.rootUserId, reason, description);
    
    res.json({
      success: true,
      message: 'News signalée avec succès'
    });
  } catch (error) {
    console.error('Erreur signalement news:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Signaler un commentaire
// @route   POST /api/news/:id/comments/:commentId/report
// @access  Privé
export const reportComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { reason, description } = req.body;
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    await news.reportComment(commentId, req.rootUserId, reason, description);
    
    res.json({
      success: true,
      message: 'Commentaire signalé avec succès'
    });
  } catch (error) {
    console.error('Erreur signalement commentaire:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Gérer un like/dislike sur une news
// @route   POST /api/news/:id/like
// @access  Privé
export const handleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'like' ou 'dislike'
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    // Utilisez la méthode unique si vous l'avez créée
    // await news.handleReaction(req.rootUserId, action);
    
    // OU utilisez les méthodes séparées
    if (action === 'like') {
      await news.addLike(req.rootUserId);
    } else if (action === 'dislike') {
      await news.addDislike(req.rootUserId);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Action invalide. Utilisez "like" ou "dislike"'
      });
    }
    
    // Récupérer la news mise à jour
    const updatedNews = await News.findById(id);
    
    // Vérifier si l'utilisateur a liké ou disliké
    const hasLiked = updatedNews.likedBy.includes(req.rootUserId);
    const hasDisliked = updatedNews.dislikedBy.includes(req.rootUserId);
    
    res.json({
      success: true,
      data: {
        likes: updatedNews.likes,
        dislikes: updatedNews.dislikes,
        hasLiked,
        hasDisliked
      },
      message: action === 'like' 
        ? (hasLiked ? 'News likée !' : 'Like retiré !')
        : (hasDisliked ? 'News dislikée !' : 'Dislike retiré !')
    });
  } catch (error) {
    console.error('Erreur like/dislike:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Ajouter une note interne (Admin/Staff)
// @route   POST /api/news/:id/internal-notes
// @access  Privé (Admin/Moderator)
export const addInternalNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, visibility, category } = req.body;
    
    // Vérifier si l'utilisateur est admin, modérateur ou staff
    if (!['admin', 'moderator', 'staff'].includes(req.rootUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Action non autorisée'
      });
    }
    
    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    await news.addInternalNote(note, req.rootUserId, visibility, category);
    
    res.status(201).json({
      success: true,
      message: 'Note interne ajoutée avec succès'
    });
  } catch (error) {
    console.error('Erreur ajout note interne:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Modérer une news (Admin)
// @route   PUT /api/news/:id/moderate
// @access  Privé (Admin/Moderator)
export const moderateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;
    
    // Vérifier si l'utilisateur est admin ou modérateur
    if (!['admin', 'moderator'].includes(req.rootUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Action non autorisée'
      });
    }
    
    const updateData = { status };
    
    // Ajouter un commentaire admin si fourni
    if (adminComment) {
      updateData.$push = {
        internalNotes: {
          note: adminComment,
          createdBy: req.rootUserId,
          visibility: 'all_staff',
          category: 'moderation'
        }
      };
    }
    
    const updatedNews = await News.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('author', 'username avatar email');
    
    if (!updatedNews) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }
    
    res.json({
      success: true,
      data: updatedNews,
      message: `News ${status === 'accepted' ? 'acceptée' : status === 'declined' ? 'refusée' : 'modérée'}`
    });
  } catch (error) {
    console.error('Erreur modération news:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Récupérer les news d'un utilisateur
// @route   GET /api/news/user/:userId
// @access  Public
export const getUserNews = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = { author: userId, isBlocked: false };
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [news, total] = await Promise.all([
      News.find(filter)
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-internalNotes -reports'),
      News.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      data: news,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erreur récupération news utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// Dans votre contrôleur newsController.js
export const getUserNewsStats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const stats = await News.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalNews: { $sum: 1 },
          acceptedNews: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
          pendingNews: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          declinedNews: { $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] } },
          blockedNews: { $sum: { $cond: [{ $eq: ['$isBlocked', true] }, 1, 0] } },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likes' },
          totalComments: { $sum: { $size: '$comments' } }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalNews: 0,
        acceptedNews: 0,
        pendingNews: 0,
        declinedNews: 0,
        blockedNews: 0,
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// Dans vos routes newsRoutes.js