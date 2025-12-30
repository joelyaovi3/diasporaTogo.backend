import Comments from '../models/comment.js';

export const createComment = async (req, res) => {
    const { messag, Chat } = req.body;

    if (!req.rootUserId) {  // Changez req.userId en req.user._id
      return res.status(401).json({
        success: false,
        message: "Non autorisé - Utilisateur non connecté",
      });
    }
    
    try {
      const newData = await Comments.create({
          messag, 
          Chat,
          commentAuth: req.rootUserId,
        });
      return res.status(201).json({ message: 'Commentaire ajouter avec success', data: newData });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create data' });
    }
  };

export const getComment = async (req, res) => {
    try {
      const data = await Comments.find()
      .populate('commentAuth', 'username')
      .sort({ createdAt: -1 }); // Tri par date décroissante;
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
}

export const getCommentBy = async (req, res) => {
  try {
    const { newsId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(newsId)) {
      return res.status(400).json({ message: "Invalid news ID" });
    }

    const comt = await Comments.find({ Chat: newsId })
      .populate('commentAuth', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json(comt);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};