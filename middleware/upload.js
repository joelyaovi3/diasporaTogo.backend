// import multer from 'multer';

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/'); // Dossier temporaire pour stocker les fichiers avant téléversement sur Cloudinary
//   },
//   filename: function (req, file, cb) {
//     cb(null, Date.now() + '-' + file.originalname); // Nom de fichier unique
//   },
// });

// const upload = multer({ storage: storage });

// export const uploadMiddleware = upload.single('file');

import multer from 'multer';
import path from 'path';

// Configuration de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'tmp/'); // Dossier temporaire pour les fichiers
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname); // Nom de fichier unique
  },
});

const upload = multer({ storage });

export const uploadMiddleware = upload.single('file');