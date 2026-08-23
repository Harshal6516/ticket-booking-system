import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { generateQRCode } from '../services/qrService';
import { sendBookingConfirmationEmail } from '../services/emailService';
import { offerSeatToWaitlist } from '../jobs/sweepJob';
import { getIO } from '../socket';

const router = Router();

// ============================================================
// Validation
// ============================================================
const createBookingSchema = z.object({
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1),
  customerName: z.string().min(1).max(255),
  customerEmail: z.string().email(),
  idempotencyKey: z.string().optional(),
});

// ============================================================
// POST /bookings — confirm booking (seats must be held by this user)
// ============================================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { showId, seatIds, customerName, customerEmail, idempotencyKey } = parsed.data;
    const userId = req.user!.id;

    // Fast path: Check idempotency key before starting transaction
    if (idempotencyKey) {
      const existing = await pool.query(
        'SELECT * FROM bookings WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey]
      );
      if (existing.rows.length > 0) {
        res.status(200).json({
          booking: existing.rows[0],
          message: 'Returned existing booking (idempotency hit)',
        });
        return;
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Atomic: confirm each seat (must be held by this user)
      for (const seatId of seatIds) {
        const result = await client.query(`
          UPDATE show_seats
          SET status = 'booked'
          WHERE id = $1 AND status = 'held' AND held_by_user_id = $2
          RETURNING id
        `, [seatId, userId]);

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(409).json({
            error: 'One or more seats are not held by you or have expired',
            failedSeatId: seatId,
          });
          return;
        }
      }

      // Generate booking reference
      const bookingRef = `BK-${uuidv4().slice(0, 8).toUpperCase()}`;

      // Generate QR code
      const qrCodeUrl = await generateQRCode(bookingRef);

      // Create booking record
      const bookingResult = await client.query(`
        INSERT INTO bookings (user_id, show_id, seat_ids, booking_ref, customer_name, customer_email, qr_code_url, idempotency_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [userId, showId, seatIds, bookingRef, customerName, customerEmail, qrCodeUrl, idempotencyKey || null]);

      await client.query('COMMIT');

      const booking = bookingResult.rows[0];

      // Fetch show + event details for the email
      const showDetails = await pool.query(`
        SELECT s.date, s.time, e.title as event_title, v.name as venue_name
        FROM shows s
        JOIN events e ON s.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        WHERE s.id = $1
      `, [showId]);

      // Fetch seat details for the email
      const seatDetails = await pool.query(`
        SELECT sl.row_label, sl.seat_number, ss.category, ep.price
        FROM show_seats ss
        JOIN seat_layouts sl ON ss.seat_id = sl.id
        JOIN shows sh ON ss.show_id = sh.id
        JOIN event_pricing ep ON ep.event_id = sh.event_id AND ep.category = ss.category
        WHERE ss.id = ANY($1)
      `, [seatIds]);

      const totalPrice = seatDetails.rows.reduce(
        (sum: number, s: { price: string }) => sum + parseFloat(s.price), 0
      );

      // Emit socket event
      try {
        const io = getIO();
        io.to(`show:${showId}`).emit('seat:updated', {
          seats: seatIds.map(id => ({ id, status: 'booked' })),
        });
      } catch (socketErr) {
        console.error('Socket emit error:', socketErr);
      }

      // Send confirmation email (async, don't block response)
      if (showDetails.rows.length > 0) {
        const show = showDetails.rows[0];
        sendBookingConfirmationEmail({
          to: customerEmail,
          customerName,
          bookingRef,
          eventTitle: show.event_title,
          showDate: show.date,
          showTime: show.time,
          venueName: show.venue_name,
          seats: seatDetails.rows.map(
            (s: { row_label: string; seat_number: number }) => `${s.row_label}${s.seat_number}`
          ),
          totalPrice,
          qrCodeDataUrl: qrCodeUrl,
        }).catch(err => console.error('Email send failed:', err));
      }

      res.status(201).json({
        booking: {
          ...booking,
          seats: seatDetails.rows,
          totalPrice,
        },
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      
      // Handle Postgres Unique Violation (23505) for idempotency key if concurrent insert happened
      if (err.code === '23505' && idempotencyKey) {
        const existing = await pool.query(
          'SELECT * FROM bookings WHERE user_id = $1 AND idempotency_key = $2',
          [userId, idempotencyKey]
        );
        if (existing.rows.length > 0) {
          res.status(200).json({
            booking: existing.rows[0],
            message: 'Returned existing booking (idempotency hit)',
          });
          return;
        }
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /bookings/me — list bookings for logged-in user
// ============================================================
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const bookings = await pool.query(`
      SELECT b.*,
        s.date as show_date, s.time as show_time,
        e.title as event_title, e.type as event_type,
        v.name as venue_name, v.address as venue_address
      FROM bookings b
      JOIN shows s ON b.show_id = s.id
      JOIN events e ON s.event_id = e.id
      JOIN venues v ON e.venue_id = v.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    // For each booking, fetch seat details
    const bookingsWithSeats = await Promise.all(
      bookings.rows.map(async (booking: any) => {
        const seats = await pool.query(`
          SELECT sl.row_label, sl.seat_number, ss.category, ep.price
          FROM show_seats ss
          JOIN seat_layouts sl ON ss.seat_id = sl.id
          JOIN shows sh ON ss.show_id = sh.id
          JOIN event_pricing ep ON ep.event_id = sh.event_id AND ep.category = ss.category
          WHERE ss.id = ANY($1)
        `, [booking.seat_ids]);

        return {
          ...booking,
          seats: seats.rows,
          totalPrice: seats.rows.reduce(
            (sum: number, s: { price: string }) => sum + parseFloat(s.price), 0
          ),
        };
      })
    );

    res.json({ bookings: bookingsWithSeats });
  } catch (err) {
    console.error('Get bookings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// DELETE /bookings/:id — cancel booking → trigger waitlist cascade
// ============================================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Fetch booking (must belong to this user and be confirmed)
      const bookingResult = await client.query(`
        SELECT * FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'confirmed'
      `, [id, userId]);

      if (bookingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Booking not found or already cancelled' });
        return;
      }

      const booking = bookingResult.rows[0];

      // Mark booking as cancelled
      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [id]
      );

      // Release all seats back to available
      const releasedSeats = await client.query(`
        UPDATE show_seats
        SET status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
        WHERE id = ANY($1) AND status = 'booked'
        RETURNING id, category, show_id
      `, [booking.seat_ids]);

      await client.query('COMMIT');

      // Emit socket events for released seats
      try {
        const io = getIO();
        io.to(`show:${booking.show_id}`).emit('seat:released', {
          seats: releasedSeats.rows.map(s => ({ id: s.id, status: 'available' })),
        });
      } catch (socketErr) {
        console.error('Socket emit error:', socketErr);
      }

      // Trigger waitlist cascade for each freed seat
      for (const seat of releasedSeats.rows) {
        await offerSeatToWaitlist(seat.show_id, seat.category, seat.id);
      }

      res.json({ message: 'Booking cancelled successfully', bookingId: id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Cancel booking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
