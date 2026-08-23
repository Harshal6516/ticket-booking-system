import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/ticket_booking',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  PORT: parseInt(process.env.PORT || '3000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  HOLD_TTL_MINUTES: parseInt(process.env.HOLD_TTL_MINUTES || '10', 10),
  OFFER_TTL_MINUTES: parseInt(process.env.OFFER_TTL_MINUTES || '30', 10),
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  FROM_EMAIL: process.env.FROM_EMAIL || 'tickets@yourdomain.com',
  SWEEP_INTERVAL_MS: parseInt(process.env.SWEEP_INTERVAL_MS || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

// Validate required env vars in production
if (env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'RESEND_API_KEY'] as const;
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
