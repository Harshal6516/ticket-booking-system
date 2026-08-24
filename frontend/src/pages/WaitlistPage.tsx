import { useState, useEffect, useCallback } from 'react';
import { waitlistAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface WaitlistEntry {
  id: string;
  show_id: string;
  category: string;
  position: number;
  status: 'waiting' | 'offered' | 'expired' | 'converted';
  offer_expires_at: string | null;
  offer_token: string | null;
  show_date: string;
  show_time: string;
  event_title: string;
  event_type: string;
  venue_name: string;
  price: string | null;
  created_at: string;
}

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const fetchEntries = useCallback(async () => {
    try {
      const res = await waitlistAPI.mine();
      setEntries(res.data.waitlistEntries);
    } catch (err) {
      console.error('Failed to fetch waitlist:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchEntries();
  }, [isAuthenticated, navigate, fetchEntries]);


  const statusBadge = (status: string) => {
    switch (status) {
      case 'waiting': return 'badge-waiting';
      case 'offered': return 'badge-offered';
      case 'expired': return 'badge-cancelled';
      case 'converted': return 'badge-confirmed';
      default: return '';
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
      <h1 className="text-3xl font-bold mb-8 animate-fade-in">My Waitlist</h1>

      {entries.length === 0 ? (
        <div className="glass-card p-12 text-center animate-fade-in">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold mb-2">Not on any waitlists</h2>
          <p className="text-text-muted">When an event category is sold out, you can join the waitlist.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="glass-card p-6 animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`badge ${statusBadge(entry.status)}`}>
                    {entry.status}
                  </span>
                  <span className="text-sm text-text-muted">Position #{entry.position}</span>
                </div>
                {entry.status === 'offered' && entry.offer_token && (
                  <button
                    onClick={() => navigate(`/offers/${entry.offer_token}`)}
                    className="btn-primary text-sm !py-2 !px-4"
                  >
                    View Offer →
                  </button>
                )}
              </div>

              <h3 className="text-lg font-bold mb-2">
                {entry.event_type === 'movie' ? '🎬' : '🎵'} {entry.event_title}
              </h3>

              <div className="flex flex-wrap gap-4 text-sm text-text-muted">
                <span>📍 {entry.venue_name}</span>
                <span>📅 {new Date(entry.show_date).toLocaleDateString()}</span>
                <span>🕐 {entry.show_time}</span>
                <span className="capitalize">🏷️ {entry.category}</span>
                {entry.price && <span>💰 ₹{parseFloat(entry.price).toFixed(0)}</span>}
              </div>

              {entry.status === 'offered' && entry.offer_expires_at && (
                <div className="mt-3 text-sm text-accent">
                  ⏰ Offer expires: {new Date(entry.offer_expires_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
