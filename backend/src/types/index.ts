import { Request } from 'express';

// ============================================================
// User & Auth
// ============================================================
export type UserRole = 'customer' | 'organiser' | 'admin';

export interface JwtPayload {
  id: string;
  role: UserRole;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ============================================================
// Database Row Types
// ============================================================
export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

export interface VenueRow {
  id: string;
  name: string;
  address: string;
  created_by_admin_id: string;
  created_at: Date;
}

export interface SeatLayoutRow {
  id: string;
  venue_id: string;
  category: string;
  row_label: string;
  seat_number: number;
}

export interface EventRow {
  id: string;
  organiser_id: string;
  title: string;
  type: 'movie' | 'concert';
  venue_id: string;
  description: string | null;
  created_at: Date;
}

export interface ShowRow {
  id: string;
  event_id: string;
  date: string;
  time: string;
  created_at: Date;
}

export interface EventPricingRow {
  id: string;
  event_id: string;
  category: string;
  price: string; // DECIMAL comes as string from pg
}

export type SeatStatus = 'available' | 'held' | 'offered' | 'booked';

export interface ShowSeatRow {
  id: string;
  show_id: string;
  seat_id: string;
  category: string;
  status: SeatStatus;
  held_by_user_id: string | null;
  hold_expires_at: Date | null;
  version: number;
}

export interface BookingRow {
  id: string;
  user_id: string;
  show_id: string;
  seat_ids: string[];
  booking_ref: string;
  customer_name: string;
  customer_email: string;
  qr_code_url: string | null;
  status: 'confirmed' | 'cancelled';
  created_at: Date;
}

export type WaitlistStatus = 'waiting' | 'offered' | 'expired' | 'converted';

export interface WaitlistRow {
  id: string;
  show_id: string;
  category: string;
  user_id: string;
  position: number;
  status: WaitlistStatus;
  offer_expires_at: Date | null;
  offer_token: string | null;
  created_at: Date;
}
