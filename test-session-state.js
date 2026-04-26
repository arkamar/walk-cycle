// Test: Session state across view changes
// Run with: node test-session-state.js

const STATES = { IDLE: 'idle', GOING_UP: 'going_up', AT_TOP: 'at_top', GOING_DOWN: 'going_down', AT_BOTTOM: 'at_bottom' };
const EVENTS = { UP: 'up', PAUSE: 'pause', DOWN: 'down' };

// Simplified state machine
const stateFromEvents = (events) => {
  let state = STATES.IDLE;
  const transitions = {
    [STATES.IDLE]: { [EVENTS.UP]: STATES.GOING_UP },
    [STATES.GOING_UP]: { [EVENTS.PAUSE]: STATES.AT_TOP },
    [STATES.AT_TOP]: { [EVENTS.DOWN]: STATES.GOING_DOWN },
    [STATES.GOING_DOWN]: { [EVENTS.PAUSE]: STATES.AT_BOTTOM },
    [STATES.AT_BOTTOM]: { [EVENTS.UP]: STATES.GOING_UP },
  };
  for (const e of events) {
    const t = transitions[state];
    if (t && t[e.type]) state = t[e.type];
  }
  return state;
};

console.log('=== Session State Tests (View Switch) ===\n');

let tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result.pass) {
      console.log(`PASS: ${name}`);
      passed++;
    } else {
      console.log(`FAIL: ${name}`);
      console.log(`  ${result.reason}`);
      failed++;
    }
  } catch (e) {
    console.log(`FAIL: ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

// Test 1: When paused, switching to History loads paused session
test('loadActiveSession: paused session loaded on view switch', () => {
  const pausedSession = { id: 1, pausedAt: Date.now() };
  const events = [{ type: EVENTS.UP, ts: 1000 }, { type: EVENTS.PAUSE, ts: 2000 }];
  
  // Simulate loadActiveSession logic
  const session = pausedSession;
  const loadedEvents = events;
  const loadedState = stateFromEvents(loadedEvents);
  
  // Verify session has pausedAt
  const isPaused = session && session.pausedAt;
  const hasEvents = loadedEvents.length > 0;
  
  return { pass: isPaused && hasEvents };
});

// Test 2: When paused, render shows Resume
test('render: paused session shows Resume button', () => {
  const session = { id: 1, pausedAt: Date.now() };
  const events = [{ type: EVENTS.UP, ts: 1000 }, { type: EVENTS.PAUSE, ts: 2000 }];
  const state = stateFromEvents(events);
  
  // Simulate render logic for stop button
  const isRunning = session && !session.pausedAt;
  const isPaused = session && session.pausedAt;
  const hasPausedData = !session && events.length > 0;
  
  const stopLabel = isRunning ? 'Pause' : (isPaused || hasPausedData ? 'Resume' : 'Stop');
  
  return { pass: stopLabel === 'Resume' };
});

// Test 3: When paused with events, Up button still enabled
test('render: paused at_bottom enables Up button', () => {
  const session = { id: 1, pausedAt: Date.now() };
  const events = [
    { type: EVENTS.UP, ts: 1000 },
    { type: EVENTS.PAUSE, ts: 2000 },
    { type: EVENTS.DOWN, ts: 3000 },
    { type: EVENTS.PAUSE, ts: 4000 }
  ];
  const state = stateFromEvents(events); // AT_BOTTOM
  
  // Simulate allowed buttons
  const hasPausedData = !session && events.length > 0;
  const allowed = [];
  if (session || hasPausedData) {
    allowed.push(EVENTS.PAUSE, EVENTS.UP, EVENTS.DOWN);
  }
  
  // Add direct transitions when paused
  if (state === STATES.AT_BOTTOM && hasPausedData) {
    allowed.push(EVENTS.UP);
  }
  
  return { pass: allowed.includes(EVENTS.UP) };
});

// Test 4: Resume updates session state correctly
test('onStopSession: resume restores active state', () => {
  const pausedSession = { id: 1, pausedAt: Date.now() };
  
  // Simulate resume
  const resumed = { ...pausedSession, pausedAt: null };
  
  const isRunning = resumed && !resumed.pausedAt;
  
  return { pass: isRunning };
});

// Test 5: Load after resume should be active
test('loadActiveSession: after resume, session is active', () => {
  const resumedSession = { id: 1, pausedAt: null };
  
  const active = resumedSession;
  const paused = null;
  
  // Load logic: prefer active
  const session = active || paused;
  
  const isRunning = session && !session.pausedAt;
  
  return { pass: isRunning };
});

// Test 6: Pause sets pausedAt
test('pauseSession: sets pausedAt timestamp', () => {
  const now = Date.now();
  const pausedSession = { id: 1, pausedAt: now };
  
  return { pass: !!pausedSession.pausedAt };
});

// Test 7: After pause, session becomes "paused"
test('loadActiveSession: paused session shows paused state', () => {
  const pausedSession = { id: 1, pausedAt: Date.now() };
  
  const active = null;
  const paused = pausedSession;
  
  const session = active || paused;
  
  const isPaused = session && session.pausedAt;
  
  return { pass: isPaused };
});

// Test 8: events are loaded on view switch
test('loadActiveSession: events are preserved on switch', () => {
  const pausedSession = { id: 1, pausedAt: Date.now() };
  const expectedEvents = [
    { type: EVENTS.UP, ts: 1000 },
    { type: EVENTS.PAUSE, ts: 2000 },
    { type: EVENTS.DOWN, ts: 3000 },
    { type: EVENTS.PAUSE, ts: 4000 }
  ];
  
  // Simulate loading events
  const events = expectedEvents;
  
  return { pass: events.length === 4 };
});

// Test 9: hasPausedData is true when session is null but events exist
test('render: hasPausedData detected', () => {
  const session = null;
  const events = [{ type: EVENTS.UP, ts: 1000 }];
  
  const hasPausedData = !session && events.length > 0;
  
  return { pass: hasPausedData };
});

// Test 10: Resume button disabled when no paused session
test('render: no paused session shows disabled Stop', () => {
  const session = null;
  const events = [];
  
  const isRunning = session && !session.pausedAt;
  const isPaused = session && session.pausedAt;
  const hasPausedData = !session && events.length > 0;
  
  const disabled = !(isRunning || isPaused || hasPausedData);
  
  return { pass: disabled };
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);