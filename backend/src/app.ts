import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';

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

// ============================================================
// Error handling
// ============================================================
app.use(errorHandler);

export default app;
