import News from '../models/NewsModel.js';
import User from '../models/userModel.js';
import mongoose from 'mongoose';

// @desc    Récupérer toutes les news en attente de modération
// @route   GET /api/admin/news/pending
// @access  Privé (Admin/Moderator)
export const getPendingNews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = ''
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Filtres pour les news en attente
    const filter = {
      status: 'pending',
      isBlocked: false
    };

    // Recherche par titre ou auteur
    if (search) {
      const users = await User.find({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const userIds = users.map(user => user._id);

      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'author.name': { $regex: search, $options: 'i' } },
        { author: { $in: userIds } }
      ];
    }

    const [news, total, stats] = await Promise.all([
      News.find(filter)
        .populate('author', 'username email avatar')
        .populate('reports.reportedBy', 'username')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      News.countDocuments(filter),
      News.aggregate([
        { $match: { status: 'pending' } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            withReports: { $sum: { $cond: [{ $gt: ['$reportCount', 0] }, 1, 0] } },
            avgReports: { $avg: '$reportCount' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: news,
      stats: stats[0] || { total: 0, withReports: 0, avgReports: 0 },
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erreur récupération news en attente:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Récupérer les statistiques de modération
// @route   GET /api/admin/news/stats
// @access  Privé (Admin/Moderator)
export const getModerationStats = async (req, res) => {
  try {
    const [today, lastWeek, categories, reporters] = await Promise.all([
      // News soumises aujourd'hui
      News.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        status: 'pending'
      }),
      
      // Stats de la semaine
      News.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
            declined: { $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Distribution par catégorie
      News.aggregate([
        { $match: { status: 'pending' } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      
      // Top reporters
      News.aggregate([
        { $match: { 'reports.status': 'pending' } },
        { $unwind: '$reports' },
        { $match: { 'reports.status': 'pending' } },
        {
          $group: {
            _id: '$reports.reportedBy',
            reportCount: { $sum: 1 }
          }
        },
        { $sort: { reportCount: -1 } },
        { $limit: 10 }
      ])
    ]);

    // Compter les news signalées
    const reportedNews = await News.countDocuments({
      status: 'pending',
      reportCount: { $gt: 0 }
    });

    // Top modérateurs
    const moderators = await News.aggregate([
      { $unwind: '$internalNotes' },
      {
        $group: {
          _id: '$internalNotes.createdBy',
          moderationCount: { $sum: 1 },
          lastActivity: { $max: '$internalNotes.createdAt' }
        }
      },
      { $sort: { moderationCount: -1 } },
      { $limit: 5 }
    ]);

    // Populer les informations des modérateurs
    const populatedModerators = await Promise.all(
      moderators.map(async (mod) => {
        const user = await User.findById(mod._id).select('username avatar');
        return {
          ...mod,
          moderator: user
        };
      })
    );

    res.json({
      success: true,
      data: {
        todayPending: today,
        reportedNews,
        weeklyStats: lastWeek,
        categories,
        topReporters: reporters,
        topModerators: populatedModerators
      }
    });
  } catch (error) {
    console.error('Erreur récupération stats modération:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Valider une news
// @route   POST /api/admin/news/:id/approve
// @access  Privé (Admin/Moderator)
export const approveNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const moderatorId = req.rootUserId;

    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }

    if (news.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Cette news est déjà acceptée'
      });
    }

    // Ajouter une note de modération
    if (note) {
      news.internalNotes.push({
        note,
        createdBy: moderatorId,
        visibility: 'all_staff',
        category: 'moderation',
        action: 'approve'
      });
    }

    // Mettre à jour le statut
    news.status = 'accepted';
    news.isBlocked = false;
    news.reportCount = 0; // Réinitialiser les signalements
    
    // Mettre à jour le statut des signalements
    news.reports.forEach(report => {
      report.status = 'resolved';
    });

    await news.save();

    // Notifier l'auteur (vous pouvez implémenter un système de notification)
    // await notifyAuthor(news.author, 'Votre news a été approuvée', note);

    // Populer les données pour la réponse
    const populatedNews = await News.findById(id)
      .populate('author', 'username email')
      .populate('internalNotes.createdBy', 'username');

    res.json({
      success: true,
      data: populatedNews,
      message: 'News approuvée avec succès'
    });
  } catch (error) {
    console.error('Erreur approbation news:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'approbation'
    });
  }
};

// @desc    Rejeter une news
// @route   POST /api/admin/news/:id/reject
// @access  Privé (Admin/Moderator)
export const rejectNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body;
    const moderatorId = req.rootUserId;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'La raison du rejet est obligatoire'
      });
    }

    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }

    if (news.status === 'declined') {
      return res.status(400).json({
        success: false,
        message: 'Cette news est déjà refusée'
      });
    }

    // Ajouter une note de modération détaillée
    const moderationNote = `Raison du rejet: ${reason}${note ? `\nNote additionnelle: ${note}` : ''}`;
    
    news.internalNotes.push({
      note: moderationNote,
      createdBy: moderatorId,
      visibility: 'all_staff',
      category: 'rejection',
      action: 'reject',
      rejectionReason: reason,
      additionalNotes: note || ''
    });

    // Mettre à jour le statut
    news.status = 'declined';
    news.reportCount = 0;
    
    // Mettre à jour le statut des signalements
    news.reports.forEach(report => {
      report.status = 'resolved';
    });

    await news.save();

    // Notifier l'auteur
    // await notifyAuthor(news.author, 'Votre news a été refusée', moderationNote);

    res.json({
      success: true,
      data: news,
      message: 'News refusée avec succès'
    });
  } catch (error) {
    console.error('Erreur rejet news:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du rejet'
    });
  }
};

