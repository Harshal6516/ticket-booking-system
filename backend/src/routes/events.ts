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
const showSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
});

const pricingSchema = z.object({
  category: z.string().min(1),
  price: z.number().positive('Price must be positive'),
});

const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['movie', 'concert']),
  venue_id: z.string().uuid(),
  description: z.string().optional(),
  shows: z.array(showSchema).min(1, 'At least one showtime is required'),
  pricing: z.array(pricingSchema).min(1, 'At least one pricing tier is required'),
});

// ============================================================
// GET /events — browse events with filters (public)
// ============================================================
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, date, venueId, search } = req.query;

    let query = `
      SELECT e.*, 
        v.name as venue_name, v.address as venue_address,
        u.name as organiser_name,
        (SELECT json_agg(json_build_object(
          'id', s.id, 'date', s.date, 'time', s.time
        ) ORDER BY s.date, s.time)
        FROM shows s WHERE s.event_id = e.id) as shows,
        (SELECT json_agg(json_build_object(
          'category', ep.category, 'price', ep.price
        ))
        FROM event_pricing ep WHERE ep.event_id = e.id) as pricing
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      JOIN users u ON e.organiser_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (type && (type === 'movie' || type === 'concert')) {
      paramCount++;
      query += ` AND e.type = $${paramCount}`;
      params.push(type);
    }

    if (date) {
      paramCount++;
      query += ` AND EXISTS (SELECT 1 FROM shows s WHERE s.event_id = e.id AND s.date = $${paramCount})`;
      params.push(date);
    }

    if (venueId) {
      paramCount++;
      query += ` AND e.venue_id = $${paramCount}`;
      params.push(venueId);
    }

    if (search && typeof search === 'string') {
      paramCount++;
      query += ` AND (e.title ILIKE $${paramCount} OR e.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ events: result.rows });
  } catch (err) {
    console.error('List events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /events/:id — get event details (public)
// ============================================================
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventResult = await pool.query(`
      SELECT e.*, 
        v.name as venue_name, v.address as venue_address,
        u.name as organiser_name
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      JOIN users u ON e.organiser_id = u.id
      WHERE e.id = $1
    `, [id]);

    if (eventResult.rows.length === 0) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const showsResult = await pool.query(
      'SELECT * FROM shows WHERE event_id = $1 ORDER BY date, time',
      [id]
    );

    const pricingResult = await pool.query(
      'SELECT * FROM event_pricing WHERE event_id = $1 ORDER BY price DESC',
      [id]
    );

    res.json({
      event: eventResult.rows[0],
      shows: showsResult.rows,
      pricing: pricingResult.rows,
    });
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /events — create event with shows and pricing (organiser only)
// ============================================================
router.post('/', authenticate, roleGuard('organiser'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { title, type, venue_id, description, shows, pricing } = parsed.data;

    // Verify venue exists
    const venueCheck = await pool.query('SELECT id FROM venues WHERE id = $1', [venue_id]);
    if (venueCheck.rows.length === 0) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }

    // Verify pricing categories match venue seat categories
    const venueCategories = await pool.query(
      'SELECT DISTINCT category FROM seat_layouts WHERE venue_id = $1',
      [venue_id]
    );
    const venueCategorySet = new Set(venueCategories.rows.map((r: { category: string }) => r.category));
    const pricingCategories = pricing.map(p => p.category);

    for (const cat of pricingCategories) {
      if (!venueCategorySet.has(cat)) {
        res.status(400).json({
          error: `Pricing category "${cat}" does not exist in venue seat layout. Available categories: ${[...venueCategorySet].join(', ')}`,
        });
        return;
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create event
      const eventResult = await client.query(
        `INSERT INTO events (organiser_id, title, type, venue_id, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.user!.id, title, type, venue_id, description || null]
      );
      const event = eventResult.rows[0];

      // Insert pricing
      for (const p of pricing) {
        await client.query(
          `INSERT INTO event_pricing (event_id, category, price)
           VALUES ($1, $2, $3)`,
          [event.id, p.category, p.price]
        );
      }

      // Insert shows and generate show_seats for each
      const createdShows = [];
      for (const show of shows) {
        const showResult = await client.query(
          `INSERT INTO shows (event_id, date, time)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [event.id, show.date, show.time]
        );
        const createdShow = showResult.rows[0];
        createdShows.push(createdShow);

        // Generate show_seats from venue's seat_layouts
        await client.query(`
          INSERT INTO show_seats (show_id, seat_id, category, status)
          SELECT $1, sl.id, sl.category, 'available'
          FROM seat_layouts sl
          WHERE sl.venue_id = $2
        `, [createdShow.id, venue_id]);
      }

      await client.query('COMMIT');

      // Fetch complete pricing
      const pricingResult = await pool.query(
        'SELECT * FROM event_pricing WHERE event_id = $1',
        [event.id]
      );

      res.status(201).json({
        event,
        shows: createdShows,
        pricing: pricingResult.rows,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /organiser/events/:id/summary — booking summary + revenue (organiser only)
// ============================================================
router.get('/organiser/summary/:id', authenticate, roleGuard('organiser'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify the event belongs to this organiser
    const eventResult = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND organiser_id = $2',
      [id, req.user!.id]
    );

    if (eventResult.rows.length === 0) {
      res.status(404).json({ error: 'Event not found or not owned by you' });
      return;
    }

    // Get booking summary per show
    const summary = await pool.query(`
      SELECT 
        s.id as show_id,
        s.date,
        s.time,
        COUNT(CASE WHEN ss.status = 'booked' THEN 1 END) as booked_seats,
        COUNT(CASE WHEN ss.status = 'available' THEN 1 END) as available_seats,
        COUNT(CASE WHEN ss.status = 'held' THEN 1 END) as held_seats,
        COUNT(*) as total_seats
      FROM shows s
      JOIN show_seats ss ON ss.show_id = s.id
      WHERE s.event_id = $1
      GROUP BY s.id, s.date, s.time
      ORDER BY s.date, s.time
    `, [id]);

    // Get revenue per category
    const revenue = await pool.query(`
      SELECT 
        ep.category,
        ep.price,
        COUNT(CASE WHEN ss.status = 'booked' THEN 1 END) as booked_count,
        (ep.price * COUNT(CASE WHEN ss.status = 'booked' THEN 1 END)) as category_revenue
      FROM event_pricing ep
      JOIN show_seats ss ON ss.category = ep.category
      JOIN shows s ON ss.show_id = s.id AND s.event_id = ep.event_id
      WHERE ep.event_id = $1
      GROUP BY ep.category, ep.price
      ORDER BY ep.price DESC
    `, [id]);

    // Total revenue
    const totalRevenue = await pool.query(`
      SELECT COALESCE(SUM(ep.price), 0) as total_revenue
      FROM bookings b
      JOIN shows s ON b.show_id = s.id
      JOIN event_pricing ep ON ep.event_id = s.event_id
      WHERE s.event_id = $1
      AND b.status = 'confirmed'
      AND ep.category = ANY(
        SELECT ss.category FROM show_seats ss WHERE ss.id = ANY(b.seat_ids)
      )
    `, [id]);

    // Waitlist stats
    const waitlistStats = await pool.query(`
      SELECT 
        w.category,
        COUNT(CASE WHEN w.status = 'waiting' THEN 1 END) as waiting_count,
        COUNT(CASE WHEN w.status = 'offered' THEN 1 END) as offered_count,
        COUNT(CASE WHEN w.status = 'converted' THEN 1 END) as converted_count
      FROM waitlist w
      JOIN shows s ON w.show_id = s.id
      WHERE s.event_id = $1
      GROUP BY w.category
    `, [id]);

    res.json({
      event: eventResult.rows[0],
      shows_summary: summary.rows,
      revenue_by_category: revenue.rows,
      total_revenue: totalRevenue.rows[0]?.total_revenue || '0',
      waitlist_stats: waitlistStats.rows,
    });
  } catch (err) {
    console.error('Event summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
