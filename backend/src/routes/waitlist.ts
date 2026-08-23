import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';

const router = Router();

// ============================================================
// Validation
// ============================================================
const joinWaitlistSchema = z.object({
  showId: z.string().uuid(),
  category: z.string().min(1),
});

// ============================================================
// POST /waitlist — join waitlist for a show + category
// ============================================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = joinWaitlistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { showId, category } = parsed.data;
    const userId = req.user!.id;

    // Verify show exists
    const showCheck = await pool.query('SELECT id FROM shows WHERE id = $1', [showId]);
    if (showCheck.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }

    // Check if user is already on the waitlist for this show + category
    const existingEntry = await pool.query(
      `SELECT id FROM waitlist 
       WHERE show_id = $1 AND category = $2 AND user_id = $3 AND status IN ('waiting', 'offered')`,
      [showId, category, userId]
    );

    if (existingEntry.rows.length > 0) {
      res.status(409).json({ error: 'You are already on the waitlist for this category' });
      return;
    }

    // Check if there are actually no available seats (only allow waitlist when sold out)
    const availableSeats = await pool.query(
      `SELECT COUNT(*) as count FROM show_seats 
       WHERE show_id = $1 AND category = $2 AND status = 'available'`,
      [showId, category]
    );

    if (parseInt(availableSeats.rows[0].count) > 0) {
      res.status(400).json({ 
        error: 'Seats are still available for this category. Please book directly.',
        availableCount: parseInt(availableSeats.rows[0].count),
      });
      return;
    }

    // Get next position in queue
    const maxPosition = await pool.query(
      `SELECT COALESCE(MAX(position), 0) as max_pos FROM waitlist 
       WHERE show_id = $1 AND category = $2`,
      [showId, category]
    );
    const nextPosition = parseInt(maxPosition.rows[0].max_pos) + 1;

    // Insert waitlist entry
    const result = await pool.query(
      `INSERT INTO waitlist (show_id, category, user_id, position, status)
       VALUES ($1, $2, $3, $4, 'waiting')
       RETURNING *`,
      [showId, category, userId, nextPosition]
    );

    res.status(201).json({
      waitlistEntry: result.rows[0],
      message: `You are #${nextPosition} in the waitlist for ${category} seats`,
    });
  } catch (err) {
    console.error('Join waitlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /waitlist/me — get user's waitlist entries
// ============================================================
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const entries = await pool.query(`
      SELECT w.*,
        s.date as show_date, s.time as show_time,
        e.title as event_title, e.type as event_type,
        v.name as venue_name,
        ep.price
      FROM waitlist w
      JOIN shows s ON w.show_id = s.id
      JOIN events e ON s.event_id = e.id
      JOIN venues v ON e.venue_id = v.id
      LEFT JOIN event_pricing ep ON ep.event_id = e.id AND ep.category = w.category
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
    `, [userId]);

    res.json({ waitlistEntries: entries.rows });
  } catch (err) {
    console.error('Get waitlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
