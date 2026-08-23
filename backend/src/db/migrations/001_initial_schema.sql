-- ============================================================
-- Ticket Booking System — Initial Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'organiser', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- Venues
-- ============================================================
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  created_by_admin_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Seat Layouts (template seats belonging to a venue)
-- ============================================================
CREATE TABLE seat_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  row_label VARCHAR(10) NOT NULL,
  seat_number INTEGER NOT NULL,
  UNIQUE(venue_id, row_label, seat_number)
);

CREATE INDEX idx_seat_layouts_venue ON seat_layouts(venue_id);

-- ============================================================
-- Events
-- ============================================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('movie', 'concert')),
  venue_id UUID NOT NULL REFERENCES venues(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_venue ON events(venue_id);
CREATE INDEX idx_events_organiser ON events(organiser_id);

-- ============================================================
-- Shows (individual showtimes for an event)
-- ============================================================
CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shows_event ON shows(event_id);
CREATE INDEX idx_shows_date ON shows(date);

-- ============================================================
-- Event Pricing (per-category pricing for an event)
-- ============================================================
CREATE TABLE event_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  UNIQUE(event_id, category)
);

CREATE INDEX idx_event_pricing_event ON event_pricing(event_id);

-- ============================================================
-- Show Seats (per-show seat inventory — the core booking table)
-- ============================================================
CREATE TABLE show_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_id UUID NOT NULL REFERENCES seat_layouts(id),
  category VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'held', 'offered', 'booked')),
  held_by_user_id UUID REFERENCES users(id),
  hold_expires_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(show_id, seat_id)
);

-- Primary query path: fetch all seats for a show
CREATE INDEX idx_show_seats_show ON show_seats(show_id);
-- Sweep job: find expired holds efficiently
CREATE INDEX idx_show_seats_held_expiry ON show_seats(hold_expires_at)
  WHERE status = 'held';
-- Sweep job: find expired offers efficiently
CREATE INDEX idx_show_seats_offered ON show_seats(show_id, status)
  WHERE status = 'offered';
-- Lookup by user (for "my holds")
CREATE INDEX idx_show_seats_user ON show_seats(held_by_user_id)
  WHERE held_by_user_id IS NOT NULL;

-- ============================================================
-- Bookings
-- ============================================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  show_id UUID NOT NULL REFERENCES shows(id),
  seat_ids UUID[] NOT NULL,
  booking_ref VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  qr_code_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_show ON bookings(show_id);
CREATE INDEX idx_bookings_ref ON bookings(booking_ref);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ============================================================
-- Waitlist
-- ============================================================
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id),
  category VARCHAR(50) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'expired', 'converted')),
  offer_expires_at TIMESTAMPTZ,
  offer_token VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Queue ordering: next person for a show + category
CREATE INDEX idx_waitlist_queue ON waitlist(show_id, category, position)
  WHERE status = 'waiting';
-- Sweep job: find expired offers
CREATE INDEX idx_waitlist_offer_expiry ON waitlist(offer_expires_at)
  WHERE status = 'offered';
-- User's waitlist entries
CREATE INDEX idx_waitlist_user ON waitlist(user_id);

-- ============================================================
-- Migrations tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
