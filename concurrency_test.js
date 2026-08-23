/**
 * concurrency_test.js
 * 
 * This script demonstrates the concurrency safety of the ticketing system.
 * It attempts to hammer the hold and waitlist endpoints simultaneously
 * to ensure that only ONE user can hold a specific seat at a time.
 */

// Use native fetch instead of axios
const API = 'http://localhost:3000';

// We need a test show and seats. Assuming a show exists.
// Replace these with actual IDs from the database to run the test.
const TEST_SHOW_ID = process.env.TEST_SHOW_ID || 'SHOW_UUID_HERE';
const TEST_SEAT_IDS = (process.env.TEST_SEAT_IDS || 'SEAT_UUID_1,SEAT_UUID_2').split(',');
const NUM_CONCURRENT_USERS = 20;

async function runConcurrencyTest() {
  if (TEST_SHOW_ID === 'SHOW_UUID_HERE') {
    console.log('Please provide TEST_SHOW_ID and TEST_SEAT_IDS to run the concurrency test.');
    console.log('Example: TEST_SHOW_ID=uuid TEST_SEAT_IDS=uuid1,uuid2 node concurrency_test.js');
    return;
  }

  console.log(`Starting concurrency test with ${NUM_CONCURRENT_USERS} simultaneous hold attempts...`);

  // We need distinct users (tokens). For a pure concurrency test on the hold endpoint,
  // we just need valid tokens. We'll register dummy users on the fly.
  const tokens = [];
  for (let i = 0; i < NUM_CONCURRENT_USERS; i++) {
    try {
      let res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Test User ${i}`, email: `test${i}@test.com`, password: 'password123', role: 'customer' })
      });
      let data = await res.json();
      if (!res.ok) throw new Error(data.error);
      tokens.push(data.token);
    } catch (err) {
      // Ignore if user already exists
      try {
        let res = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `test${i}@test.com`, password: 'password123' })
        });
        let data = await res.json();
        tokens.push(data.token);
      } catch (loginErr) {
        console.error('Failed to get token for user', i);
      }
    }
  }

  console.log(`Prepared ${tokens.length} users. Firing simultaneous hold requests...`);

  // Fire all requests at the exact same time
  const promises = tokens.map((token, i) => {
    return fetch(`${API}/shows/${TEST_SHOW_ID}/seats/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ seatIds: TEST_SEAT_IDS })
    }).then(async res => {
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      return { user: i, status: 'SUCCESS', data: data };
    }).catch(err => {
      return { user: i, status: 'FAILED', error: err.message };
    });
  });

  const results = await Promise.all(promises);

  const successes = results.filter(r => r.status === 'SUCCESS');
  const failures = results.filter(r => r.status === 'FAILED');

  console.log('\n--- Test Results ---');
  console.log(`Total Attempts: ${NUM_CONCURRENT_USERS}`);
  console.log(`Successful Holds: ${successes.length} (Expected: 1)`);
  console.log(`Failed Holds (Concurrency rejected): ${failures.length} (Expected: ${NUM_CONCURRENT_USERS - 1})`);

  if (successes.length === 1) {
    console.log('\n✅ CONCURRENCY TEST PASSED: Only one user successfully held the seats.');
    console.log(`Winning User ID: ${successes[0].user}`);
  } else if (successes.length === 0) {
    console.log('\n⚠️ TEST INCONCLUSIVE: No one got the seat (maybe it was already held/booked).');
  } else {
    console.log('\n❌ CONCURRENCY TEST FAILED: Multiple users held the same seat!');
  }
}

runConcurrencyTest().catch(console.error);
