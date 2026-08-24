# TicketHub — High-Concurrency Ticket Booking System

A full-stack ticketing platform designed to handle massive traffic spikes and concurrent bookings seamlessly. Built with Node.js, Express, PostgreSQL, Socket.io, and React.

## 🚀 Key Features

*   **Atomic Seat Reservations**: Rock-solid concurrency handling using PostgreSQL conditional updates. Prevents double-booking even under extreme load.
*   **Real-time Seat Map**: Instant updates across all connected clients via Socket.io when seats are held, released, booked, or offered.
*   **Smart Waitlist with Cascading Offers**: Automatic waitlist management. When a hold expires or a booking is cancelled, the system automatically offers the seat to the next person in line, with a timed acceptance window.
*   **Automated Background Sweep**: A resilient background job engine using `node-cron` to continuously expire stale holds and process waitlist offers without relying on Redis..
*   **QR Code Ticketing**: Instantly generated QR codes on confirmed bookings, sent via email using Nodemailer (supports SMTP / Gmail / Brevo / Ethereal test inbox).
*   **Role-based Access Control**: Distinct flows for Customers, Organisers (Event creation & dashboards), and Admins (Venue management).
*   **Stunning Premium UI**: Glassmorphism, tailored color palettes, micro-animations, and dynamic seat map rendering built with Tailwind CSS v4.

## 🛠 Tech Stack

*   **Backend**: Node.js, Express.js, TypeScript
*   **Database**: PostgreSQL (Single source of truth)
*   **Real-time**: Socket.io
*   **Frontend**: React 19, Vite, Tailwind CSS v4
*   **Email**: Nodemailer (SMTP / Ethereal)
*   **Auth**: JWT

## ⚙️ Running Locally

### Prerequisites
*   Node.js v20+
*   PostgreSQL running locally or a cloud database URL
*   (Optional) SMTP credentials for real email delivery, or use automated Ethereal test inbox

### 1. Database Setup
```bash
# Create a local PostgreSQL database
createdb tickethub
```

### 2. Backend Setup
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your DB credentials and JWT secret


# Run migrations to create schema
npm run db:migrate

# Start the development server
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install

# Start the Vite development server
npm run dev
```

## 🧪 Seeding the Database

To instantly populate the database with an Admin, an Organiser, a Venue, and a test Event (Coldplay Concert), run the seeder script from the root of the repository:

```bash
node seed.js
```

*Note: Make sure your database is running and `backend/.env` is fully configured before seeding.*

## 🧪 Concurrency Testing

To prove the robustness of the system against race conditions, a native concurrency test script is provided.

```bash
# Set your environment variables (powershell example)
$env:TEST_SHOW_ID="<your-show-id>"
$env:TEST_SEAT_IDS="<seat-id-1>,<seat-id-2>"

# Run the test
node concurrency_test.js
```
*Note: The script uses native Node.js `fetch` (requires Node v18+).*

## 📐 Architecture & Concurrency Model

Please see [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for a deep dive into the architecture, database schema, and concurrency mechanisms (Fulfills Deliverable 4).

## 🗄️ Database Schema Summary

The core schema revolves around the following relationships (enforced natively in PostgreSQL):
- `users`: Stores customers, organisers, and admins with `role` ENUM.
- `venues` & `seat_layouts`: Organisers create physical venues. Pre-defined physical seats (Row A1, A2) mapped to categories.
- `events` & `shows`: Events have multiple Shows (date/time).
- `show_seats`: The central state machine. Maps physical seats to a specific show, tracking `status` (available, held, booked, offered), `held_by_user_id`, and `hold_expires_at`.
- `bookings`: Finalized reservations with `idempotency_key` and QR code URLs.
- `waitlist`: Tracks queue position per show per category.

*(Full schema defined in `backend/src/db/migrations/001_initial_schema.sql`)*

## 🌐 Core API Documentation

### Auth & Users
- `POST /api/auth/register`: Create a new user (Customer, Organiser, Admin).
- `POST /api/auth/login`: Authenticate and receive JWT.

### Events & Venues
- `GET /api/events`: Browse events (Supports `?type=`, `?date=`, `?search=`).
- `GET /api/events/:id`: View event details, shows, and pricing.
- `POST /api/events`: (Organiser) Create an event.
- `POST /api/venues`: (Admin) Create a venue with seat layout maps.

### Bookings & Holds (Concurrency Critical)
- `POST /api/shows/:showId/seats/hold`: Atomic seat reservation. Fails with 409 if seats are taken.
- `POST /api/bookings`: Confirm hold. Requires `idempotencyKey` to prevent double-charging.
- `GET /api/bookings/me`: View booking history.
- `DELETE /api/bookings/:id`: Cancel booking, release seats, and trigger waitlist cascade.

### Waitlist
- `POST /api/waitlist`: Join waitlist for a sold-out category.
- `POST /api/offers/:token/accept`: Accept an auto-assigned waitlist offer.
