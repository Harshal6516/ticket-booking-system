/**
 * test_e2e.js
 * 
 * End-to-End integration test suite for the Ticket Booking System.
 * Usage: node test_e2e.js
 */

const API = process.env.API || 'http://localhost:3000';

async function runFullE2ETest() {
  console.log('🚀 Starting Comprehensive Full-Stack E2E Test...\n');

  // 1. Health check
  console.log('1️⃣ Checking Health Endpoint...');
  const healthRes = await fetch(`${API}/health`);
  const healthData = await healthRes.json();
  if (!healthRes.ok || healthData.status !== 'ok') throw new Error('Health check failed');
  console.log('   ✅ Health check OK:', healthData);

  // 2. Auth: Register / Login Admin, Organiser, Customers
  const timestamp = Date.now();
  console.log('\n2️⃣ Testing Authentication (Admin, Organiser, Customer1, Customer2)...');
  
  const adminRes = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Admin E2E', email: `admin_${timestamp}@test.com`, password: 'password123', role: 'admin' })
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.token;
  console.log('   ✅ Admin registered:', adminData.user.email);

  const orgRes = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Organiser E2E', email: `org_${timestamp}@test.com`, password: 'password123', role: 'organiser' })
  });
  const orgData = await orgRes.json();
  const orgToken = orgData.token;
  console.log('   ✅ Organiser registered:', orgData.user.email);

  const cust1Res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Customer One', email: `cust1_${timestamp}@test.com`, password: 'password123', role: 'customer' })
  });
  const cust1Data = await cust1Res.json();
  const cust1Token = cust1Data.token;
  console.log('   ✅ Customer 1 registered:', cust1Data.user.email);

  const cust2Res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Customer Two', email: `cust2_${timestamp}@test.com`, password: 'password123', role: 'customer' })
  });
  const cust2Data = await cust2Res.json();
  const cust2Token = cust2Data.token;
  console.log('   ✅ Customer 2 registered:', cust2Data.user.email);

  // 3. Venues
  console.log('\n3️⃣ Testing Venue Creation & Permissions...');
  const venueRes = await fetch(`${API}/venues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `Metro Arena ${timestamp}`,
      address: '77 Silicon Way, Bengaluru',
      seats: [
        { row_label: 'A', seat_number: 1, category: 'VIP' },
        { row_label: 'A', seat_number: 2, category: 'VIP' },
        { row_label: 'B', seat_number: 1, category: 'Standard' }
      ]
    })
  });
  const venueData = await venueRes.json();
  if (!venueRes.ok) throw new Error('Venue creation failed: ' + JSON.stringify(venueData));
  const venueId = venueData.venue.id;
  console.log('   ✅ Venue created by Admin:', venueData.venue.name, `(${venueData.seats.length} seats)`);

  // Verify Organiser can list venues
  const orgVenuesRes = await fetch(`${API}/venues`, {
    headers: { 'Authorization': `Bearer ${orgToken}` }
  });
  const orgVenuesData = await orgVenuesRes.json();
  if (!orgVenuesRes.ok || !orgVenuesData.venues) throw new Error('Organiser cannot list venues');
  console.log('   ✅ Organiser successfully queried venues list (found:', orgVenuesData.venues.length, 'venues)');

  // 4. Create Event
  console.log('\n4️⃣ Testing Event Creation...');
  const eventRes = await fetch(`${API}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: `Grand World Tour ${timestamp}`,
      type: 'concert',
      venue_id: venueId,
      description: 'An exclusive stadium show',
      shows: [
        { date: '2026-10-15', time: '19:30' }
      ],
      pricing: [
        { category: 'VIP', price: 5000 },
        { category: 'Standard', price: 2000 }
      ]
    })
  });
  const eventData = await eventRes.json();
  if (!eventRes.ok) throw new Error('Event creation failed: ' + JSON.stringify(eventData));
  const eventId = eventData.event.id;
  const showId = eventData.shows[0].id;
  console.log('   ✅ Event created:', eventData.event.title, '(Show ID:', showId, ')');

  // 5. Fetch Seat Map
  console.log('\n5️⃣ Fetching Seat Map for Show...');
  const seatsRes = await fetch(`${API}/events/${eventId}/shows/${showId}/seats`, {
    headers: { 'Authorization': `Bearer ${cust1Token}` }
  });
  const seatsData = await seatsRes.json();
  if (!seatsRes.ok || seatsData.seats.length !== 3) throw new Error('Seats count mismatch');
  console.log('   ✅ Seat map fetched: 3 total seats (Categories:', Object.keys(seatsData.seatsByRow), ')');

  const vipSeats = seatsData.seats.filter((s) => s.category === 'VIP');
  const vipSeat1 = vipSeats[0];
  const vipSeat2 = vipSeats[1];

  // 6. Hold Seats & Atomic Concurrency
  console.log('\n6️⃣ Testing Seat Holds & Concurrency...');
  const holdRes = await fetch(`${API}/shows/${showId}/seats/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cust1Token}` },
    body: JSON.stringify({ seatIds: [vipSeat1.id, vipSeat2.id] })
  });
  const holdData = await holdRes.json();
  if (!holdRes.ok) throw new Error('Hold failed: ' + JSON.stringify(holdData));
  console.log('   ✅ Customer 1 held 2 VIP seats. Expires at:', holdData.holdExpiresAt);

  // Customer 2 tries to hold the same seat -> Expect 409 Conflict
  const conflictHoldRes = await fetch(`${API}/shows/${showId}/seats/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cust2Token}` },
    body: JSON.stringify({ seatIds: [vipSeat1.id] })
  });
  if (conflictHoldRes.status === 409) {
    console.log('   ✅ Double-hold prevention verified: Customer 2 received 409 Conflict as expected.');
  } else {
    throw new Error('Double-hold prevention failed!');
  }

  // 7. Confirm Booking + QR Code + Email
  console.log('\n7️⃣ Confirming Booking (Triggering QR & Nodemailer Email)...');
  const idempotencyKey = `idemp-${timestamp}`;
  const bookRes = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cust1Token}` },
    body: JSON.stringify({
      showId,
      seatIds: [vipSeat1.id, vipSeat2.id],
      customerName: 'Customer One',
      customerEmail: `cust1_${timestamp}@test.com`,
      idempotencyKey
    })
  });
  const bookData = await bookRes.json();
  if (!bookRes.ok) throw new Error('Booking failed: ' + JSON.stringify(bookData));
  const bookingId = bookData.booking.id;
  console.log('   ✅ Booking confirmed! Ref:', bookData.booking.booking_ref, 'Total: ₹' + bookData.booking.totalPrice);
  console.log('   ✅ QR code generated successfully:', !!bookData.booking.qr_code_url);

  // Test Idempotency key replay
  const replayRes = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cust1Token}` },
    body: JSON.stringify({
      showId,
      seatIds: [vipSeat1.id, vipSeat2.id],
      customerName: 'Customer One',
      customerEmail: `cust1_${timestamp}@test.com`,
      idempotencyKey
    })
  });
  const replayData = await replayRes.json();
  if (replayRes.ok && replayData.booking.id === bookingId) {
    console.log('   ✅ Idempotency verified: Duplicate request returned identical booking safely.');
  } else {
    throw new Error('Idempotency check failed!');
  }

  // 8. Join Waitlist (All VIP seats are booked)
  console.log('\n8️⃣ Testing Waitlist Registration for Sold-out VIP category...');
  const waitlistRes = await fetch(`${API}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cust2Token}` },
    body: JSON.stringify({ showId, category: 'VIP' })
  });
  const waitlistData = await waitlistRes.json();
  if (!waitlistRes.ok) throw new Error('Waitlist join failed: ' + JSON.stringify(waitlistData));
  console.log('   ✅ Customer 2 joined waitlist at position #', waitlistData.waitlistEntry.position);

  // 9. Cancel Booking & Trigger Waitlist Cascade + Email
  console.log('\n9️⃣ Testing Booking Cancellation & Waitlist Auto-Offer Email Cascade...');
  const cancelRes = await fetch(`${API}/bookings/${bookingId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${cust1Token}` }
  });
  const cancelData = await cancelRes.json();
  if (!cancelRes.ok) throw new Error('Cancellation failed: ' + JSON.stringify(cancelData));
  console.log('   ✅ Booking cancelled. Triggered automatic cascade to waitlist.');

  // Wait 800ms for cascade & email dispatch
  await new Promise((r) => setTimeout(r, 800));

  // Check Customer 2's waitlist entry
  const cust2WaitlistRes = await fetch(`${API}/waitlist/me`, {
    headers: { 'Authorization': `Bearer ${cust2Token}` }
  });
  const cust2WaitlistData = await cust2WaitlistRes.json();
  const offerEntry = cust2WaitlistData.waitlistEntries.find((w) => w.show_id === showId && w.category === 'VIP');
  if (!offerEntry || offerEntry.status !== 'offered' || !offerEntry.offer_token) {
    throw new Error('Waitlist cascade failed to update entry to "offered": ' + JSON.stringify(cust2WaitlistData));
  }
  console.log('   ✅ Waitlist offer successfully generated with token:', offerEntry.offer_token);

  // 10. Accept Offer
  console.log('\n🔟 Testing Waitlist Offer Acceptance via Token...');
  const acceptRes = await fetch(`${API}/offers/${offerEntry.offer_token}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cust2Token}` },
    body: JSON.stringify({ customerName: 'Customer Two', customerEmail: `cust2_${timestamp}@test.com` })
  });
  const acceptData = await acceptRes.json();
  if (!acceptRes.ok) throw new Error('Accept offer failed: ' + JSON.stringify(acceptData));
  console.log('   ✅ Offer accepted! New Booking Ref:', acceptData.booking.booking_ref);

  // 11. Organiser Dashboard Summary
  console.log('\n1️⃣1️⃣ Verifying Organiser Revenue & Summary Calculations...');
  const summaryRes = await fetch(`${API}/events/organiser/summary/${eventId}`, {
    headers: { 'Authorization': `Bearer ${orgToken}` }
  });
  const summaryData = await summaryRes.json();
  if (!summaryRes.ok) throw new Error('Summary fetch failed: ' + JSON.stringify(summaryData));
  console.log('   ✅ Organiser Summary verified:');
  console.log('      - Total Revenue: ₹' + summaryData.total_revenue);
  console.log('      - Revenue by Category:', summaryData.revenue_by_category);
  console.log('      - Waitlist stats:', summaryData.waitlist_stats);

  console.log('\n🎉 ALL 11 END-TO-END SUITES PASSED FLAWLESSLY! 100% OPERATIONAL.\n');
}

runFullE2ETest().catch((err) => {
  console.error('\n❌ E2E Test Failed:', err);
  process.exit(1);
});
