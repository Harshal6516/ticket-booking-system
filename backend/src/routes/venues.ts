import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ============================================================
// Validation schemas
// ============================================================
const seatLayoutSchema = z.object({
  category: z.string().min(1),
  row_label: z.string().min(1).max(10),
  seat_number: z.number().int().positive(),
});

const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().min(1),
  seats: z.array(seatLayoutSchema).min(1, 'At least one seat is required'),
});

const updateVenueSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).optional(),
  seats: z.array(seatLayoutSchema).optional(),
});

// ============================================================
// GET /venues — list all venues (admin and organiser)
// ============================================================
router.get('/', authenticate, roleGuard('admin', 'organiser'), async (req: AuthRequest, res: Response) => {

  try {
    const venues = await pool.query(`
      SELECT v.*, 
        (SELECT COUNT(*) FROM seat_layouts sl WHERE sl.venue_id = v.id) as total_seats,
        (SELECT json_agg(DISTINCT sl.category) FROM seat_layouts sl WHERE sl.venue_id = v.id) as categories
      FROM venues v
      ORDER BY v.created_at DESC
    `);

    res.json({ venues: venues.rows });
  } catch (err) {
    console.error('List venues error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /venues/:id — get venue details with seat layout (admin only)
// ============================================================
router.get('/:id', authenticate, roleGuard('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const venueResult = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
    if (venueResult.rows.length === 0) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }

    const seatsResult = await pool.query(
      'SELECT * FROM seat_layouts WHERE venue_id = $1 ORDER BY row_label, seat_number',
      [id]
    );

    res.json({
      venue: venueResult.rows[0],
      seats: seatsResult.rows,
    });
  } catch (err) {
    console.error('Get venue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /venues — create venue with seat layout (admin only)
// ============================================================
router.post('/', authenticate, roleGuard('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { name, address, seats } = parsed.data;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create venue
      const venueResult = await client.query(
        `INSERT INTO venues (name, address, created_by_admin_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, address, req.user!.id]
      );
      const venue = venueResult.rows[0];

      // Bulk insert seat layouts
      if (seats.length > 0) {
        const values: any[] = [];
        const placeholders: string[] = [];

        seats.forEach((seat, i) => {
          const offset = i * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(venue.id, seat.category, seat.row_label, seat.seat_number);
        });

        await client.query(
          `INSERT INTO seat_layouts (venue_id, category, row_label, seat_number)
           VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      await client.query('COMMIT');

      // Fetch the inserted seats
      const seatsResult = await pool.query(
        'SELECT * FROM seat_layouts WHERE venue_id = $1 ORDER BY row_label, seat_number',
        [venue.id]
      );

      res.status(201).json({
        venue,
        seats: seatsResult.rows,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create venue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PUT /venues/:id — update venue (admin only)
// ============================================================
router.put('/:id', authenticate, roleGuard('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { name, address, seats } = parsed.data;

    // Check venue exists
    const existing = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update venue details if provided
      if (name || address) {
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 0;

        if (name) {
          paramCount++;
          updates.push(`name = $${paramCount}`);
          values.push(name);
        }
        if (address) {
          paramCount++;
          updates.push(`address = $${paramCount}`);
          values.push(address);
        }

        paramCount++;
        values.push(id);
        await client.query(
          `UPDATE venues SET ${updates.join(', ')} WHERE id = $${paramCount}`,
          values
        );
      }

      // Replace seat layouts if provided
      if (seats) {
        // Check if any shows exist that use this venue's seat layouts
        const showsExist = await client.query(`
          SELECT 1 FROM show_seats ss
          JOIN seat_layouts sl ON ss.seat_id = sl.id
          WHERE sl.venue_id = $1
          AND ss.status != 'available'
          LIMIT 1
        `, [id]);

        if (showsExist.rows.length > 0) {
          await client.query('ROLLBACK');
          res.status(409).json({
            error: 'Cannot modify seat layout while seats are held or booked in active shows',
          });
          return;
        }

        // Delete existing seat layouts and replace
        await client.query('DELETE FROM seat_layouts WHERE venue_id = $1', [id]);

        if (seats.length > 0) {
          const values: any[] = [];
          const placeholders: string[] = [];

          seats.forEach((seat, i) => {
            const offset = i * 4;
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
            values.push(id, seat.category, seat.row_label, seat.seat_number);
          });

          await client.query(
            `INSERT INTO seat_layouts (venue_id, category, row_label, seat_number)
             VALUES ${placeholders.join(', ')}`,
            values
          );
        }
      }

      await client.query('COMMIT');

      // Fetch updated venue and seats
      const venueResult = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
      const seatsResult = await pool.query(
        'SELECT * FROM seat_layouts WHERE venue_id = $1 ORDER BY row_label, seat_number',
        [id]
      );

      res.json({
        venue: venueResult.rows[0],
        seats: seatsResult.rows,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update venue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