// @desc    Bloquer une news
// @route   POST /api/admin/news/:id/block
// @access  Privé (Admin/Moderator)
export const blockNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, note, blockDuration, blockUser = false } = req.body;
    const moderatorId = req.rootUserId;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'La raison du blocage est obligatoire'
      });
    }

    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }

    // Calculer la date de fin de blocage si durée spécifiée
    let blockUntil = null;
    if (blockDuration) {
      blockUntil = new Date();
      const [value, unit] = blockDuration.split('_');
      
      switch(unit) {
        case 'hours':
          blockUntil.setHours(blockUntil.getHours() + parseInt(value));
          break;
        case 'days':
          blockUntil.setDate(blockUntil.getDate() + parseInt(value));
          break;
        case 'weeks':
          blockUntil.setDate(blockUntil.getDate() + (parseInt(value) * 7));
          break;
        case 'months':
          blockUntil.setMonth(blockUntil.getMonth() + parseInt(value));
          break;
      }
    }

    // Ajouter une note de modération pour le blocage
    const blockNote = `Raison du blocage: ${reason}${note ? `\nNote additionnelle: ${note}` : ''}${blockUntil ? `\nBloqué jusqu'au: ${blockUntil.toLocaleDateString('fr-FR')}` : ''}`;
    
    news.internalNotes.push({
      note: blockNote,
      createdBy: moderatorId,
      visibility: 'all_staff',
      category: 'block',
      action: 'block',
      blockReason: reason,
      blockUntil,
      additionalNotes: note || '',
      blockUser
    });

    // Mettre à jour le statut
    news.status = 'declined';
    news.isBlocked = true;
    news.blockReason = reason;
    news.blockedBy = moderatorId;
    news.blockedAt = new Date();
    news.blockUntil = blockUntil;
    
    // Si on bloque aussi l'utilisateur
    if (blockUser) {
      const user = await User.findById(news.author);
      if (user) {
        user.isSuspended = true;
        user.suspensionReason = `Publication bloquée: ${reason}`;
        user.suspendedUntil = blockUntil;
        await user.save();
      }
    }

    await news.save();

    res.json({
      success: true,
      data: news,
      message: 'News bloquée avec succès'
    });
  } catch (error) {
    console.error('Erreur blocage news:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du blocage'
    });
  }
};

// @desc    Débloquer une news
// @route   POST /api/admin/news/:id/unblock
// @access  Privé (Admin/Moderator)
export const unblockNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const moderatorId = req.rootUserId;

    const news = await News.findById(id);
    
    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }

    if (!news.isBlocked) {
      return res.status(400).json({
        success: false,
        message: 'Cette news n\'est pas bloquée'
      });
    }

    // Ajouter une note de déblocage
    if (note) {
      news.internalNotes.push({
        note: `Déblocage: ${note}`,
        createdBy: moderatorId,
        visibility: 'all_staff',
        category: 'unblock',
        action: 'unblock'
      });
    }

    // Mettre à jour le statut
    news.isBlocked = false;
    news.status = 'pending'; // Remettre en attente ou selon votre logique
    news.blockReason = undefined;
    news.blockedBy = undefined;
    news.blockedAt = undefined;
    news.blockUntil = undefined;

    await news.save();

    res.json({
      success: true,
      data: news,
      message: 'News débloquée avec succès'
    });
  } catch (error) {
    console.error('Erreur déblocage news:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du déblocage'
    });
  }
};

