import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../types';
import { authenticate, optionalAuth } from '../middleware/auth';
import { env } from '../config/env';
import { getIO } from '../socket';

const router = Router();

// ============================================================
// Validation schemas
// ============================================================
const holdSchema = z.object({
  seatIds: z.array(z.string().uuid()).min(1, 'At least one seat is required'),
});

// ============================================================
// GET /events/:eventId/shows/:showId/seats
// Returns all seats with category, price, status, row, seat number
// ============================================================
router.get('/events/:eventId/shows/:showId/seats', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { eventId, showId } = req.params;

    // Verify show belongs to event
    const showCheck = await pool.query(
      'SELECT s.* FROM shows s WHERE s.id = $1 AND s.event_id = $2',
      [showId, eventId]
    );
    if (showCheck.rows.length === 0) {
      res.status(404).json({ error: 'Show not found for this event' });
      return;
    }

    // Fetch seats with layout info and pricing
    const seats = await pool.query(`
      SELECT 
        ss.id,
        ss.show_id,
        ss.seat_id,
        ss.category,
        ss.status,
        ss.hold_expires_at,
        ss.held_by_user_id,
        sl.row_label,
        sl.seat_number,
        ep.price
      FROM show_seats ss
      JOIN seat_layouts sl ON ss.seat_id = sl.id
      JOIN event_pricing ep ON ep.event_id = $1 AND ep.category = ss.category
      WHERE ss.show_id = $2
      ORDER BY sl.row_label, sl.seat_number
    `, [eventId, showId]);

    // Group by row for frontend rendering
    const seatsByRow: Record<string, any[]> = {};
    for (const seat of seats.rows) {
      if (!seatsByRow[seat.row_label]) {
        seatsByRow[seat.row_label] = [];
      }
      seatsByRow[seat.row_label].push({
        id: seat.id,
        seatId: seat.seat_id,
        category: seat.category,
        status: seat.status,
        rowLabel: seat.row_label,
        seatNumber: seat.seat_number,
        price: parseFloat(seat.price),
        holdExpiresAt: seat.hold_expires_at,
        isMyHold: seat.held_by_user_id === req.user?.id,
      });
    }

    res.json({
      show: showCheck.rows[0],
      seats: seats.rows.map(s => ({
        id: s.id,
        seatId: s.seat_id,
        category: s.category,
        status: s.status,
        rowLabel: s.row_label,
        seatNumber: s.seat_number,
        price: parseFloat(s.price),
        holdExpiresAt: s.hold_expires_at,
        isMyHold: s.held_by_user_id === req.user?.id,
      })),
      seatsByRow,
    });
  } catch (err) {
    console.error('Get seats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /shows/:id/seats/hold
// Atomic seat hold with conditional UPDATE — prevents double-hold race condition
// ============================================================
router.post('/shows/:id/seats/hold', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { id: showId } = req.params;
    const { seatIds } = parsed.data;
    const userId = req.user!.id;

    // Verify show exists
    const showCheck = await pool.query('SELECT id, event_id FROM shows WHERE id = $1', [showId]);
    if (showCheck.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Release any existing holds by this user for this show that are NOT in the new seatIds
      const releasedResult = await client.query(`
        UPDATE show_seats
        SET status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
        WHERE show_id = $1 AND held_by_user_id = $2 AND status = 'held' AND NOT (id = ANY($3))
        RETURNING id
      `, [showId, userId, seatIds]);

      // Attempt to hold each seat atomically
      // The WHERE status IN ('available', 'held') ensures we can re-hold seats we already hold
      const holdResults = [];
      for (const seatId of seatIds) {
        const result = await client.query(`
          UPDATE show_seats
          SET status = 'held',
              held_by_user_id = $1,
              hold_expires_at = NOW() + INTERVAL '${env.HOLD_TTL_MINUTES} minutes'
          WHERE id = $2 AND (status = 'available' OR (status = 'held' AND held_by_user_id = $1))
          RETURNING id
        `, [userId, seatId]);

        if (result.rows.length === 0) {
          // Seat is not available — abort entire transaction
          await client.query('ROLLBACK');
          res.status(409).json({
            error: 'One or more seats are no longer available',
            failedSeatId: seatId,
          });
          return;
        }

        holdResults.push(result.rows[0]);
      }

      await client.query('COMMIT');

      // Fetch updated seats to broadcast
      const updatedSeats = await pool.query(`
        SELECT ss.id, ss.status, ss.hold_expires_at, sl.row_label, sl.seat_number, ss.category
        FROM show_seats ss
        JOIN seat_layouts sl ON ss.seat_id = sl.id
        WHERE ss.id = ANY($1)
      `, [seatIds]);

      // Emit real-time update to all viewers of this show
      try {
        const io = getIO();
        io.to(`show:${showId}`).emit('seat:updated', {
          seats: updatedSeats.rows.map(s => ({
            id: s.id,
            status: s.status,
            holdExpiresAt: s.hold_expires_at,
            rowLabel: s.row_label,
            seatNumber: s.seat_number,
            category: s.category,
          })),
        });

        // Broadcast released seats if any
        if (releasedResult.rows.length > 0) {
          io.to(`show:${showId}`).emit('seat:released', {
            seats: releasedResult.rows.map(r => ({ id: r.id, status: 'available' })),
          });
        }
      } catch (socketErr) {
        // Socket.io failure shouldn't break the hold operation
        console.error('Socket emit error:', socketErr);
      }

      res.json({
        held: holdResults.map(r => r.id),
        holdExpiresAt: new Date(Date.now() + env.HOLD_TTL_MINUTES * 60 * 1000).toISOString(),
        message: `Seats held for ${env.HOLD_TTL_MINUTES} minutes`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Hold seats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
