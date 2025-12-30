import Chat from '../models/chatModel.js';
import user from '../models/userModel.js';
import mongoose from 'mongoose';

export const accessChats = async (req, res) => {
  const { userId } = req.body;

  if (!userId) res.send({ message: "Provide User's Id" });

  let chatExists = await Chat.find({
    isGroup: false,
    $and: [
      { users: { $elemMatch: { $eq: userId } } },
      { users: { $elemMatch: { $eq: req.rootUserId } } },
    ],
  })
    .populate('users', '-password')
    .populate('latestMessage');
  chatExists = await user.populate(chatExists, {
    path: 'latestMessage.sender',
    select: 'name email avatar',
  });
  if (chatExists.length > 0) {
    const chat = chatExists[0];
    // Réinitialiser les messages non lus pour cet utilisateur
    chat.unreadMessages.set(req.rootUserId.toString(), 0);
    await chat.save();
    res.status(200).send(chat);
  } else {
    let data = {
      chatName: 'sender',
      users: [userId, req.rootUserId],
      isGroup: false,
    };
    data.unreadMessages = {
      [userId]: 0,
      [req.rootUserId]: 0
    };
    try {
      const newChat = await Chat.create(data);
      const chat = await Chat.find({ _id: newChat._id }).populate(
        'users',
        '-password'
      );
      res.status(200).json(chat);
    } catch (error) {
      res.status(500).send(error);
    }
  }
};

export const fetchAllChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      users: { $elemMatch: { $eq: req.rootUserId } },
    })
      .populate('users')
      .populate('latestMessage')
      .populate('groupAdmin')
      .sort({ updatedAt: -1 });
      
    const finalChats = await user.populate(chats, {
      path: 'latestMessage.sender',
      select: 'name email avatar',
    });
    
    res.status(200).json(finalChats);
  } catch (error) {
    res.status(500).send(error);
  }
};

// unreadMessagesController.js
export const updateUnreadCount = async (req, res) => {
  const { chatId, userId } = req.body;
  
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).send("Chat not found");
    
    // Incrémenter le compteur de messages non lus
    const currentCount = chat.unreadMessages.get(userId) || 0;
    chat.unreadMessages.set(userId, currentCount + 1);
    await chat.save();
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).send(error);
  }
};

export const resetUnreadCount = async (req, res) => {
  const { chatId, userId } = req.body;
  
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).send("Chat not found");
    
    // Réinitialiser le compteur
    chat.unreadMessages.set(userId, 0);
    await chat.save();
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).send(error);
  }
};

// Dans votre contrôleur backend
export const getAllNews = async (req, res) => {
  try {
    const news = await Chat.find({ isNews: true })
      .populate('newsAuth', 'username name email') // Peuplez les données utilisateur
      .exec();
    res.json(news);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getNewsById = async(req, res) =>{
  const {id} = req.params
  try {
    const chat = await Chat.findOne({_id: id, isNews: true})
    res.status(200).send(chat)
  } catch (error) {
    res.status(500).send(error);
  }
}

export const getGrpList = async(req, res) =>{
  try {
    const chat = await Chat.find({isGroup: true})
    res.status(200).send(chat);
  } catch (error) {
    res.status(500).send(error);
  }
}


export const createNews = async (req, res) => {
  const { chatName, description, image } = req.body;

  // Vérification que l'utilisateur est authentifié
  if (!req.rootUserId) {  // Changez req.userId en req.user._id
    return res.status(401).json({
      success: false,
      message: "Non autorisé - Utilisateur non connecté",
    });
  }

  try {
    const chat = await Chat.create({
      chatName,
      description,
      image,
      isNews: true,
      status: "pending",
      groupAdmin: req.rootUserId,  // Utilisez req.user._id partout
      newsAuth: req.rootUserId,
    });

    return res.status(201).json({
      success: true,
      message: "News créée avec succès",
      data: chat,
    });
  } catch (error) {
    console.error("Erreur:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
};










export const getUserNews = async (req, res) => {
  try {
    const userId = req.rootUserId;
    
    // Add validation for userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const userNews = await Chat.find({
      isNews: true,
      newsAuth: userId
    }).populate('newsAuth', 'username');
    
    res.status(200).json(userNews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getNewsByUserConnected = async (req, res) => {
  try {
    const userId = req.rootUserId;

    // Validation renforcée
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ 
        message: 'ID utilisateur invalide ou manquant',
        receivedId: userId
      });
    }

    // console.log('userId:', userId, 'type:', typeof userId);

    // No need to explicitly convert to ObjectId - Mongoose will handle it
    const userNews = await Chat.find({
      isNews: true,
      isBlocked: false,
      users: userId,
      newsAuth: userId
      // $or: [
      //   { users: userId },  // Mongoose will cast string to ObjectId
      //   { newsAuth: userId }
      // ]
    })
    .populate('users', '-password')
    .populate('newsAuth', '-password')
    .populate('latestMessage')
    .sort({ updatedAt: -1 });

    res.status(200).json(userNews);
  } catch (error) {
    console.error('Error fetching news:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Format de données invalide',
        details: error.message
      });
    }
    
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des news',
      error: error.message 
    });
  }
};

