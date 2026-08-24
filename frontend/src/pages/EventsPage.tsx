import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { eventsAPI } from '../services/api';

interface EventItem {
  id: string;
  title: string;
  type: 'movie' | 'concert';
  venue_name: string;
  venue_address: string;
  organiser_name: string;
  description: string | null;
  shows: { id: string; date: string; time: string }[] | null;
  pricing: { category: string; price: string }[] | null;
  created_at: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (typeFilter) params.type = typeFilter;
      if (dateFilter) params.date = dateFilter;
      if (searchQuery) params.search = searchQuery;
      const res = await eventsAPI.list(params);
      setEvents(res.data.events);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFilter, searchQuery]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);


  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents();
  };

  const getMinPrice = (pricing: { category: string; price: string }[] | null) => {
    if (!pricing || pricing.length === 0) return null;
    return Math.min(...pricing.map((p) => parseFloat(p.price)));
  };

  const getNextShow = (shows: { id: string; date: string; time: string }[] | null) => {
    if (!shows || shows.length === 0) return null;
    const now = new Date();
    return shows.find((s) => new Date(`${s.date}T${s.time}`) >= now) || shows[0];
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Hero Section */}
      <div className="text-center mb-12 animate-fade-in">
        <h1 className="text-4xl font-bold mb-4">
          Discover{' '}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Amazing Events
          </span>
        </h1>
        <p className="text-text-muted text-lg max-w-2xl mx-auto">
          Browse movies and concerts, pick your perfect seats, and book instantly with real-time availability.
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card p-6 mb-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="form-label" htmlFor="search">Search</label>
            <input
              id="search"
              type="text"
              className="form-input"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="min-w-[150px]">
            <label className="form-label" htmlFor="type-filter">Type</label>
            <select
              id="type-filter"
              className="form-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="movie">🎬 Movies</option>
              <option value="concert">🎵 Concerts</option>
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="form-label" htmlFor="date-filter">Date</label>
            <input
              id="date-filter"
              type="date"
              className="form-input"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary !py-3">
            🔍 Search
          </button>
        </form>
      </div>

      {/* Event Grid */}
      {loading ? (
        <div className="text-center py-20">
          <div className="text-4xl animate-spin inline-block">⏳</div>
          <p className="text-text-muted mt-4">Loading events...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 glass-card">
          <div className="text-5xl mb-4">🎭</div>
          <h2 className="text-xl font-bold mb-2">No events found</h2>
          <p className="text-text-muted">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event, i) => {
            const minPrice = getMinPrice(event.pricing);
            const nextShow = getNextShow(event.shows);
            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="glass-card overflow-hidden no-underline text-text group animate-fade-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {/* Gradient header */}
                <div
                  className={`h-40 flex items-center justify-center text-6xl ${
                    event.type === 'movie'
                      ? 'bg-gradient-to-br from-primary/30 to-secondary/30'
                      : 'bg-gradient-to-br from-accent/30 to-danger/30'
                  }`}
                >
                  {event.type === 'movie' ? '🎬' : '🎵'}
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`badge ${event.type === 'movie' ? 'badge-movie' : 'badge-concert'}`}>
                      {event.type}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                    {event.title}
                  </h3>

                  <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
                    <span>📍</span>
                    <span>{event.venue_name}</span>
                  </div>

                  {nextShow && (
                    <div className="flex items-center gap-2 text-sm text-text-muted mb-3">
                      <span>📅</span>
                      <span>
                        {new Date(nextShow.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        at {nextShow.time}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    {minPrice !== null && (
                      <span className="text-lg font-bold text-primary">
                        From ₹{minPrice.toFixed(0)}
                      </span>
                    )}
                    <span className="text-sm text-text-muted group-hover:text-primary transition-colors">
                      View Details →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
