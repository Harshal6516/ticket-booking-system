import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventsAPI } from '../services/api';

interface Show {
  id: string;
  date: string;
  time: string;
}

interface Pricing {
  category: string;
  price: string;
}

interface EventDetail {
  id: string;
  title: string;
  type: 'movie' | 'concert';
  description: string | null;
  venue_name: string;
  venue_address: string;
  organiser_name: string;
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [pricing, setPricing] = useState<Pricing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchEvent = async () => {
      try {
        const res = await eventsAPI.get(id);
        setEvent(res.data.event);
        setShows(res.data.shows);
        setPricing(res.data.pricing);
      } catch (err) {
        console.error('Failed to fetch event:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="text-4xl animate-spin inline-block">⏳</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-xl font-bold">Event not found</h2>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
      {/* Header */}
      <button
        onClick={() => navigate('/')}
        className="text-text-muted hover:text-text text-sm mb-6 flex items-center gap-2 bg-transparent border-none cursor-pointer"
      >
        ← Back to Events
      </button>

      <div className="glass-card overflow-hidden mb-8">
        <div
          className={`h-48 flex items-center justify-center text-8xl ${
            event.type === 'movie'
              ? 'bg-gradient-to-br from-primary/30 to-secondary/30'
              : 'bg-gradient-to-br from-accent/30 to-danger/30'
          }`}
        >
          {event.type === 'movie' ? '🎬' : '🎵'}
        </div>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className={`badge ${event.type === 'movie' ? 'badge-movie' : 'badge-concert'}`}>
              {event.type}
            </span>
            <span className="text-text-muted text-sm">by {event.organiser_name}</span>
          </div>

          <h1 className="text-3xl font-bold mb-4">{event.title}</h1>

          {event.description && (
            <p className="text-text-muted mb-6">{event.description}</p>
          )}

          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">📍</span>
              <div>
                <div className="font-medium">{event.venue_name}</div>
                <div className="text-text-muted">{event.venue_address}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="glass-card p-8 mb-8">
        <h2 className="text-xl font-bold mb-4">💰 Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pricing.map((p) => (
            <div
              key={p.category}
              className="p-4 rounded-xl bg-surface-lighter border border-border"
            >
              <div className="text-text-muted text-sm uppercase tracking-wider mb-1">
                {p.category}
              </div>
              <div className="text-2xl font-bold text-primary">
                ₹{parseFloat(p.price).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Showtimes */}
      <div className="glass-card p-8">
        <h2 className="text-xl font-bold mb-6">🎟️ Select a Showtime</h2>

        {shows.length === 0 ? (
          <p className="text-text-muted">No showtimes available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shows.map((show) => (
              <button
                key={show.id}
                onClick={() => navigate(`/events/${id}/shows/${show.id}/seats`)}
                className="p-5 rounded-xl bg-surface-lighter border border-border hover:border-primary transition-all text-left cursor-pointer group"
              >
                <div className="text-lg font-bold mb-1 group-hover:text-primary transition-colors">
                  {new Date(show.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <div className="text-text-muted flex items-center gap-2">
                  <span>🕐</span>
                  <span>{show.time}</span>
                </div>
                <div className="mt-3 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Select seats →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
