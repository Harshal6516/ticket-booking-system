# TicketHub — High-Concurrency Ticket Booking System

A full-stack ticketing platform designed to handle massive traffic spikes and concurrent bookings seamlessly. Built with Node.js, Express, PostgreSQL, Socket.io, and React.

## 🚀 Key Features

*   **Atomic Seat Reservations**: Rock-solid concurrency handling using PostgreSQL conditional updates. Prevents double-booking even under extreme load.
*   **Real-time Seat Map**: Instant updates across all connected clients via Socket.io when seats are held, released, booked, or offered.
*   **Smart Waitlist with Cascading Offers**: Automatic waitlist management. When a hold expires or a booking is cancelled, the system automatically offers the seat to the next person in line, with a timed acceptance window.
*   **Automated Background Sweep**: A resilient background job engine using `node-cron` to continuously expire stale holds and process waitlist offers without relying on Redis.
*   **QR Code Ticketing**: Instantly generated QR codes on confirmed bookings, sent via email using Resend.
*   **Role-based Access Control**: Distinct flows for Customers, Organisers (Event creation & dashboards), and Admins (Venue management).
*   **Stunning Premium UI**: Glassmorphism, tailored color palettes, micro-animations, and dynamic seat map rendering built with Tailwind CSS v4.

## 🛠 Tech Stack

*   **Backend**: Node.js, Express.js, TypeScript
*   **Database**: PostgreSQL (Single source of truth)
*   **Real-time**: Socket.io
*   **Frontend**: React 19, Vite, Tailwind CSS v4
*   **Email**: Resend
*   **Auth**: JWT

## ⚙️ Running Locally

### Prerequisites
*   Node.js v20+
*   PostgreSQL running locally or a cloud database URL
*   Resend API Key

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
# Edit .env with your DB credentials, Resend API key, and JWT secret

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

Please see [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for a deep dive into the architecture, database schema, and concurrency mechanisms.
