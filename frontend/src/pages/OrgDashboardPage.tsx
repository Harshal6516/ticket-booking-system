import { useState, useEffect, useCallback } from 'react';
import { eventsAPI, venuesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../components/Toast';

interface Venue {
  id: string;
  name: string;
  address: string;
  total_seats?: string | number;
}

export default function OrgDashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create event form
  const [title, setTitle] = useState('');
  const [type, setType] = useState('movie');
  const [venueId, setVenueId] = useState('');
  const [description, setDescription] = useState('');
  const [showDate, setShowDate] = useState('');
  const [showTime, setShowTime] = useState('');
  const [premiumPrice, setPremiumPrice] = useState('500');
  const [standardPrice, setStandardPrice] = useState('200');
  const [creating, setCreating] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await eventsAPI.list();
      // Filter to only this organiser's events
      const myEvents = res.data.events.filter((e: any) => e.organiser_id === user?.id);
      setEvents(myEvents);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchVenues = useCallback(async () => {
    try {
      const res = await venuesAPI.list();
      setVenues(res.data.venues || []);
      if (res.data.venues?.length > 0 && !venueId) {
        setVenueId(res.data.venues[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    }
  }, [venueId]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'organiser') {
      navigate('/');
      return;
    }
    fetchEvents();
    fetchVenues();
  }, [isAuthenticated, user, navigate, fetchEvents, fetchVenues]);

  const fetchSummary = async (eventId: string) => {
    setSummaryLoading(true);
    setSelectedEvent(eventId);
    try {
      const res = await eventsAPI.summary(eventId);
      setSummary(res.data);
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to fetch summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueId) {
      showToast('error', 'Please select a venue');
      return;
    }
    setCreating(true);
    try {
      await eventsAPI.create({
        title,
        type,
        venue_id: venueId,
        description: description || undefined,
        shows: [{ date: showDate, time: showTime }],
        pricing: [
          { category: 'Premium', price: parseFloat(premiumPrice) },
          { category: 'Standard', price: parseFloat(standardPrice) },
        ],
      });
      showToast('success', 'Event created successfully');
      setShowCreateForm(false);
      setTitle('');
      setDescription('');
      setShowDate('');
      setShowTime('');
      fetchEvents();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="text-4xl animate-spin inline-block">⏳</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold animate-fade-in">Organiser Dashboard</h1>
        <button onClick={() => setShowCreateForm(!showCreateForm)} className="btn-primary">
          {showCreateForm ? 'Close Form' : '+ New Event'}
        </button>
      </div>

      {/* Create Event Form */}
      {showCreateForm && (
        <div className="glass-card p-8 mb-8 animate-scale-in">
          <h2 className="text-xl font-bold mb-6">Create New Event</h2>
          <form onSubmit={handleCreateEvent} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="form-label" htmlFor="event-title">Title</label>
                <input id="event-title" type="text" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <label className="form-label" htmlFor="event-type">Type</label>
                <select id="event-type" className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="movie">🎬 Movie</option>
                  <option value="concert">🎵 Concert</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="event-venue">Venue</label>
                {venues.length > 0 ? (
                  <select
                    id="event-venue"
                    className="form-select"
                    value={venueId}
                    onChange={(e) => setVenueId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select a venue...</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.address})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="event-venue"
                    type="text"
                    className="form-input"
                    value={venueId}
                    onChange={(e) => setVenueId(e.target.value)}
                    placeholder="Enter or paste venue UUID"
                    required
                  />
                )}
              </div>
              <div>
                <label className="form-label" htmlFor="event-description">Description</label>
                <input id="event-description" type="text" className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="event-date">Show Date</label>
                <input id="event-date" type="date" className="form-input" value={showDate} onChange={(e) => setShowDate(e.target.value)} required />
              </div>
              <div>
                <label className="form-label" htmlFor="event-time">Show Time</label>
                <input id="event-time" type="time" className="form-input" value={showTime} onChange={(e) => setShowTime(e.target.value)} required />
              </div>
              <div>
                <label className="form-label" htmlFor="premium-price">Premium Price (₹)</label>
                <input id="premium-price" type="number" className="form-input" value={premiumPrice} onChange={(e) => setPremiumPrice(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="standard-price">Standard Price (₹)</label>
                <input id="standard-price" type="number" className="form-input" value={standardPrice} onChange={(e) => setStandardPrice(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? '⏳ Creating...' : 'Create Event'}
              </button>
              <button type="button" onClick={() => setShowCreateForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Events List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Event list */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-text-muted">Your Events</h2>
          {events.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-text-muted">No events created yet.</p>
            </div>
          ) : (
            events.map((event, i) => (
              <button
                key={event.id}
                onClick={() => fetchSummary(event.id)}
                className={`glass-card p-5 text-left cursor-pointer animate-fade-in ${
                  selectedEvent === event.id ? '!border-primary' : ''
                }`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span>{event.type === 'movie' ? '🎬' : '🎵'}</span>
                  <h3 className="font-bold">{event.title}</h3>
                </div>
                <div className="text-sm text-text-muted">📍 {event.venue_name}</div>
              </button>
            ))
          )}
        </div>

        {/* Right: Summary */}
        <div>
          {summaryLoading ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl animate-spin inline-block">⏳</div>
            </div>
          ) : summary ? (
            <div className="flex flex-col gap-6 animate-fade-in">
              <div className="glass-card p-6">
                <h2 className="text-lg font-bold mb-4">📊 Revenue</h2>
                <div className="text-4xl font-bold text-primary mb-4">
                  ₹{parseFloat(summary.total_revenue).toLocaleString()}
                </div>
                <div className="flex flex-col gap-2">
                  {summary.revenue_by_category?.map((cat: any) => (
                    <div key={cat.category} className="flex justify-between text-sm">
                      <span className="capitalize text-text-muted">{cat.category} (₹{parseFloat(cat.price).toFixed(0)})</span>
                      <span>{cat.booked_count} booked — ₹{parseFloat(cat.category_revenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-6">
                <h2 className="text-lg font-bold mb-4">🎟️ Shows</h2>
                {summary.shows_summary?.map((show: any) => (
                  <div key={show.show_id} className="mb-4 p-4 bg-surface-lighter rounded-xl">
                    <div className="font-medium mb-2">
                      {new Date(show.date).toLocaleDateString()} at {show.time}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="text-center p-2 rounded-lg bg-success/10">
                        <div className="text-success font-bold">{show.booked_seats}</div>
                        <div className="text-xs text-text-muted">Booked</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-warning/10">
                        <div className="text-warning font-bold">{show.held_seats}</div>
                        <div className="text-xs text-text-muted">Held</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-primary/10">
                        <div className="text-primary font-bold">{show.available_seats}</div>
                        <div className="text-xs text-text-muted">Available</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {summary.waitlist_stats?.length > 0 && (
                <div className="glass-card p-6">
                  <h2 className="text-lg font-bold mb-4">📋 Waitlist</h2>
                  {summary.waitlist_stats.map((ws: any) => (
                    <div key={ws.category} className="flex justify-between text-sm py-2 border-b border-border last:border-0">
                      <span className="capitalize">{ws.category}</span>
                      <span className="text-text-muted">
                        {ws.waiting_count} waiting · {ws.offered_count} offered · {ws.converted_count} converted
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <div className="text-3xl mb-3">📊</div>
              <p className="text-text-muted">Select an event to view its summary</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
