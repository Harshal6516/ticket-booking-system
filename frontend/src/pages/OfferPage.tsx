import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { offersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/Toast';

interface Offer {
  id: string;
  showId: string;
  category: string;
  status: string;
  offerExpiresAt: string;
  showDate: string;
  showTime: string;
  eventTitle: string;
  eventType: string;
  venueName: string;
  price: number | null;
  seat: { id: string; row_label: string; seat_number: number; category: string } | null;
}

export default function OfferPage() {
  const { token } = useParams<{ token: string }>();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');

  useEffect(() => {
    if (!token) return;
    const fetchOffer = async () => {
      try {
        const res = await offersAPI.get(token);
        setOffer(res.data.offer);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load offer');
      } finally {
        setLoading(false);
      }
    };
    fetchOffer();
  }, [token]);

  // Countdown
  useEffect(() => {
    if (!offer?.offerExpiresAt) return;
    const expires = new Date(offer.offerExpiresAt);

    const interval = setInterval(() => {
      const diff = expires.getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('Expired');
        clearInterval(interval);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [offer]);

  const handleAccept = async () => {
    if (!isAuthenticated) {
      showToast('error', 'Please log in to accept this offer');
      navigate('/login');
      return;
    }

    setAccepting(true);
    try {
      await offersAPI.accept(token!, { customerName, customerEmail });
      showToast('success', 'Offer accepted! Booking confirmed.');
      navigate('/bookings');
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to accept offer');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <div className="text-4xl animate-spin inline-block">⏳</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <div className="glass-card p-12">
          <div className="text-5xl mb-4">😔</div>
          <h2 className="text-xl font-bold mb-2">Offer Unavailable</h2>
          <p className="text-text-muted">{error}</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-6">
            Browse Events
          </button>
        </div>
      </div>
    );
  }

  if (!offer) return null;

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <div className="glass-card overflow-hidden animate-scale-in">
        <div className="bg-gradient-to-r from-accent/30 to-primary/30 p-8 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold">A Seat is Available!</h1>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-bold mb-4">
            {offer.eventType === 'movie' ? '🎬' : '🎵'} {offer.eventTitle}
          </h2>

          <div className="bg-surface-lighter rounded-xl p-4 mb-6 flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Venue</span>
              <span>{offer.venueName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Date</span>
              <span>{new Date(offer.showDate).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Time</span>
              <span>{offer.showTime}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Category</span>
              <span className="capitalize">{offer.category}</span>
            </div>
            {offer.seat && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Seat</span>
                <span>{offer.seat.row_label}{offer.seat.seat_number}</span>
              </div>
            )}
            {offer.price && (
              <div className="flex justify-between text-sm border-t border-border pt-2 mt-1">
                <span className="text-text-muted">Price</span>
                <span className="font-bold text-primary text-lg">₹{offer.price}</span>
              </div>
            )}
          </div>

          {/* Countdown */}
          <div className="text-center mb-6">
            <div className={`countdown text-xl inline-flex ${countdown === 'Expired' || (countdown && parseInt(countdown.split(':')[0]) < 5) ? 'countdown-urgent' : ''}`}>
              ⏰ {countdown || 'Loading...'}
            </div>
            <p className="text-xs text-text-muted mt-2">Time remaining to accept</p>
          </div>

          {/* Customer Details */}
          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label className="form-label" htmlFor="offer-name">Name for Ticket</label>
              <input
                id="offer-name"
                type="text"
                className="form-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="offer-email">Email for Ticket</label>
              <input
                id="offer-email"
                type="email"
                className="form-input"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleAccept}
            disabled={accepting || countdown === 'Expired'}
            className="btn-primary w-full text-lg"
          >
            {accepting ? '⏳ Accepting...' : '🎫 Accept Offer & Book'}
          </button>
        </div>
      </div>
    </div>
  );
}
