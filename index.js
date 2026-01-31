// server.js ou app.js - Version améliorée
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
import { configureSocket } from './config/socketConfig.js';
import http from 'http';

class Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = null;
    this.port = process.env.PORT || 8003;
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeDatabase();
    this.initializeSocket();
  }

  initializeMiddlewares() {
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

    this.app.use(cors(corsOptions));
    this.app.use(cookieParser());
    this.app.use(express.static('public'));
    this.app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // Middleware pour injecter io dans les requêtes après son initialisation
    this.app.use((req, res, next) => {
      if (this.io) {
        req.io = this.io;
      }
      next();
    });
  }

  initializeRoutes() {
    // Routes de base
    this.app.get('/', (req, res) => {
      res.send('Hello!');
    });

    this.app.get('/api', (req, res) => {
      res.json({ message: 'This is an API endpoint' });
    });

    // Routes d'API
    this.app.use('/api', userRoutes);
    this.app.use('/api/news', newsRoutes);
    this.app.use('/api/admin/news', newsValidation);
    this.app.use('/api/chat', chatRoutes);
  }

  initializeDatabase() {
    mongoose.set('strictQuery', false);
    mongoDBConnect();
  }

  initializeSocket() {
    this.io = configureSocket(this.server);
    this.app.set('io', this.io);
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Serveur démarré sur le port ${this.port}`);
        console.log(`🔌 Socket.IO actif`);
        resolve({ app: this.app, server: this.server, io: this.io });
      });

      this.server.on('error', (error) => {
        console.error('❌ Erreur du serveur:', error);
        reject(error);
      });
    });
  }

  // Méthodes pour obtenir les instances
  getApp() {
    return this.app;
  }

  getIo() {
    return this.io;
  }

  getServer() {
    return this.server;
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (this.io) {
        this.io.close();
      }
      
      this.server.close((error) => {
        if (error) {
          console.error('❌ Erreur lors de l\'arrêt du serveur:', error);
          reject(error);
        } else {
          console.log('✅ Serveur arrêté proprement');
          resolve();
        }
      });
    });
  }
}

// Création et démarrage du serveur
const serverInstance = new Server();

// Pour le démarrage immédiat si ce fichier est exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  serverInstance.start()
    .then(() => {
      console.log('✅ Application démarrée avec succès');
    })
    .catch((error) => {
      console.error('❌ Erreur lors du démarrage:', error);
      process.exit(1);
    });
}

// Exportations pour les tests et autres utilisations
export { serverInstance };
export const app = serverInstance.getApp();
export const io = serverInstance.getIo();
export const server = serverInstance.getServer();
export default serverInstance;