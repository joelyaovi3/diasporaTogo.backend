// server.js ou app.js - Version corrigée
import express from 'express';
import dotenv from 'dotenv/config';
import mongoDBConnect from './mongoDB/connection.js';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
import userRoutes from './routes/user.js';
import path from 'path';
import cookieParser from 'cookie-parser';
import newsRoutes from './routes/newsRoutes.js';
import newsValidation from './routes/moderationRoutes.js';
import chatRoutes from './routes/chat.js';
// import { configureSocket } from './config/socketConfig.js';
import http from 'http';

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'https://diasporatogo-teal.vercel.app',
  'https://diasporatogo.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ["Set-Cookie"]
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Hello!');
});

app.get('/api', (req, res) => {
  res.json({ message: 'This is an API endpoint' });
});

app.use('/api', userRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/admin/news', newsValidation);
app.use('/api/chat', chatRoutes);

mongoose.set('strictQuery', false);
mongoDBConnect();

const PORT = process.env.PORT || 8003;

// Créer le serveur HTTP
const server = http.createServer(app);

// Configurer Socket.IO
// const io = configureSocket(server);

// Ajouter io à l'objet app pour l'utiliser dans les routes
// app.set('io', io);

// Middleware pour injecter io dans les requêtes
// app.use((req, res, next) => {
//   req.io = io;
//   next();
// });

server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  // console.log(`🔌 Socket.IO actif`)
});

// Exporter pour les tests
// export {app, io}
export { app };