// @desc    Récupérer l'historique de modération
// @route   GET /api/admin/news/:id/moderation-history
// @access  Privé (Admin/Moderator)
export const getModerationHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const news = await News.findById(id)
      .populate('internalNotes.createdBy', 'username avatar')
      .populate('blockedBy', 'username')
      .select('internalNotes status isBlocked blockReason blockedAt blockUntil');

    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News non trouvée'
      });
    }

    // Filtrer les notes de modération
    const moderationHistory = news.internalNotes
      .filter(note => ['moderation', 'rejection', 'block', 'unblock'].includes(note.category))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      data: {
        history: moderationHistory,
        currentStatus: news.status,
        isBlocked: news.isBlocked,
        blockDetails: news.isBlocked ? {
          reason: news.blockReason,
          blockedBy: news.blockedBy,
          blockedAt: news.blockedAt,
          blockUntil: news.blockUntil
        } : null
      }
    });
  } catch (error) {
    console.error('Erreur récupération historique modération:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// @desc    Modérer plusieurs news en batch
// @route   POST /api/admin/news/batch-moderate
// @access  Privé (Admin/Moderator)
export const batchModerateNews = async (req, res) => {
  try {
    const { newsIds, action, reason, note } = req.body;
    
    if (!newsIds || !Array.isArray(newsIds) || newsIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste des news requise'
      });
    }

    if (!['approve', 'reject', 'block'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action de modération invalide'
      });
    }

    if ((action === 'reject' || action === 'block') && !reason) {
      return res.status(400).json({
        success: false,
        message: `La raison est obligatoire pour ${action === 'reject' ? 'le rejet' : 'le blocage'}`
      });
    }

    const results = {
      total: newsIds.length,
      success: 0,
      failed: 0,
      details: []
    };

    for (const newsId of newsIds) {
      try {
        const news = await News.findById(newsId);
        
        if (!news) {
          results.details.push({ newsId, success: false, message: 'News non trouvée' });
          results.failed++;
          continue;
        }

        // Appliquer l'action
        switch (action) {
          case 'approve':
            news.status = 'accepted';
            news.isBlocked = false;
            break;
          case 'reject':
            news.status = 'declined';
            news.internalNotes.push({
              note: `Rejet batch: ${reason}${note ? `\n${note}` : ''}`,
              createdBy: req.rootUserId,
              visibility: 'all_staff',
              category: 'rejection',
              rejectionReason: reason
            });
            break;
          case 'block':
            news.status = 'declined';
            news.isBlocked = true;
            news.blockReason = reason;
            news.blockedBy = req.rootUserId;
            news.blockedAt = new Date();
            news.internalNotes.push({
              note: `Blocage batch: ${reason}${note ? `\n${note}` : ''}`,
              createdBy: req.rootUserId,
              visibility: 'all_staff',
              category: 'block',
              blockReason: reason
            });
            break;
        }

        await news.save();
        results.details.push({ newsId, success: true, message: `${action} réussi` });
        results.success++;
      } catch (error) {
        console.error(`Erreur modération news ${newsId}:`, error);
        results.details.push({ newsId, success: false, message: error.message });
        results.failed++;
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Modération batch terminée: ${results.success} succès, ${results.failed} échecs`
    });
  } catch (error) {
    console.error('Erreur modération batch:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la modération batch'
    });
  }
};

// @desc    Exporter les statistiques de modération
// @route   GET /api/admin/news/export-stats
// @access  Privé (Admin)
export const exportModerationStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = dateFilter;
    }

    const stats = await News.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            status: '$status',
            category: '$category',
            month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
          },
          count: { $sum: 1 },
          avgReports: { $avg: '$reportCount' },
          avgLikes: { $avg: '$likes' },
          avgViews: { $avg: '$views' }
        }
      },
      { $sort: { '_id.month': -1, '_id.status': 1 } }
    ]);

    // Format pour export CSV/Excel
    const exportData = stats.map(stat => ({
      Mois: stat._id.month,
      Statut: stat._id.status,
      Catégorie: stat._id.category,
      Nombre: stat.count,
      'Signalements Moyens': stat.avgReports.toFixed(2),
      'Likes Moyens': stat.avgLikes.toFixed(2),
      'Vues Moyennes': stat.avgViews.toFixed(2)
    }));

    res.json({
      success: true,
      data: exportData,
      message: 'Statistiques exportées'
    });
  } catch (error) {
    console.error('Erreur export stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'export'
    });
  }
};