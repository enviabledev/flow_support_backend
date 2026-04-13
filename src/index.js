require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const pool = require('./config/database');
const runMigrations = require('./config/migrate');
const SocketService = require('./services/socketService');
const PushService = require('./services/pushService');

// Import routes
const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const contactRoutes = require('./routes/contacts');
const webhookRoutes = require('./routes/webhooks');
const staffRoutes = require('./routes/staff');
const uploadRoutes = require('./routes/upload');
const broadcastRoutes = require('./routes/broadcast');

async function start() {
  // Run migrations before starting
  await runMigrations();

  const app = express();
  const server = http.createServer(app);

  // Only trust proxy headers when behind a reverse proxy (ALB, nginx, etc.)
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', true);
  }

  // Socket.IO setup — WebSocket only, aggressive keepalive
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket'],
    pingTimeout: 120000,
    pingInterval: 25000,
    connectTimeout: 30000,
    maxHttpBufferSize: 1e6,
    allowUpgrades: false,
  });

  SocketService.init(io);
  PushService.init();

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.staffName = decoded.name || decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Staff connected: ${socket.userId}`);

    socket.on('mark_read', async ({ conversationId }) => {
      const ConversationModel = require('./models/conversations');
      await ConversationModel.markRead(conversationId);
      SocketService.emitConversationUpdate(conversationId, { unreadCount: 0 });
    });

    socket.on('typing_start', ({ conversationId }) => {
      socket.broadcast.emit('typing_start', {
        conversationId,
        staffId: socket.userId,
        staffName: socket.staffName,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.broadcast.emit('typing_stop', {
        conversationId,
        staffId: socket.userId,
      });
    });

    socket.on('disconnect', () => {
      console.log(`Staff disconnected: ${socket.userId}`);
    });
  });

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check — ALB target group pings this every 30s
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'unhealthy', error: err.message });
    }
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/conversations', messageRoutes);
  app.use('/api/contacts', contactRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/broadcast', broadcastRoutes);
  app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));
  app.use('/webhooks', webhookRoutes);

  // Error handler
  app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Enviable WhatsApp server running on port ${PORT}`);
  });

  // Graceful shutdown — ECS sends SIGTERM before stopping a task
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      pool.end();
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10000);
  });

  return { app, server, io };
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
