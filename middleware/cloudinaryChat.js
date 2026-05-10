import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// params est une fonction pour adapter resource_type et transformation selon le fichier
const chatStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith('image/');
    const timestamp = Date.now();
    const userId = req.user?._id || 'anonymous';
    const parsed = path.parse(file.originalname);
    // Nettoyer le nom pour éviter les caractères spéciaux dans l'URL
    const safeName = parsed.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const ext = parsed.ext.replace('.', '').toLowerCase();

    if (isImage) {
      // Images : optimisation qualité, resource_type image
      return {
        folder: 'chat-attachments',
        resource_type: 'image',
        transformation: [{ quality: 'auto:good' }],
        public_id: `chat_${userId}_${timestamp}_${safeName}`,
      };
    }

    // PDF, Word, Excel, PowerPoint → resource_type raw
    // L'extension dans le public_id est indispensable pour que Cloudinary
    // serve le bon Content-Type et que le navigateur ouvre/télécharge le bon fichier
    return {
      folder: 'chat-attachments',
      resource_type: 'raw',
      public_id: `chat_${userId}_${timestamp}_${safeName}.${ext}`,
    };
  },
});

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
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'video/mp4',
    'video/quicktime'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté: ${file.mimetype}`), false);
  }
};

export const uploadChatFiles = multer({
  storage: chatStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Mo max par fichier
    files: 5
  },
  fileFilter,
});

export const deleteCloudinaryFile = async (publicId, resourceType = 'image') => {
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error) {
    console.error('Erreur suppression Cloudinary:', error);
    throw error;
  }
};

export const getFileInfo = (file) => ({
  url: file.path,
  filename: file.originalname,
  mimetype: file.mimetype,
  size: file.size,
  cloudinaryPublicId: file.filename,
  // resource_type stocké pour pouvoir supprimer correctement plus tard
  resourceType: file.mimetype.startsWith('image/') ? 'image' : 'raw',
});

export default cloudinary;
