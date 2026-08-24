import pool from '../db/pool';
import { getIO } from '../socket';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { sendWaitlistOfferEmail } from '../services/emailService';

/**
 * Sweep job that runs every SWEEP_INTERVAL_MS milliseconds.
 * Two responsibilities:
 * 1. Release expired holds → status back to 'available'
 * 2. Expire waitlist offers past their deadline → cascade to next in queue
 */
export async function runSweep(): Promise<void> {
  try {
    // ============================================================
    // 1. Release expired holds
    // ============================================================
    const releasedSeats = await pool.query(`
      UPDATE show_seats
      SET status = 'available',
          held_by_user_id = NULL,
          hold_expires_at = NULL
      WHERE status = 'held' AND hold_expires_at < NOW()
      RETURNING id, show_id, category
    `);

    if (releasedSeats.rows.length > 0) {
      console.log(`[Sweep] Released ${releasedSeats.rows.length} expired holds`);

      // Group by show_id and emit socket events
      const byShow: Record<string, any[]> = {};
      for (const seat of releasedSeats.rows) {
        if (!byShow[seat.show_id]) byShow[seat.show_id] = [];
        byShow[seat.show_id].push(seat);
      }

      try {
        const io = getIO();
        for (const [showId, seats] of Object.entries(byShow)) {
          io.to(`show:${showId}`).emit('seat:released', {
            seats: seats.map(s => ({ id: s.id, status: 'available' })),
          });

          // Check if any waitlisted users should get these seats
          for (const seat of seats) {
            await offerSeatToWaitlist(seat.show_id, seat.category, seat.id);
          }
        }
      } catch (socketErr) {
        console.error('[Sweep] Socket emit error:', socketErr);
      }
    }

    // ============================================================
    // 2. Expire waitlist offers past their deadline
    // ============================================================
    const expiredOffers = await pool.query(`
      UPDATE waitlist
      SET status = 'expired'
      WHERE status = 'offered' AND offer_expires_at < NOW()
      RETURNING id, show_id, category, user_id
    `);

    if (expiredOffers.rows.length > 0) {
      console.log(`[Sweep] Expired ${expiredOffers.rows.length} waitlist offers`);

      // Release the offered seats back to available
      for (const offer of expiredOffers.rows) {
        const releasedResult = await pool.query(`
          UPDATE show_seats
          SET status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
          WHERE show_id = $1 AND category = $2 AND status = 'offered' AND held_by_user_id = $3
          RETURNING id
        `, [offer.show_id, offer.category, offer.user_id]);

        if (releasedResult.rows.length > 0) {
          try {
            const io = getIO();
            io.to(`show:${offer.show_id}`).emit('seat:released', {
              seats: releasedResult.rows.map(s => ({ id: s.id, status: 'available' })),
            });
          } catch (socketErr) {
            console.error('[Sweep] Socket emit error:', socketErr);
          }

          // Cascade: offer the seat to the next person in queue
          for (const seat of releasedResult.rows) {
            await offerSeatToWaitlist(offer.show_id, offer.category, seat.id);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Sweep] Error during sweep:', err);
  }
}

/**
 * Offers a specific seat to the next person waiting in the waitlist queue
 * for the given show + category.
 */
export async function offerSeatToWaitlist(
  showId: string,
  category: string,
  seatId: string
): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find the next person waiting
    const nextInQueue = await client.query(`
      SELECT id, user_id
      FROM waitlist
      WHERE show_id = $1 AND category = $2 AND status = 'waiting'
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `, [showId, category]);

    if (nextInQueue.rows.length === 0) {
      await client.query('COMMIT');
      return false;
    }

    const waitlistEntry = nextInQueue.rows[0];
    const offerToken = uuidv4();
    const offerExpiresAt = new Date(Date.now() + env.OFFER_TTL_MINUTES * 60 * 1000);

    // Mark the waitlist entry as offered
    await client.query(`
      UPDATE waitlist
      SET status = 'offered',
          offer_token = $1,
          offer_expires_at = $2
      WHERE id = $3
    `, [offerToken, offerExpiresAt.toISOString(), waitlistEntry.id]);

    // Mark the seat as offered to this user
    const seatResult = await client.query(`
      UPDATE show_seats
      SET status = 'offered',
          held_by_user_id = $1,
          hold_expires_at = $2
      WHERE id = $3 AND status = 'available'
      RETURNING id
    `, [waitlistEntry.user_id, offerExpiresAt.toISOString(), seatId]);

    if (seatResult.rows.length === 0) {
      // Seat was taken in the meantime — revert waitlist status
      await client.query(`
        UPDATE waitlist
        SET status = 'waiting', offer_token = NULL, offer_expires_at = NULL
        WHERE id = $1
      `, [waitlistEntry.id]);
      await client.query('COMMIT');
      return false;
    }

    await client.query('COMMIT');

    // Emit socket event
    try {
      const io = getIO();
      io.to(`show:${showId}`).emit('seat:offered', {
        seatId,
        status: 'offered',
      });
    } catch (socketErr) {
      console.error('[Waitlist] Socket emit error:', socketErr);
    }

    console.log(`[Waitlist] Seat ${seatId} offered to user ${waitlistEntry.user_id}, token: ${offerToken}`);

    // Fetch user and show/event/venue details to send waitlist offer email
    try {
      const userRes = await pool.query(
        'SELECT name, email FROM users WHERE id = $1',
        [waitlistEntry.user_id]
      );
      const showRes = await pool.query(`
        SELECT s.date, s.time, e.title as event_title, v.name as venue_name
        FROM shows s
        JOIN events e ON s.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        WHERE s.id = $1
      `, [showId]);

      if (userRes.rows.length > 0 && showRes.rows.length > 0) {
        const user = userRes.rows[0];
        const show = showRes.rows[0];

        sendWaitlistOfferEmail({
          to: user.email,
          customerName: user.name,
          eventTitle: show.event_title,
          showDate: show.date,
          showTime: show.time,
          venueName: show.venue_name,
          category,
          offerToken,
          expiresAt: offerExpiresAt,
        }).catch((emailErr) => console.error('[Waitlist] Offer email failed:', emailErr));
      }
    } catch (fetchErr) {
      console.error('[Waitlist] Failed to fetch details for offer email:', fetchErr);
    }

    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Waitlist] Error offering seat:', err);
    return false;
  } finally {
    client.release();
  }
}


/**
 * Start the sweep job on a timer
 */
export function startSweepJob(): void {
  console.log(`[Sweep] Starting sweep job (interval: ${env.SWEEP_INTERVAL_MS}ms)`);
  setInterval(runSweep, env.SWEEP_INTERVAL_MS);
}
