// controllers/notificationController.js
import Notification from '../models/notificationModel.js';

export const notificationController = {
  getNotifications: async (req, res) => {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 20, unreadOnly = false } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = { recipient: userId };
      if (unreadOnly === 'true') filter.isRead = false;

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Notification.countDocuments(filter),
        Notification.countDocuments({ recipient: userId, isRead: false })
      ]);

      res.status(200).json({
        success: true,
        notifications,
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Erreur récupération notifications:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la récupération des notifications' });
    }
  },

  markAsRead: async (req, res) => {
    try {
      const userId = req.user._id;
      const { notificationIds } = req.body;

      const filter = { recipient: userId };
      if (notificationIds?.length) {
        filter._id = { $in: notificationIds };
      }

      const result = await Notification.updateMany(filter, {
        isRead: true,
        readAt: new Date()
      });

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} notification(s) marquée(s) comme lue(s)`
      });
    } catch (error) {
      console.error('Erreur marquage notifications:', error);
      res.status(500).json({ success: false, error: 'Erreur lors du marquage' });
    }
  },

  deleteNotification: async (req, res) => {
    try {
      const userId = req.user._id;
      const { notificationId } = req.params;

      await Notification.findOneAndDelete({ _id: notificationId, recipient: userId });

      res.status(200).json({ success: true, message: 'Notification supprimée' });
    } catch (error) {
      console.error('Erreur suppression notification:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la suppression' });
    }
  }
};

// Utilitaire appelé depuis d'autres contrôleurs pour créer et émettre une notification
export const createAndEmitNotification = async (io, { recipient, type, refModel, refId, data }) => {
  try {
    const notification = await Notification.create({ recipient, type, refModel, refId, data });

    if (io) {
      io.to(`user:${recipient.toString()}`).emit('notification', {
        _id: notification._id,
        type: notification.type,
        data: notification.data,
        isRead: false,
        createdAt: notification.createdAt
      });
    }

    return notification;
  } catch (error) {
    console.error('Erreur création notification:', error);
  }
};
