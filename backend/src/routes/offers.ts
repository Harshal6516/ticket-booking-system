import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { generateQRCode } from '../services/qrService';
import { sendBookingConfirmationEmail } from '../services/emailService';
import { getIO } from '../socket';

const router = Router();

// ============================================================
// GET /offers/:token — get offer details
// ============================================================
router.get('/:token', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;

    const offerResult = await pool.query(`
      SELECT w.*,
        s.date as show_date, s.time as show_time,
        e.title as event_title, e.type as event_type,
        v.name as venue_name,
        ep.price,
        u.name as user_name, u.email as user_email
      FROM waitlist w
      JOIN shows s ON w.show_id = s.id
      JOIN events e ON s.event_id = e.id
      JOIN venues v ON e.venue_id = v.id
      LEFT JOIN event_pricing ep ON ep.event_id = e.id AND ep.category = w.category
      JOIN users u ON w.user_id = u.id
      WHERE w.offer_token = $1
    `, [token]);

    if (offerResult.rows.length === 0) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }

    const offer = offerResult.rows[0];

    if (offer.status === 'expired') {
      res.status(410).json({ error: 'This offer has expired' });
      return;
    }

    if (offer.status === 'converted') {
      res.status(410).json({ error: 'This offer has already been accepted' });
      return;
    }

    if (offer.status !== 'offered') {
      res.status(400).json({ error: 'Invalid offer status' });
      return;
    }

    // Check if offer has expired by time
    if (offer.offer_expires_at && new Date(offer.offer_expires_at) < new Date()) {
      res.status(410).json({ error: 'This offer has expired' });
      return;
    }

    // Get the offered seat
    const offeredSeat = await pool.query(`
      SELECT ss.id, sl.row_label, sl.seat_number, ss.category
      FROM show_seats ss
      JOIN seat_layouts sl ON ss.seat_id = sl.id
      WHERE ss.show_id = $1 AND ss.category = $2 AND ss.status = 'offered' AND ss.held_by_user_id = $3
      LIMIT 1
    `, [offer.show_id, offer.category, offer.user_id]);

    res.json({
      offer: {
        id: offer.id,
        showId: offer.show_id,
        category: offer.category,
        status: offer.status,
        offerExpiresAt: offer.offer_expires_at,
        showDate: offer.show_date,
        showTime: offer.show_time,
        eventTitle: offer.event_title,
        eventType: offer.event_type,
        venueName: offer.venue_name,
        price: offer.price ? parseFloat(offer.price) : null,
        seat: offeredSeat.rows[0] || null,
      },
    });
  } catch (err) {
    console.error('Get offer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /offers/:token/accept — accept the waitlist offer
// ============================================================
router.post('/:token/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.user!.id;

    // Allow optional customer details override
    const customerName = req.body.customerName;
    const customerEmail = req.body.customerEmail;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock and verify the offer
      const offerResult = await client.query(`
        SELECT * FROM waitlist
        WHERE offer_token = $1 AND user_id = $2 AND status = 'offered'
        FOR UPDATE
      `, [token, userId]);

      if (offerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Offer not found, not yours, or no longer valid' });
        return;
      }

      const offer = offerResult.rows[0];

      // Check if expired
      if (offer.offer_expires_at && new Date(offer.offer_expires_at) < new Date()) {
        await client.query('ROLLBACK');
        res.status(410).json({ error: 'This offer has expired' });
        return;
      }

      // Find the offered seat
      const seatResult = await client.query(`
        SELECT id FROM show_seats
        WHERE show_id = $1 AND category = $2 AND status = 'offered' AND held_by_user_id = $3
        LIMIT 1
        FOR UPDATE
      `, [offer.show_id, offer.category, userId]);

      if (seatResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'The offered seat is no longer available' });
        return;
      }

      const seatId = seatResult.rows[0].id;

      // Atomic: transition seat from offered → booked
      const bookResult = await client.query(`
        UPDATE show_seats
        SET status = 'booked'
        WHERE id = $1 AND status = 'offered' AND held_by_user_id = $2
        RETURNING id
      `, [seatId, userId]);

      if (bookResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Failed to book the seat' });
        return;
      }

      // Mark waitlist entry as converted
      await client.query(
        `UPDATE waitlist SET status = 'converted' WHERE id = $1`,
        [offer.id]
      );

      // Get user details for booking
      const userResult = await client.query(
        'SELECT name, email FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      // Generate booking
      const bookingRef = `BK-${uuidv4().slice(0, 8).toUpperCase()}`;
      const qrCodeUrl = await generateQRCode(bookingRef);

      const bookingResult = await client.query(`
        INSERT INTO bookings (user_id, show_id, seat_ids, booking_ref, customer_name, customer_email, qr_code_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userId,
        offer.show_id,
        [seatId],
        bookingRef,
        customerName || user.name,
        customerEmail || user.email,
        qrCodeUrl,
      ]);

      await client.query('COMMIT');

      const booking = bookingResult.rows[0];

      // Emit socket event
      try {
        const io = getIO();
        io.to(`show:${offer.show_id}`).emit('seat:updated', {
          seats: [{ id: seatId, status: 'booked' }],
        });
      } catch (socketErr) {
        console.error('Socket emit error:', socketErr);
      }

      // Send confirmation email (async)
      const showDetails = await pool.query(`
        SELECT s.date, s.time, e.title as event_title, v.name as venue_name
        FROM shows s
        JOIN events e ON s.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        WHERE s.id = $1
      `, [offer.show_id]);

      const seatDetails = await pool.query(`
        SELECT sl.row_label, sl.seat_number, ss.category, ep.price
        FROM show_seats ss
        JOIN seat_layouts sl ON ss.seat_id = sl.id
        JOIN shows sh ON ss.show_id = sh.id
        JOIN event_pricing ep ON ep.event_id = sh.event_id AND ep.category = ss.category
        WHERE ss.id = $1
      `, [seatId]);

      if (showDetails.rows.length > 0 && seatDetails.rows.length > 0) {
        const show = showDetails.rows[0];
        const seat = seatDetails.rows[0];
        sendBookingConfirmationEmail({
          to: customerEmail || user.email,
          customerName: customerName || user.name,
          bookingRef,
          eventTitle: show.event_title,
          showDate: show.date,
          showTime: show.time,
          venueName: show.venue_name,
          seats: [`${seat.row_label}${seat.seat_number}`],
          totalPrice: parseFloat(seat.price),
          qrCodeDataUrl: qrCodeUrl,
        }).catch(err => console.error('Email send failed:', err));
      }

      res.status(201).json({
        booking,
        message: 'Offer accepted and booking confirmed!',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Accept offer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
