import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import conversationRoutes from './routes/conversations';
import { setupSocketGateway } from './socket/chatGateway';
import { prisma } from './prisma';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

// CORS setup
app.use(cors({
  origin: '*', // Allow all origins for dev/PWA accessibility
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per IP per window
  message: { error: 'Too many authentication requests from this IP' },
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'Whisper E2EE Backend' });
});

// Socket.IO Server
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

setupSocketGateway(io);

// Initialize Prisma DB & Start Server
async function main() {
  try {
    await prisma.$connect();
    console.log('[Database] Connected to Prisma SQLite/PostgreSQL Database');
    
    server.listen(PORT, () => {
      console.log(`[Server] Whisper E2EE Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Database connection error:', error);
    process.exit(1);
  }
}

main();
