// Walk-cycle state machine
//
// Cycle: idle -> going_up -> at_top -> going_down -> at_bottom -> going_up ...
//
// Transitions:
//   idle         + up    -> going_up
//   going_up     + pause -> at_top
//   at_top       + down  -> going_down
//   going_down   + pause -> at_bottom
//   at_bottom    + up    -> going_up   (next cycle)
//
// Anything else is invalid (strict mode).

export const STATES = Object.freeze({
  IDLE: 'idle',
  GOING_UP: 'going_up',
  AT_TOP: 'at_top',
  GOING_DOWN: 'going_down',
  AT_BOTTOM: 'at_bottom',
});

export const EVENTS = Object.freeze({
  UP: 'up',
  PAUSE: 'pause',
  DOWN: 'down',
});

const TRANSITIONS = {
  [STATES.IDLE]:        { [EVENTS.UP]:    STATES.GOING_UP },
  [STATES.GOING_UP]:    { [EVENTS.PAUSE]: STATES.AT_TOP },
  [STATES.AT_TOP]:      { [EVENTS.DOWN]:  STATES.GOING_DOWN },
  [STATES.GOING_DOWN]:  { [EVENTS.PAUSE]: STATES.AT_BOTTOM },
  [STATES.AT_BOTTOM]:   { [EVENTS.UP]:    STATES.GOING_UP },
};

export function nextState(state, event) {
  const t = TRANSITIONS[state];
  if (!t) return null;
  return t[event] ?? null;
}

export function allowedEvents(state) {
  const t = TRANSITIONS[state];
  return t ? Object.keys(t) : [];
}

/**
 * Compute the current state from a chronological list of events.
 * Used to recover state when reopening the app mid-session.
 */
export function stateFromEvents(events) {
  let state = STATES.IDLE;
  for (const e of events) {
    const next = nextState(state, e.type);
    if (next) state = next;
    // Invalid events (shouldn't happen since UI prevents them) are ignored
    // for the purpose of state recovery.
  }
  return state;
}

/**
 * Human-readable label for the current state.
 */
export function stateLabel(state) {
  switch (state) {
    case STATES.IDLE: return 'Ready';
    case STATES.GOING_UP: return 'Going up';
    case STATES.AT_TOP: return 'At top (resting)';
    case STATES.GOING_DOWN: return 'Going down';
    case STATES.AT_BOTTOM: return 'At bottom (resting)';
    default: return 'Unknown';
  }
}
