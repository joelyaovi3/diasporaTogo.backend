// controllers/blockController.js
import Block from '../models/blockModel.js';
import Invitation from '../models/invitationModel.js';
import Conversation from '../models/conversationModel.js';

export const blockController = {
  blockUser: async (req, res) => {
    try {
      const blockerId = req.user._id;
      const { userId: blockedId } = req.params;

      if (blockerId.toString() === blockedId) {
        return res.status(400).json({ success: false, error: 'Action impossible sur soi-même' });
      }

      await Block.findOneAndUpdate(
        { blocker: blockerId, blocked: blockedId },
        { blocker: blockerId, blocked: blockedId },
        { upsert: true, new: true }
      );

      // Annuler toute invitation pending entre les deux
      await Invitation.updateMany(
        {
          $or: [
            { sender: blockerId, receiver: blockedId },
            { sender: blockedId, receiver: blockerId }
          ],
          status: 'pending'
        },
        { status: 'cancelled' }
      );

      // Archiver toute conversation active entre les deux
      const conversation = await Conversation.findOne({
        participants: { $all: [blockerId, blockedId] },
        isActive: true
      });

      if (conversation) {
        conversation.isActive = false;
        await conversation.save();

        if (req.io) {
          // Notifier les deux participants : le bloqueur ferme sa fenêtre, le bloqué aussi
          [blockerId.toString(), blockedId.toString()].forEach((uid) => {
            req.io.to(uid).emit('conversation-archived', {
              conversationId: conversation._id
            });
          });
        }
      }

      res.status(200).json({ success: true, message: 'Utilisateur bloqué' });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(200).json({ success: true, message: 'Utilisateur déjà bloqué' });
      }
      console.error('Erreur blocage:', error);
      res.status(500).json({ success: false, error: 'Erreur lors du blocage' });
    }
  },

  unblockUser: async (req, res) => {
    try {
      const blockerId = req.user._id;
      const { userId: blockedId } = req.params;

      const result = await Block.findOneAndDelete({ blocker: blockerId, blocked: blockedId });

      if (!result) {
        return res.status(404).json({ success: false, error: 'Cet utilisateur n\'est pas bloqué' });
      }

      res.status(200).json({ success: true, message: 'Utilisateur débloqué' });
    } catch (error) {
      console.error('Erreur déblocage:', error);
      res.status(500).json({ success: false, error: 'Erreur lors du déblocage' });
    }
  },

  getBlockedUsers: async (req, res) => {
    try {
      const userId = req.user._id;

      const blocks = await Block.find({ blocker: userId })
        .populate('blocked', 'firstName lastName userName email avatar userType companyName')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        blockedUsers: blocks.map(b => b.blocked),
        count: blocks.length
      });
    } catch (error) {
      console.error('Erreur liste bloqués:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la récupération' });
    }
  }
};
