import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';

const server = http.createServer(app);

// ============================================================
// Socket.io setup
// ============================================================
const io = new SocketIOServer(server, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Client joins a show room to receive real-time seat updates
  socket.on('join:show', (showId: string) => {
    socket.join(`show:${showId}`);
    console.log(`Socket ${socket.id} joined room show:${showId}`);
  });

  socket.on('leave:show', (showId: string) => {
    socket.leave(`show:${showId}`);
    console.log(`Socket ${socket.id} left room show:${showId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Export io for use in routes and services
export { io };

// ============================================================
// Start server
// ============================================================
server.listen(env.PORT, () => {
  console.log(`\n🎫 Ticket Booking API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Frontend URL: ${env.FRONTEND_URL}`);
  console.log(`   Hold TTL: ${env.HOLD_TTL_MINUTES} minutes`);
  console.log(`   Offer TTL: ${env.OFFER_TTL_MINUTES} minutes\n`);
});
