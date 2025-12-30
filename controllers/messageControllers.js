import Message from '../models/messageModel.js';
import user from '../models/userModel.js';
import Chat from '../models/chatModel.js';
import { cloudinary } from '../utils/cloudinary.js';
import fs from 'fs';
import path from 'path';


// export const sendMessage = async (req, res) => {
//   const { chatId, message } = req.body;
//   let attachmentUrl = '';

//   console.log('req.body:', req.body); // Affichez req.body pour vérification
//   console.log('req.file:', req.file); // Affichez req.file pour vérification

//   if (req.file) {
//     try {
//       // Créez un dossier "uploads" s'il n'existe pas
//       const uploadDir = path.join(process.cwd(), 'uploads');
//       if (!fs.existsSync(uploadDir)) {
//         fs.mkdirSync(uploadDir, { recursive: true });
//       }

//       // Générez un nom de fichier unique pour éviter les conflits
//       const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//       const fileName = uniqueSuffix + '-' + req.file.originalname;
//       const filePath = path.join(uploadDir, fileName);

//       // Déplacez le fichier temporaire vers le dossier "uploads"
//       fs.renameSync(req.file.path, filePath);

//       // Générez l'URL du fichier (relative au serveur)
//       attachmentUrl = `/uploads/${fileName}`; // Utilisez cette URL pour accéder au fichier
//       console.log('Fichier enregistré localement:', attachmentUrl); // Affichez l'URL
//     } catch (error) {
//       console.error('Erreur lors de l\'enregistrement du fichier :', error);
//       return res.status(500).json({ error: 'Erreur lors de l\'enregistrement du fichier' });
//     }
//   }

//   try {
//     let msg = await Message.create({
//       sender: req.rootUserId,
//       message,
//       chatId,
//       attachment: attachmentUrl, // URL du fichier local
//     });

//     console.log('Message créé:', msg); // Affichez le message créé

//     // Populez les informations de l'expéditeur et du chat
//     msg = await (
//       await msg.populate('sender', 'name avatar email')
//     ).populate({
//       path: 'chatId',
//       select: 'chatName isGroup users',
//       model: 'Chat',
//       populate: {
//         path: 'users',
//         select: 'name email avatar',
//         model: 'User',
//       },
//     });

//     // Mettez à jour le dernier message du chat
//     await Chat.findByIdAndUpdate(chatId, {
//       latestMessage: msg,
//     });

//     console.log('Message envoyé avec succès:', msg); // Affichez le message final
//     res.status(200).send(msg);
//   } catch (error) {
//     console.error('Erreur lors de la création du message :', error);
//     res.status(500).json({ error: 'Erreur lors de la création du message' });
//   }
// };

export const sendMessage = async (req, res) => {
   const { chatId, message } = req.body;
  let attachmentUrl = '';

  // Vérification du type de fichier
  if (req.file) {
    try {
      const uploadOptions = {
        folder: 'chat_documents',
        resource_type: 'auto', // Détection automatique du type
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'pdf', 'doc', 'docx'], // Formats autorisés
        transformation: [{ width: 800, height: 600, crop: 'limit' }] // Optimisation des images
      };

      const result = await cloudinary.uploader.upload(req.file.path, uploadOptions);
      attachmentUrl = result.secure_url;

    } catch (error) {
      console.error('Erreur Cloudinary:', error);
      return res.status(500).json({ 
        error: 'Erreur lors du téléversement',
        details: error.message 
      });
    } finally {
      // Nettoyage du fichier temporaire
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Erreur suppression fichier temporaire:', err);
      });
    }
  }

  try {
    let msg = await Message.create({
      sender: req.rootUserId,
      message,
      chatId,
      attachment: attachmentUrl,
    });

    console.log('Message créé:', msg); // Affichez le message créé

    msg = await (
      await msg.populate('sender', 'name avatar email')
    ).populate({
      path: 'chatId',
      select: 'chatName isGroup users',
      model: 'Chat',
      populate: {
        path: 'users',
        select: 'name email avatar',
        model: 'User',
      },
    });

    await Chat.findByIdAndUpdate(chatId, {
      latestMessage: msg,
    });

    console.log('Message envoyé avec succès:', msg); // Affichez le message final
    res.status(200).send(msg);
  } catch (error) {
    console.error('Erreur lors de la création du message :', error);
    res.status(500).json({ error: 'Erreur lors de la création du message' });
  }
};

export const getMessages = async (req, res) => {
  const { chatId } = req.params;
  try {
    let messages = await Message.find({ chatId })
      .populate({
        path: 'sender',
        model: 'User',
        select: 'name avatar email',
      })
      .populate({
        path: 'chatId',
        model: 'Chat',
      });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
  }
};