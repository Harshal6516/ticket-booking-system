const API = 'http://localhost:3000';

async function seed() {
  console.log('Seeding database...');
  try {
    // 1. Register Admin
    let res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin User', email: 'admin@tickethub.com', password: 'password123', role: 'admin' })
    });
    let data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const adminToken = data.token;
    console.log('Admin created.');

    // 2. Register Organiser
    res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Live Nation', email: 'org@tickethub.com', password: 'password123', role: 'organiser' })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const orgToken = data.token;
    console.log('Organiser created.');

    // 3. Create Venue as Admin
    res = await fetch(`${API}/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Grand Arena',
        address: '123 Main St, Mumbai',
        seats: [
          { row_label: 'A', seat_number: 1, category: 'Premium' },
          { row_label: 'A', seat_number: 2, category: 'Premium' },
          { row_label: 'A', seat_number: 3, category: 'Premium' },
          { row_label: 'A', seat_number: 4, category: 'Premium' },
          { row_label: 'B', seat_number: 1, category: 'Standard' },
          { row_label: 'B', seat_number: 2, category: 'Standard' },
          { row_label: 'B', seat_number: 3, category: 'Standard' },
          { row_label: 'B', seat_number: 4, category: 'Standard' }
        ]
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const venueId = data.venue.id;
    console.log('Venue created:', venueId);

    // 4. Create Event as Organiser
    const date = new Date();
    date.setDate(date.getDate() + 7);
    const dateStr = date.toISOString().split('T')[0];

    res = await fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
      body: JSON.stringify({
        title: 'Coldplay - Music Of The Spheres',
        type: 'concert',
        description: 'The spectacular world tour comes to Mumbai!',
        venue_id: venueId,
        shows: [
          { date: dateStr, time: '20:00' },
          { date: dateStr, time: '22:00' }
        ],
        pricing: [
          { category: 'Premium', price: 15000 },
          { category: 'Standard', price: 8000 }
        ]
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    console.log('Event created:', data.event.id);
    console.log('\nSeed Complete! You can now view the event on the frontend.');

  } catch (err) {
    console.error('Seed failed:', err.message);
  }
}

seed();
