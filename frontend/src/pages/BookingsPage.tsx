import { useState, useEffect } from 'react';
import { bookingsAPI } from '../services/api';
import { showToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Booking {
  id: string;
  booking_ref: string;
  status: 'confirmed' | 'cancelled';
  customer_name: string;
  customer_email: string;
  qr_code_url: string | null;
  show_date: string;
  show_time: string;
  event_title: string;
  event_type: string;
  venue_name: string;
  venue_address: string;
  created_at: string;
  seats: { row_label: string; seat_number: number; category: string; price: string }[];
  totalPrice: number;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchBookings();
  }, [isAuthenticated]);

  const fetchBookings = async () => {
    try {
      const res = await bookingsAPI.mine();
      setBookings(res.data.bookings);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    setCancellingId(id);
    try {
      await bookingsAPI.cancel(id);
      showToast('success', 'Booking cancelled successfully');
      fetchBookings();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="text-4xl animate-spin inline-block">⏳</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8 animate-fade-in">My Bookings</h1>

      {bookings.length === 0 ? (
        <div className="glass-card p-12 text-center animate-fade-in">
          <div className="text-5xl mb-4">🎟️</div>
          <h2 className="text-xl font-bold mb-2">No bookings yet</h2>
          <p className="text-text-muted mb-6">Browse events and book your first ticket!</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Browse Events
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {bookings.map((booking, i) => (
            <div
              key={booking.id}
              className="glass-card overflow-hidden animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex flex-col md:flex-row">
                {/* QR Code */}
                {booking.qr_code_url && booking.status === 'confirmed' && (
                  <div className="w-full md:w-48 p-6 flex items-center justify-center bg-white/5">
                    <img
                      src={booking.qr_code_url}
                      alt="QR Code"
                      className="w-32 h-32 rounded-lg"
                    />
                  </div>
                )}

                {/* Details */}
                <div className="flex-1 p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`badge ${booking.status === 'confirmed' ? 'badge-confirmed' : 'badge-cancelled'}`}>
                        {booking.status}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        {booking.booking_ref}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted">
                      {new Date(booking.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold mb-2">
                    {booking.event_type === 'movie' ? '🎬' : '🎵'} {booking.event_title}
                  </h3>

                  <div className="flex flex-wrap gap-4 text-sm text-text-muted mb-3">
                    <span>📍 {booking.venue_name}</span>
                    <span>📅 {new Date(booking.show_date).toLocaleDateString()}</span>
                    <span>🕐 {booking.show_time}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {booking.seats.map((seat, j) => (
                      <span key={j} className="badge badge-movie">
                        {seat.row_label}{seat.seat_number} ({seat.category})
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="text-sm text-text-muted">
                      <span className="mr-2">👤 {booking.customer_name}</span>
                      <span>✉️ {booking.customer_email}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-primary">
                        ₹{booking.totalPrice?.toFixed(0)}
                      </span>
                      {booking.status === 'confirmed' && (
                        <button
                          onClick={() => handleCancel(booking.id)}
                          disabled={cancellingId === booking.id}
                          className="btn-danger text-sm !py-2 !px-4"
                        >
                          {cancellingId === booking.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
