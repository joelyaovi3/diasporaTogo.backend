import express from 'express';
import dotenv from 'dotenv/config';
import mongoDBConnect from './mongoDB/connection.js';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
// import messageRoutes from './routes/message.js';
import userRoutes from './routes/user.js';
// import constactRouter from "./routes/contact.js";
// import commentRouter from "./routes/comment.js";
import * as Server from 'socket.io';
import path from 'path';
import Chat from './models/chatModel.js';
import cookieParser from 'cookie-parser';
import newsRoutes from './routes/newsRoutes.js';
import newsValidation from './routes/moderationRoutes.js'


const app = express();

const allowedOrigins = [
  'http://localhost:3000',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // IMPORTANT: autorise les cookies
  exposedHeaders: ["Set-Cookie"]
};


app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
// app.use('/images', express.static(path.join(__dirname, 'images')));

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
app.use('/api/admin/news', newsValidation)
// app.use('/api/message', messageRoutes);
// app.use('/api/contact', constactRouter);
// app.use('/api/comment', commentRouter);

mongoose.set('strictQuery', false);
mongoDBConnect();

const PORT = process.env.PORT || 8003;
const server = app.listen(PORT, () => {
  console.log(`Server Listening at PORT - ${PORT}`);
});

const io = new Server.Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
});

io.on('connection', (socket) => {
  socket.on('setup', (userData) => {
    socket.join(userData.id);
    socket.emit('connected');
  });

  socket.on('join room', (room) => {
    socket.join(room);
  });

  socket.on('typing', (room) => socket.in(room).emit('typing'));
  socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

  socket.on('new message', async (newMessageRecieve) => {
    try {
      const chatId = newMessageRecieve.chatId;

      if (!chatId) {
        console.error("❌ chatId is missing in newMessageRecieve");
        return;
      }

      const chat = await Chat.findById(chatId).populate('users', '_id name');

      if (!chat || !Array.isArray(chat.users)) {
        console.error("❌ Chat or chat.users is not defined", chat);
        return;
      }

      chat.users.forEach((user) => {
        if (user._id.toString() === newMessageRecieve.sender._id.toString()) return;
        socket.in(user._id.toString()).emit('message recieved', newMessageRecieve);
      });
    } catch (err) {
      console.error("💥 Error in socket 'new message':", err);
    }
  });
});