export const updateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.rootUserId;
    const updates = req.body;

    const news = await Chat.findOne({
      _id: id,
      isNews: true,
      newsAuthor: userId
    });

    if (!news) {
      return res.status(404).json({ message: 'News not found or unauthorized' });
    }

    console.log('up',updates)
    console.log('news', news)

    Object.assign(news, updates);
    await news.save();
    
    res.status(200).json(news);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// export const deleteNews = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const userId = req.user._id;

//     const result = await Chat.deleteOne({
//       _id: id,
//       isNews: true,
//       newsAuthor: userId
//     });

//     if (result.deletedCount === 0) {
//       return res.status(404).json({ message: 'News not found or unauthorized' });
//     }
    
//     res.status(200).json({ message: 'News deleted successfully' });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };


export const updateNewsV2 = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.rootUserId;
    const updates = req.body;

    // 1. Validation de l'ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de news invalide' });
    }

    // 2. Trouver la news avec vérification de l'auteur
    const news = await Chat.findOne({
      _id: id,
      isNews: true,
      newsAuth: userId // Correction: utiliser newsAuth au lieu de newsAuthor
    });

    if (!news) {
      return res.status(404).json({ 
        message: 'News non trouvée ou non autorisée',
        details: `L'utilisateur ${userId} n'est pas l'auteur de cette news`
      });
    }

    // 3. Liste des champs modifiables
    const allowedUpdates = ['chatName', 'description', 'photo', 'status'];
    const isValidUpdate = Object.keys(updates).every(update => 
      allowedUpdates.includes(update)
    );

    if (!isValidUpdate) {
      return res.status(400).json({ 
        message: 'Champs de mise à jour non autorisés',
        allowedFields: allowedUpdates,
        invalidFields: invalidFields 
      });
    }

    // 4. Application des modifications
    Object.keys(updates).forEach(update => {
      news[update] = updates[update];
    });

    const updatedNews = await news.save();

    // 5. Réponse avec la news mise à jour
    res.status(200).json({
      success: true,
      message: 'News mise à jour avec succès',
      news: updatedNews
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur serveur lors de la mise à jour',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const acceptNews = async(req, res) =>{
  try {
        const form = await Chat.findByIdAndUpdate(
          req.params.id,
          { status: 'accepted' },
          { new: true }
        );
        
        if (!form) {
          return res.status(404).json({
            success: false,
            message: 'News non trouvé'
          });
        }
  
        return res.json({
          success: true,
          message: 'News accepté',
        });
  
      } catch (err) {
        console.error('Erreur accept News:', err);
        return res.status(500).json({
          success: false,
          message: 'Erreur lors de l\'acceptation du news'
        });
      }
}

export const declinedNews = async(req, res) =>{
  try {
        const form = await Chat.findByIdAndUpdate(
          req.params.id,
          { status: 'declined' },
          { new: true }
        );
    
        if (!form) return res.status(404).json({ error: 'News non trouvé' });
        
        return res.json({ message: 'News refusé', form });
    
      } catch (err) {
        console.error('Erreur:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }
}

export const pendingNews = async(req, res) =>{
  try {
        const form = await Chat.findByIdAndUpdate(
          req.params.id,
          { status: 'pending' },
          { new: true }
        );
    
        if (!form) return res.status(404).json({ error: 'News non trouvé' });
    
        
        return res.json({ message: 'News en attente de validation', form });
    
      } catch (err) {
        console.error('Erreur:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }
}

export const creatGroup = async (req, res) => {
  const { chatName, users } = req.body;
  if (!chatName || !users) {
    res.status(400).json({ message: 'Please fill the fields' });
  }
  const parsedUsers = JSON.parse(users);
  if (parsedUsers.length < 2)
    res.send(400).send('Group should contain more than 2 users');
  parsedUsers.push(req.rootUser);
  try {
    const chat = await Chat.create({
      chatName: chatName,
      users: parsedUsers,
      isGroup: true,
      groupAdmin: req.rootUserId,
    });
    const createdChat = await Chat.findOne({ _id: chat._id })
      .populate('users', '-password')
      .populate('groupAdmin', '-password');
    // res.status(200).json(createdChat);
    res.send(createdChat);
  } catch (error) {
    res.sendStatus(500);
  }
};

export const renameGroup = async (req, res) => {
  const { chatId, chatName } = req.body;
  if (!chatId || !chatName)
    res.status(400).send('Provide Chat id and Chat name');
  try {
    const chat = await Chat.findByIdAndUpdate(chatId, {
      $set: { chatName },
    })
      .populate('users', '-password')
      .populate('groupAdmin', '-password');
    if (!chat) res.status(404);
    res.status(200).send(chat);
  } catch (error) {
    res.status(500).send(error);
    console.log(error);
  }
};
export const addToGroup = async (req, res) => {
  const { userId, chatId } = req.body;
  const existing = await Chat.findOne({ _id: chatId });
  if (!existing.users.includes(userId)) {
    const chat = await Chat.findByIdAndUpdate(chatId, {
      $push: { users: userId },
    })
      .populate('groupAdmin', '-password')
      .populate('users', '-password');
    if (!chat) res.status(404);
    res.status(200).send(chat);
  } else {
    res.status(409).send('user already exists');
  }
};
export const removeFromGroup = async (req, res) => {
  const { userId, chatId } = req.body;
  const existing = await Chat.findOne({ _id: chatId });
  if (existing.users.includes(userId)) {
    Chat.findByIdAndUpdate(chatId, {
      $pull: { users: userId },
    })
      .populate('groupAdmin', '-password')
      .populate('users', '-password')
      .then((e) => res.status(200).send(e))
      .catch((e) => res.status(404));
  } else {
    res.status(409).send('user doesnt exists');
  }
};

export const addComment = async (req, res) =>{
    const { id } = req.params;
    const { comment } = req.body;
    const cmt = await Chat.findByIdAndUpdate(id, { comment });
    res.json(cmt);
}

export const getComment = async (req, res) => {
  try {
      const data = await Chat.find(); // Fetch all data
      const totalLength = await Chat.countDocuments(); // Get total count

      res.json({ totalLength, data });
  } catch (error) {
      res.status(500).json({ message: "Server Error", error });
  }
}


export const disLikesComment = async (req, res) => {
  const { postId, userId } = req.body;

  try {
    const post = await Chat.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if the user has already disliked the post
    if (post.dislikedBy.includes(userId)) {
      return res.status(400).json({ message: 'You have already disliked this post' });
    }

    // Check if the user has liked the post, and remove the like if so
    if (post.likedBy.includes(userId)) {
      post.likedBy.pull(userId);
      post.likes -= 1;
    }
    // Add the user to the dislikedBy array and increment the dislikes count
    post.dislikedBy.push(userId);
    post.dislikes += 1;

    await post.save();

    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ message: 'Something went wrong' });
  }
};

export const removeContact = async (req, res) => {};



export const likeCt = async (req, res) => {
  const { postId, userId } = req.body;

  // Check if postId and userId are provided
  if (!postId || !userId) {
    return res.status(400).json({ message: 'postId and userId are required' });
  }

  try {
    const post = await Chat.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if the user has already liked the post
    if (post.likedBy.includes(userId)) {
      return res.status(400).send({ message: 'You have already liked this post' });
    }

    // Check if the user has disliked the post, and remove the dislike if so
    if (post.dislikedBy.includes(userId)) {
      post.dislikedBy.pull(userId);
      post.dislikes -= 1;
    }

    // Add the user to the likedBy array and increment the likes count
    post.likedBy.push(userId);
    post.likes += 1;

    await post.save();

    res.status(200).send({ message: 'You have liked this post',post});
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(500).json({ message: 'Something went wrong' });
  }
};

export const deleteNews = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.rootUserId;

    const result = await Chat.deleteOne({
      _id: id,
      isNews: true,
      newsAuthor: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'News not found or unauthorized' });
    }
    
    res.status(200).json({ message: 'News deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// export const deleteNews =  async (req, res) => {
//   const { id } = req.params;

//   try {
//     // Find the post by ID and delete it
//     const deletedPost = await Chat.findByIdAndDelete(id);

//     if (!deletedPost) {
//       return res.status(404).json({ message: 'News not found' });
//     }

//     res.status(200).json({ message: 'News supprimer avec succès', deletedPost });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Something went wrong' });
//   }
// }

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Controller for liking a news
export const likeNews = async (req, res) => {
    try {
        const { newsId } = req.params;
        const userId = req.rootUserId; // Assuming user is authenticated and ID is available

        // Validate IDs
        if (!isValidObjectId(newsId) || !isValidObjectId(userId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        // Find the news
        const news = await Chat.findOne({ 
            _id: newsId, 
            isNews: true 
        });

        if (!news) {
            return res.status(404).json({ message: 'News not found' });
        }

        // Check if user already liked
        const alreadyLiked = news.likedBy.includes(userId);
        const alreadyDisliked = news.dislikedBy.includes(userId);

        let updatedNews;

        if (alreadyLiked) {
            // Remove like if already liked
            updatedNews = await Chat.findByIdAndUpdate(
                newsId,
                { 
                    $inc: { likes: -1 },
                    $pull: { likedBy: userId } 
                },
                { new: true }
            );
        } else {
            // Add like
            updatedNews = await Chat.findByIdAndUpdate(
                newsId,
                { 
                    $inc: { likes: 1 },
                    $addToSet: { likedBy: userId },
                    // Remove from dislikes if previously disliked
                    ...(alreadyDisliked && { 
                        $inc: { dislikes: -1 },
                        $pull: { dislikedBy: userId } 
                    })
                },
                { new: true }
            );
        }

        res.status(200).json({
            message: alreadyLiked ? 'Like removed' : 'News liked',
            news: updatedNews
        });

    } catch (error) {
        console.error('Error liking news:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};

// Controller for disliking a news
export const dislikeNews = async (req, res) => {
    try {
        const { newsId } = req.params;
        const userId = req.rootUserId;

        // Validate IDs
        if (!isValidObjectId(newsId) || !isValidObjectId(userId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        // Find the news
        const news = await Chat.findOne({ 
            _id: newsId, 
            isNews: true 
        });

        if (!news) {
            return res.status(404).json({ message: 'News not found' });
        }

        // Check if user already disliked
        const alreadyDisliked = news.dislikedBy.includes(userId);
        const alreadyLiked = news.likedBy.includes(userId);

        let updatedNews;

        if (alreadyDisliked) {
            // Remove dislike if already disliked
            updatedNews = await Chat.findByIdAndUpdate(
                newsId,
                { 
                    $inc: { dislikes: -1 },
                    $pull: { dislikedBy: userId } 
                },
                { new: true }
            );
        } else {
            // Add dislike
            updatedNews = await Chat.findByIdAndUpdate(
                newsId,
                { 
                    $inc: { dislikes: 1 },
                    $addToSet: { dislikedBy: userId },
                    // Remove from likes if previously liked
                    ...(alreadyLiked && { 
                        $inc: { likes: -1 },
                        $pull: { likedBy: userId } 
                    })
                },
                { new: true }
            );
        }

        res.status(200).json({
            message: alreadyDisliked ? 'Dislike removed' : 'News disliked',
            news: updatedNews
        });

    } catch (error) {
        console.error('Error disliking news:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};

// Controller to get like/dislike status for current user
export const getNewsReactionStatus = async (req, res) => {
    try {
        const { newsId } = req.params;
        const userId = req.rootUserId;

        if (!isValidObjectId(newsId) || !isValidObjectId(userId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        const news = await Chat.findOne(
            { _id: newsId, isNews: true },
            { likedBy: 1, dislikedBy: 1 }
        );

        if (!news) {
            return res.status(404).json({ message: 'News not found' });
        }

        res.status(200).json({
            hasLiked: news.likedBy.includes(userId),
            hasDisliked: news.dislikedBy.includes(userId),
            likeCount: news.likedBy.length,
            dislikeCount: news.dislikedBy.length
        });

    } catch (error) {
        console.error('Error getting reaction status:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};

// Signalement d'une news
export const reportNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    const userId = req.rootUserId;

    const chat = await Chat.findById(id);
    if (!chat) return res.status(404).json({ message: 'News not found' });

    // Vérifier si l'utilisateur a déjà signalé cette news
    const alreadyReported = chat.reports.some(report => 
      report.reportedBy.equals(userId) && report.status === 'pending'
    );

    if (alreadyReported) {
      return res.status(400).json({ message: 'Vous avez déjà signalé cette news' });
    }

    chat.reports.push({
      reportedBy: userId,
      reason,
      description,
      status: 'pending'
    });

    chat.reportCount = chat.reports.length;

    // Bloquer automatiquement si trop de signalements
    if (chat.reportCount >= 5) {
      chat.isBlocked = true;
    }

    await chat.save();

    res.json({
      ...chat.toObject(),
      hasReported: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Traitement d'un signalement (admin)
export const handleReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(id);
    if (!chat) return res.status(404).json({ message: 'News not found' });

    const hasReported = chat.reports.some(report => 
      report.reportedBy.equals(userId) && report.status === 'pending'
    );

    res.json({
      hasReported,
      reports: chat.reports,
      reportCount: chat.reportCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};