// Manual test for tracker state machine
// Run this in browser console when on tracker page

(function testTrackerState() {
  console.log('=== Testing Tracker State ===');
  
  // Test 1: Check DB has paused session
  console.log('\n--- Test 1: Check getPausedSession ---');
  getPausedSession().then(paused => {
    console.log('getPausedSession result:', paused);
    
    // Test 2: Check all sessions
    console.log('\n--- Test 2: All sessions ---');
    return listSessions();
  }).then(all => {
    console.log('All sessions:', all.map(s => ({
      id: s.id,
      startedAt: s.startedAt,
      pausedAt: s.pausedAt,
      endedAt: s.endedAt
    })));
    
    // Test 3: Check getActiveSession
    console.log('\n--- Test 3: getActiveSession ---');
    return getActiveSession();
  }).then(active => {
    console.log('getActiveSession result:', active);
    console.log('\n=== Tests Complete ===');
  }).catch(err => {
    console.error('Error:', err);
  });
})();

// After running, tell me what the console shows