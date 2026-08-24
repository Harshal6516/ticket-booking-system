import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { seatsAPI, bookingsAPI, waitlistAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/Toast';

interface Seat {
  id: string;
  seatId: string;
  category: string;
  status: 'available' | 'held' | 'offered' | 'booked';
  rowLabel: string;
  seatNumber: number;
  price: number;
  holdExpiresAt: string | null;
}

export default function SeatMapPage() {
  const { eventId, showId } = useParams<{ eventId: string; showId: string }>();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatsByRow, setSeatsByRow] = useState<Record<string, Seat[]>>({});
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [myHeldSeats, setMyHeldSeats] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [holdLoading, setHoldLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Fetch seats
  const fetchSeats = useCallback(async () => {
    if (!eventId || !showId) return;
    try {
      const res = await seatsAPI.getForShow(eventId, showId);
      setSeats(res.data.seats);
      setSeatsByRow(res.data.seatsByRow);

      // Identify my held seats
      if (user) {
        const myHolds = new Set<string>();
        let expiryDate: Date | null = null;
        for (const seat of res.data.seats) {
          if (seat.status === 'held' && seat.isMyHold) {
            myHolds.add(seat.id);
            if (seat.holdExpiresAt) {
              expiryDate = new Date(seat.holdExpiresAt);
            }
          }
        }
        setMyHeldSeats(myHolds);
        if (myHolds.size > 0) {
          setHoldExpiresAt(expiryDate);
          setShowBookingForm(true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch seats:', err);
      showToast('error', 'Failed to load seat map');
    } finally {
      setLoading(false);
    }
  }, [eventId, showId, user]);

  useEffect(() => {
    fetchSeats();
  }, [fetchSeats]);

  // Socket.io connection
  useEffect(() => {
    if (!showId) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || window.location.origin;
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });


    newSocket.on('connect', () => {
      newSocket.emit('join:show', showId);
    });

    newSocket.on('seat:updated', (data: { seats: { id: string; status: string; holdExpiresAt?: string }[] }) => {
      setSeats((prev) =>
        prev.map((seat) => {
          const update = data.seats.find((s) => s.id === seat.id);
          if (update) {
            return {
              ...seat,
              status: update.status as Seat['status'],
              holdExpiresAt: (update as any).holdExpiresAt || null,
            };
          }
          return seat;
        })
      );

      // Also update seatsByRow
      setSeatsByRow((prev) => {
        const updated = { ...prev };
        for (const rowLabel of Object.keys(updated)) {
          updated[rowLabel] = updated[rowLabel].map((seat) => {
            const update = data.seats.find((s) => s.id === seat.id);
            if (update) {
              return {
                ...seat,
                status: update.status as Seat['status'],
                holdExpiresAt: (update as any).holdExpiresAt || null,
              };
            }
            return seat;
          });
        }
        return updated;
      });
    });

    newSocket.on('seat:released', (data: { seats: { id: string; status: string }[] }) => {
      setSeats((prev) =>
        prev.map((seat) => {
          const update = data.seats.find((s) => s.id === seat.id);
          if (update) {
            return { ...seat, status: 'available', holdExpiresAt: null };
          }
          return seat;
        })
      );

      setSeatsByRow((prev) => {
        const updated = { ...prev };
        for (const rowLabel of Object.keys(updated)) {
          updated[rowLabel] = updated[rowLabel].map((seat) => {
            const update = data.seats.find((s) => s.id === seat.id);
            if (update) {
              return { ...seat, status: 'available', holdExpiresAt: null };
            }
            return seat;
          });
        }
        return updated;
      });

      // Remove from my holds if they were released
      setMyHeldSeats((prev) => {
        const next = new Set(prev);
        data.seats.forEach((s) => next.delete(s.id));
        return next;
      });
    });
    return () => {
      newSocket.emit('leave:show', showId);
      newSocket.disconnect();
    };
  }, [showId]);

  // Countdown timer for held seats
  useEffect(() => {
    if (!holdExpiresAt) {
      setCountdown('');
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const diff = holdExpiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown('Expired');
        setMyHeldSeats(new Set());
        setHoldExpiresAt(null);
        setShowBookingForm(false);
        clearInterval(interval);
        fetchSeats(); // Refresh after expiry
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt, fetchSeats]);

  const toggleSeat = (seat: Seat) => {
    if (seat.status !== 'available' && !myHeldSeats.has(seat.id)) return;
    if (!isAuthenticated) {
      showToast('error', 'Please log in to select seats');
      navigate('/login');
      return;
    }

    setSelectedSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) {
        next.delete(seat.id);
      } else {
        next.add(seat.id);
      }
      return next;
    });
  };

  const handleHold = async () => {
    if (selectedSeats.size === 0) return;
    setHoldLoading(true);

    try {
      const res = await seatsAPI.hold(showId!, Array.from(selectedSeats));
      showToast('success', res.data.message);
      setMyHeldSeats(new Set(res.data.held));
      setHoldExpiresAt(new Date(res.data.holdExpiresAt));
      setSelectedSeats(new Set());
      setIdempotencyKey(crypto.randomUUID());
      setShowBookingForm(true);
      fetchSeats(); // Refresh to see held state
    } catch (err: any) {
      if (!err.response) {
        showToast('error', 'Network error. Please check your connection.');
      } else if (err.response.status === 409) {
        showToast('error', 'Hold failed! One or more selected seats were just taken. Please select different seats.');
      } else {
        showToast('error', err.response?.data?.error || 'Failed to hold seats');
      }
    } finally {
      setHoldLoading(false);
    }
  };

  const handleBooking = async () => {
    if (myHeldSeats.size === 0) return;
    if (!customerName || !customerEmail) {
      showToast('error', 'Please fill in customer details');
      return;
    }

    setBookingLoading(true);
    try {
      await bookingsAPI.create({
        showId: showId!,
        seatIds: Array.from(myHeldSeats),
        customerName,
        customerEmail,
        idempotencyKey,
      });
      showToast('success', 'Booking confirmed! Check your email for the QR ticket.');
      setMyHeldSeats(new Set());
      setHoldExpiresAt(null);
      setShowBookingForm(false);
      navigate('/bookings');
    } catch (err: any) {
      if (!err.response) {
        showToast('error', 'Network error. Please try clicking confirm again.');
      } else {
        showToast('error', err.response?.data?.error || 'Booking failed');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleJoinWaitlist = async (category: string) => {
    if (!isAuthenticated) {
      showToast('error', 'Please log in first');
      navigate('/login');
      return;
    }
    try {
      const res = await waitlistAPI.join({ showId: showId!, category });
      showToast('success', res.data.message);
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to join waitlist');
    }
  };

  const getSeatClass = (seat: Seat) => {
    if (selectedSeats.has(seat.id)) return 'seat seat-selected';
    if (myHeldSeats.has(seat.id)) return 'seat seat-my-hold';
    switch (seat.status) {
      case 'available': return 'seat seat-available';
      case 'held': return 'seat seat-held';
      case 'booked': return 'seat seat-booked';
      case 'offered': return 'seat seat-offered';
      default: return 'seat';
    }
  };

  // Get selected seats total price
  const selectedTotal = seats
    .filter((s) => selectedSeats.has(s.id))
    .reduce((sum, s) => sum + s.price, 0);

  // Get held seats total price
  const heldTotal = seats
    .filter((s) => myHeldSeats.has(s.id))
    .reduce((sum, s) => sum + s.price, 0);

  // Get categories and their availability
  const categories = Array.from(new Set(seats.map((s) => s.category)));
  const categoryStats = categories.map((cat) => {
    const catSeats = seats.filter((s) => s.category === cat);
    const available = catSeats.filter((s) => s.status === 'available').length;
    const total = catSeats.length;
    const price = catSeats[0]?.price || 0;
    return { category: cat, available, total, price };
  });

  const rows = Object.keys(seatsByRow).sort();

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <div className="text-4xl animate-spin inline-block">⏳</div>
        <p className="text-text-muted mt-4">Loading seat map...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate(`/events/${eventId}`)}
        className="text-text-muted hover:text-text text-sm mb-6 flex items-center gap-2 bg-transparent border-none cursor-pointer"
      >
        ← Back to Event
      </button>

      <div className="flex gap-8 flex-col lg:flex-row">
        {/* Seat Map */}
        <div className="flex-1">
          <div className="glass-card p-8 animate-fade-in">
            <h2 className="text-xl font-bold mb-6 text-center">Select Your Seats</h2>

            {/* Screen */}
            <div className="screen mb-10" />

            {/* Seats Grid */}
            <div className="flex flex-col gap-2 items-center">
              {rows.map((rowLabel) => (
                <div key={rowLabel} className="flex items-center gap-2">
                  <span className="w-8 text-right text-xs text-text-muted font-mono">
                    {rowLabel}
                  </span>
                  <div className="flex gap-1.5">
                    {seatsByRow[rowLabel].map((seat) => (
                      <div
                        key={seat.id}
                        className={getSeatClass(seat)}
                        onClick={() => toggleSeat(seat)}
                        title={`${seat.rowLabel}${seat.seatNumber} — ${seat.category} — ₹${seat.price} — ${seat.status}`}
                      >
                        {seat.seatNumber}
                      </div>
                    ))}
                  </div>
                  <span className="w-8 text-xs text-text-muted font-mono">{rowLabel}</span>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 justify-center mt-8 text-xs">
              <div className="flex items-center gap-2">
                <div className="seat seat-available" style={{ width: 20, height: 20, fontSize: '0.5rem' }} />
                <span className="text-text-muted">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="seat seat-selected" style={{ width: 20, height: 20, fontSize: '0.5rem' }} />
                <span className="text-text-muted">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="seat seat-held" style={{ width: 20, height: 20, fontSize: '0.5rem' }} />
                <span className="text-text-muted">Held</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="seat seat-booked" style={{ width: 20, height: 20, fontSize: '0.5rem' }} />
                <span className="text-text-muted">Booked</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 flex flex-col gap-6">
          {/* Category Info */}
          <div className="glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-4">
              Seat Categories
            </h3>
            {categoryStats.map((cat) => (
              <div key={cat.category} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div>
                  <div className="font-medium capitalize">{cat.category}</div>
                  <div className="text-xs text-text-muted">
                    {cat.available}/{cat.total} available
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-primary">₹{cat.price}</div>
                  {cat.available === 0 && (
                    <button
                      onClick={() => handleJoinWaitlist(cat.category)}
                      className="text-xs text-accent hover:underline bg-transparent border-none cursor-pointer mt-1"
                    >
                      Join Waitlist
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Hold countdown */}
          {holdExpiresAt && countdown && (
            <div className="glass-card p-6 animate-scale-in">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-3">
                ⏱ Hold Timer
              </h3>
              <div
                className={`countdown text-2xl justify-center ${
                  countdown && parseInt(countdown.split(':')[0]) < 2 ? 'countdown-urgent' : ''
                }`}
              >
                {countdown}
              </div>
              <p className="text-xs text-text-muted text-center mt-2">
                Complete your booking before time runs out
              </p>
            </div>
          )}

          {/* Selection Summary / Hold Button */}
          {selectedSeats.size > 0 && !showBookingForm && (
            <div className="glass-card p-6 animate-scale-in">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-4">
                Selected Seats
              </h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {seats
                  .filter((s) => selectedSeats.has(s.id))
                  .map((s) => (
                    <span key={s.id} className="badge badge-movie">
                      {s.rowLabel}{s.seatNumber} — ₹{s.price}
                    </span>
                  ))}
              </div>
              <div className="flex justify-between items-center mb-4 pt-3 border-t border-border">
                <span className="text-text-muted">Total</span>
                <span className="text-xl font-bold text-primary">₹{selectedTotal.toFixed(0)}</span>
              </div>
              <button
                onClick={handleHold}
                disabled={holdLoading}
                className="btn-primary w-full"
              >
                {holdLoading ? '⏳ Holding...' : `Hold ${selectedSeats.size} Seat(s)`}
              </button>
            </div>
          )}

          {/* Booking Form */}
          {showBookingForm && myHeldSeats.size > 0 && (
            <div className="glass-card p-6 animate-scale-in">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-4">
                Complete Booking
              </h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {seats
                  .filter((s) => myHeldSeats.has(s.id))
                  .map((s) => (
                    <span key={s.id} className="badge badge-confirmed">
                      {s.rowLabel}{s.seatNumber}
                    </span>
                  ))}
              </div>

              <div className="flex flex-col gap-4 mb-4">
                <div>
                  <label className="form-label" htmlFor="customer-name">Name for Ticket</label>
                  <input
                    id="customer-name"
                    type="text"
                    className="form-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="customer-email">Email for Ticket</label>
                  <input
                    id="customer-email"
                    type="email"
                    className="form-input"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center mb-4 pt-3 border-t border-border">
                <span className="text-text-muted">Total</span>
                <span className="text-xl font-bold text-primary">₹{heldTotal.toFixed(0)}</span>
              </div>

              <button
                onClick={handleBooking}
                disabled={bookingLoading}
                className="btn-primary w-full"
              >
                {bookingLoading ? '⏳ Confirming...' : '🎫 Confirm Booking'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
