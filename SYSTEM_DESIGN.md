# System Design & Architecture

## Core Philosophy

The primary constraint for this system was handling massive concurrency without complex infrastructure (like Redis queues or BullMQ) to keep deployment simple and free-tier friendly. The entire concurrency and state machine logic is built purely on PostgreSQL utilizing ACID transactions, row-level locks, and atomic conditional updates.

## Architecture Components

1.  **Frontend (React/Vite)**
    *   Communicates with the REST API.
    *   Maintains a long-lived WebSocket connection via Socket.io to receive real-time seat status updates (Hold, Release, Booked, Offered).
2.  **Backend (Node.js/Express)**
    *   Stateless REST API.
    *   Socket.io server mapping `show_id` to in-memory rooms.
    *   Background `node-cron` job for sweeping stale holds and processing waitlists.
3.  **Database (PostgreSQL)**
    *   The Single Source of Truth (SSOT).
    *   All concurrency guarantees are enforced at the DB level, not in application memory.

## Concurrency Mechanisms

### The Problem
During high-demand ticket sales, thousands of users might attempt to click the same seat simultaneously. If the application reads the seat state as "available" into memory, verifies it, and then writes it back as "held", race conditions will lead to double-booking.

### The Solution: Atomic Conditional Updates
Instead of a Read-Modify-Write cycle, the system uses a single SQL update statement:

```sql
UPDATE seats
SET status = 'held', held_by_user_id = $1, hold_expires_at = $2
WHERE id = ANY($3) AND status = 'available'
RETURNING id;
```

**How it works:**
1.  The database engine natively locks the rows attempting to be updated.
2.  The `WHERE status = 'available'` clause ensures that if another transaction already flipped the status to 'held', this update will match 0 rows.
3.  The `RETURNING id` clause tells the application exactly which seats it successfully secured.
4.  If the number of returned IDs is less than the requested amount, the transaction rolls back, throwing a concurrency error.

This guarantees 100% safety against double-booking at the database engine level, scaling to as many concurrent connections as Postgres can handle.

## State Machine

A seat flows through the following states:

1.  `available`: Open for selection.
2.  `held`: Temporarily locked by a user while they complete checkout (10 mins TTL).
3.  `booked`: Permanently locked and sold.
4.  `offered`: Temporarily locked for a specific waitlist user (24 hour TTL).

## Waitlist & Cascading Offers Logic

When a category sells out, users can join a waitlist. The system uses an asynchronous "sweep" job to handle waitlist processing.

### The Sweep Job (`sweepJob.ts`)
Runs every 3 seconds:
1.  **Release Expired Holds**: Finds seats where `status = 'held'` and `hold_expires_at < NOW()`. Reverts them to `available`.
2.  **Expire Unaccepted Offers**: Finds seats where `status = 'offered'` and `offer_expires_at < NOW()`. Reverts them to `available`, and marks the waitlist entry as `expired`.
3.  **Process Waitlist Cascade**:
    *   Finds any `available` seats for shows that have an active waitlist.
    *   Uses PostgreSQL's `FOR UPDATE SKIP LOCKED` to grab the next person in the waitlist queue without blocking other parallel background workers (if scaled horizontally in the future).
    *   Transitions the seat to `offered`, sets a 24-hour TTL, generates a unique secure token, and emails the user the offer link.

By decoupling the waitlist cascade from the actual cancellation or timeout endpoints, the API remains extremely fast. The heavy lifting is done in the background.

## Schema Design

### `venues` & `seats`
Seats are pre-generated when a venue is created. This allows granular layout maps (Row A, Seat 1).

### `events` & `shows`
An Event (e.g., "Taylor Swift Eras Tour") has multiple Shows (e.g., "Friday 8 PM", "Saturday 8 PM").

### `show_seats`
This is a junction table tracking the state of a specific physical venue seat for a specific show. This is the core table where concurrency locks happen.

### `waitlist_entries`
Tracks users waiting for a specific show and category. Order is strictly enforced by `created_at` ASC.
