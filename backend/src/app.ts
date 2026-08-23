import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import venueRoutes from './routes/venues';
import eventRoutes from './routes/events';
import seatRoutes from './routes/seats';
import bookingRoutes from './routes/bookings';
import waitlistRoutes from './routes/waitlist';
import offerRoutes from './routes/offers';

const app = express();

// ============================================================
// Global Middleware
// ============================================================
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// ============================================================
// Health check
// ============================================================
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// Routes
// ============================================================
app.use('/auth', authRoutes);
app.use('/venues', venueRoutes);
app.use('/events', eventRoutes);
app.use('/', seatRoutes);       // Mounts /events/:eventId/shows/:showId/seats AND /shows/:id/seats/hold
app.use('/bookings', bookingRoutes);
app.use('/waitlist', waitlistRoutes);
app.use('/offers', offerRoutes);

// Organiser summary route (mounted via events router)
app.use('/organiser/events', (req, res, next) => {
  // Rewrite /organiser/events/:id/summary → /events/organiser/summary/:id
  const match = req.url.match(/^\/([^/]+)\/summary$/);
  if (match) {
    req.url = `/organiser/summary/${match[1]}`;
    eventRoutes(req, res, next);
  } else {
    next();
  }
});

// ============================================================
// Error handling
// ============================================================
app.use(errorHandler);

export default app;
