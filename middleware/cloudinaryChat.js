// config/cloudinaryConfig.js
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuration spécifique pour les fichiers de chat
const chatStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat-attachments',
    allowed_formats: [
      // Images
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg',
      // Documents
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf',
      // Archives
      'zip', 'rar', '7z',
      // Audio
      'mp3', 'wav', 'ogg', 'm4a',
      // Vidéo
      'mp4', 'mov', 'avi', 'mkv', 'wmv'
    ],
    resource_type: 'auto', // Détecte automatiquement le type
    transformation: [
      { quality: 'auto:good' }
    ],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const userId = req.user?._id || 'anonymous';
      const originalName = path.parse(file.originalname).name;
      return `chat_${userId}_${timestamp}_${originalName}`;
    }
  }
});

// Filtrage des fichiers
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
    'video/quicktime'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté: ${file.mimetype}`), false);
  }
};

// Configuration Multer pour le chat
export const uploadChatFiles = multer({
  storage: chatStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max par fichier
    files: 5 // Maximum 5 fichiers par message
  },
  fileFilter: fileFilter
});

// Fonction pour supprimer les fichiers Cloudinary
export const deleteCloudinaryFile = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'auto'
    });
    return result;
  } catch (error) {
    console.error('Erreur suppression Cloudinary:', error);
    throw error;
  }
};

// Fonction pour obtenir les métadonnées d'un fichier
export const getFileInfo = (file) => {
  return {
    url: file.path,
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    cloudinaryPublicId: file.filename
  };
};

export default cloudinary;