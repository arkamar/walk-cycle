// Test state machine behavior for tracker buttons
// Run with: node test-state-machine.js

const STATES = {
  IDLE: 'idle',
  GOING_UP: 'going_up',
  AT_TOP: 'at_top',
  GOING_DOWN: 'going_down',
  AT_BOTTOM: 'at_bottom',
};

const EVENTS = {
  UP: 'up',
  PAUSE: 'pause',
  DOWN: 'down',
};

const TRANSITIONS = {
  [STATES.IDLE]:        { [EVENTS.UP]:    STATES.GOING_UP },
  [STATES.GOING_UP]:    { [EVENTS.PAUSE]: STATES.AT_TOP },
  [STATES.AT_TOP]:      { [EVENTS.DOWN]:  STATES.GOING_DOWN },
  [STATES.GOING_DOWN]:  { [EVENTS.PAUSE]: STATES.AT_BOTTOM },
  [STATES.AT_BOTTOM]:   { [EVENTS.UP]:    STATES.GOING_UP },
};

function nextState(state, event) {
  const t = TRANSITIONS[state];
  if (!t) return null;
  return t[event] ?? null;
}

function allowedEvents(state) {
  const t = TRANSITIONS[state];
  return t ? Object.keys(t) : [];
}

function getAllowedButtonsForState(state) {
  const allowed = [...allowedEvents(state)];
  // Add direct transitions
  if (state === STATES.AT_TOP) allowed.push('down');
  if (state === STATES.AT_BOTTOM) allowed.push('up');
  return allowed;
}

// Test cases
const tests = [
  // Session states
  { name: 'No session (start)', session: null, state: STATES.IDLE, expectedStop: 'Stop (disabled)' },
  { name: 'Active - going_up', session: { pausedAt: null }, state: STATES.GOING_UP, expectedStop: 'Pause', allowed: ['pause', 'down'] },
  { name: 'Active - at_top', session: { pausedAt: null }, state: STATES.AT_TOP, expectedStop: 'Pause', allowed: ['down'] },
  { name: 'Active - going_down', session: { pausedAt: null }, state: STATES.GOING_DOWN, expectedStop: 'Pause', allowed: ['pause', 'up'] },
  { name: 'Active - at_bottom', session: { pausedAt: null }, state: STATES.AT_BOTTOM, expectedStop: 'Pause', allowed: ['up'] },
  { name: 'Paused (session.pausedAt set)', session: { pausedAt: Date.now() }, state: STATES.AT_TOP, expectedStop: 'Resume (enabled)', expectedAllowPaused: true },
  { name: 'Stopped (no session but events)', session: null, state: STATES.AT_TOP, expectedStop: 'Resume (enabled)', allowWithEvents: true },
];

console.log('=== State Machine Tests ===\n');

let passed = 0;
let failed = 0;

tests.forEach(t => {
  let result = 'PASS';
  let details = '';
  
  const isRunning = t.session && !t.session.pausedAt;
  const isPaused = t.session && t.session.pausedAt;
  
  // Check stop button
  let stopLabel = '?';
  if (isRunning) stopLabel = 'Pause';
  else if (isPaused) stopLabel = 'Resume';
  else stopLabel = 'Stop';
  
  if (stopLabel !== t.expectedStop.split(' ')[0]) {
    result = 'FAIL';
    details += `stop: got ${stopLabel}`;
  }
  
  // Check allowed buttons
  const allowed = t.session ? getAllowedButtonsForState(t.state) : ['up'];
  if (t.expectedAllowPaused && !t.session) {
    // When paused, should allow continuing
    if (t.state === STATES.AT_TOP) allowed.push('down');
    if (t.state === STATES.AT_BOTTOM) allowed.push('up');
  }
  
  if (t.allowed && !t.allowed.every(a => allowed.includes(a))) {
    result = 'FAIL';
    details += ` allowed`;
  }
  
  console.log(`${result}: ${t.name}`);
  if (details) console.log(`  ${details}`);
  
  if (result === 'PASS') passed++;
  else failed++;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);