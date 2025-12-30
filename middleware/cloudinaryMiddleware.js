import cloudinary from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configuration Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuration du stockage Cloudinary pour Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'news-images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1200, height: 630, crop: 'limit' }],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const originalName = file.originalname.split('.')[0];
      return `news_${timestamp}_${originalName}`;
    }
  }
});

// Filtre des fichiers
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées (jpeg, jpg, png, gif, webp)'));
  }
};

// Configuration de Multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: fileFilter
});

// Middleware pour supprimer l'ancienne image
export const deleteOldImage = async (imageUrl) => {
  if (!imageUrl) return;
  
  try {
    // Extraire le public_id de l'URL Cloudinary
    const publicId = imageUrl.split('/').pop().split('.')[0];
    const fullPublicId = `news-images/${publicId}`;
    
    await cloudinary.v2.uploader.destroy(fullPublicId);
    console.log(`Image supprimée: ${fullPublicId}`);
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'image:', error);
  }
};

// Middleware pour formater la réponse Cloudinary
export const formatImageResponse = (req, res, next) => {
  if (req.file) {
    req.body.image = req.file.path; // URL Cloudinary
    req.body.imagePublicId = req.file.filename; // Public ID pour suppression future
  }
  next();
};