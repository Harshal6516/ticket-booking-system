const API = process.env.API || 'http://localhost:3000';

async function getOrCreateUser(name, email, password, role) {
  let res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role })
  });
  let data = await res.json();
  if (res.ok) {
    return data.token;
  }
  // Login fallback if already registered
  res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to login user');
  return data.token;
}

async function seed() {
  console.log('Seeding database...');
  try {
    // 1. Get or create Admin
    const adminToken = await getOrCreateUser('Admin User', 'admin@tickethub.com', 'password123', 'admin');
    console.log('Admin ready.');

    // 2. Get or create Organiser
    const orgToken = await getOrCreateUser('Live Nation', 'org@tickethub.com', 'password123', 'organiser');
    console.log('Organiser ready.');

    // 3. Create Venue as Admin
    const resVenue = await fetch(`${API}/venues`, {
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
    const venueData = await resVenue.json();
    if (!resVenue.ok) throw new Error(venueData.error || 'Failed to create venue');
    const venueId = venueData.venue.id;
    console.log('Venue created:', venueId);

    // 4. Create Events as Organiser
    const date1 = new Date();
    date1.setDate(date1.getDate() + 7);
    const dateStr1 = date1.toISOString().split('T')[0];

    const resEvent1 = await fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
      body: JSON.stringify({
        title: 'Coldplay - Music Of The Spheres',
        type: 'concert',
        description: 'The spectacular world tour comes to Mumbai with vibrant visuals, cosmic melodies, and an unforgettable live stadium experience!',
        venue_id: venueId,
        shows: [
          { date: dateStr1, time: '20:00' },
          { date: dateStr1, time: '22:00' }
        ],
        pricing: [
          { category: 'Premium', price: 15000 },
          { category: 'Standard', price: 8000 }
        ]
      })
    });
    const event1Data = await resEvent1.json();
    if (!resEvent1.ok) throw new Error(event1Data.error || 'Failed to create event 1');
    console.log('Event 1 created:', event1Data.event.title);

    // Create Movie Event
    const date2 = new Date();
    date2.setDate(date2.getDate() + 3);
    const dateStr2 = date2.toISOString().split('T')[0];

    const resEvent2 = await fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
      body: JSON.stringify({
        title: 'Dune: Part Two (IMAX 3D)',
        type: 'movie',
        description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
        venue_id: venueId,
        shows: [
          { date: dateStr2, time: '18:00' },
          { date: dateStr2, time: '21:30' }
        ],
        pricing: [
          { category: 'Premium', price: 650 },
          { category: 'Standard', price: 350 }
        ]
      })
    });
    const event2Data = await resEvent2.json();
    if (!resEvent2.ok) throw new Error(event2Data.error || 'Failed to create event 2');
    console.log('Event 2 created:', event2Data.event.title);

    console.log('\n🎉 Seed Complete! Live sample events are now ready on the frontend.');
  } catch (err) {
    console.error('Seed failed:', err.message);
  }
}

seed();
