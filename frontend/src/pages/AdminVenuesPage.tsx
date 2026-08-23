import { useState, useEffect } from 'react';
import { venuesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../components/Toast';

interface SeatDef {
  category: string;
  row_label: string;
  seat_number: number;
}

export default function AdminVenuesPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [rowStart, setRowStart] = useState('A');
  const [rowEnd, setRowEnd] = useState('J');
  const [seatsPerRow, setSeatsPerRow] = useState(20);
  const [premiumRows, setPremiumRows] = useState('A,B,C');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchVenues();
  }, [isAuthenticated, user]);

  const fetchVenues = async () => {
    try {
      const res = await venuesAPI.list();
      setVenues(res.data.venues);
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateSeats = (): SeatDef[] => {
    const seats: SeatDef[] = [];
    const premiumSet = new Set(premiumRows.split(',').map((s) => s.trim().toUpperCase()));
    const startCode = rowStart.charCodeAt(0);
    const endCode = rowEnd.charCodeAt(0);

    for (let code = startCode; code <= endCode; code++) {
      const rowLabel = String.fromCharCode(code);
      const category = premiumSet.has(rowLabel) ? 'Premium' : 'Standard';
      for (let num = 1; num <= seatsPerRow; num++) {
        seats.push({ category, row_label: rowLabel, seat_number: num });
      }
    }
    return seats;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const seats = generateSeats();

    try {
      if (editingId) {
        await venuesAPI.update(editingId, { name, address, seats });
        showToast('success', 'Venue updated successfully');
      } else {
        await venuesAPI.create({ name, address, seats });
        showToast('success', 'Venue created successfully');
      }
      resetForm();
      fetchVenues();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to save venue');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = async (venueId: string) => {
    try {
      const res = await venuesAPI.get(venueId);
      const venue = res.data.venue;
      setName(venue.name);
      setAddress(venue.address);
      setEditingId(venueId);
      setShowForm(true);
      // Seat layout editing: just show the form with defaults
    } catch (err) {
      showToast('error', 'Failed to load venue details');
    }
  };

  const resetForm = () => {
    setName('');
    setAddress('');
    setRowStart('A');
    setRowEnd('J');
    setSeatsPerRow(20);
    setPremiumRows('A,B,C');
    setEditingId(null);
    setShowForm(false);
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
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold animate-fade-in">Venue Management</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
          + New Venue
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="glass-card p-8 mb-8 animate-scale-in">
          <h2 className="text-xl font-bold mb-6">
            {editingId ? 'Edit Venue' : 'Create New Venue'}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="form-label" htmlFor="venue-name">Venue Name</label>
                <input
                  id="venue-name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Grand Cineplex"
                  required
                />
              </div>
              <div>
                <label className="form-label" htmlFor="venue-address">Address</label>
                <input
                  id="venue-address"
                  type="text"
                  className="form-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City"
                  required
                />
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <h3 className="text-lg font-bold mb-4">Seat Layout</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="form-label" htmlFor="row-start">First Row</label>
                  <input
                    id="row-start"
                    type="text"
                    className="form-input"
                    value={rowStart}
                    onChange={(e) => setRowStart(e.target.value.toUpperCase())}
                    maxLength={1}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="row-end">Last Row</label>
                  <input
                    id="row-end"
                    type="text"
                    className="form-input"
                    value={rowEnd}
                    onChange={(e) => setRowEnd(e.target.value.toUpperCase())}
                    maxLength={1}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="seats-per-row">Seats/Row</label>
                  <input
                    id="seats-per-row"
                    type="number"
                    className="form-input"
                    value={seatsPerRow}
                    onChange={(e) => setSeatsPerRow(parseInt(e.target.value) || 1)}
                    min={1}
                    max={50}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="premium-rows">Premium Rows</label>
                  <input
                    id="premium-rows"
                    type="text"
                    className="form-input"
                    value={premiumRows}
                    onChange={(e) => setPremiumRows(e.target.value)}
                    placeholder="A,B,C"
                  />
                </div>
              </div>
              <p className="text-xs text-text-muted mt-2">
                Rows listed as premium will be "Premium" category. All others will be "Standard".
                Preview: {generateSeats().length} total seats
              </p>
            </div>

            <div className="flex gap-3 pt-3">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? '⏳ Saving...' : editingId ? 'Update Venue' : 'Create Venue'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Venue List */}
      {venues.length === 0 && !showForm ? (
        <div className="glass-card p-12 text-center animate-fade-in">
          <div className="text-5xl mb-4">🏟️</div>
          <h2 className="text-xl font-bold mb-2">No venues yet</h2>
          <p className="text-text-muted">Create your first venue to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {venues.map((venue, i) => (
            <div
              key={venue.id}
              className="glass-card p-6 animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold mb-1">{venue.name}</h3>
                  <p className="text-sm text-text-muted mb-2">📍 {venue.address}</p>
                  <div className="flex gap-3 text-sm">
                    <span className="badge badge-movie">{venue.total_seats} seats</span>
                    {venue.categories && venue.categories.map((cat: string) => (
                      <span key={cat} className="badge badge-concert capitalize">{cat}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => startEdit(venue.id)} className="btn-secondary text-sm">
                  ✏️ Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
