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

/**
 * Classify a session record by its lifecycle state. Single source of truth
 * for "is this session active / stopped / ended" used by the tracker view,
 * sessions list and session detail.
 *
 * @param {{ stoppedAt?: number|null, endedAt?: number|null }|null|undefined} session
 * @returns {'none'|'ended'|'stopped'|'active'}
 */
export function sessionStatus(session) {
  if (!session) return 'none';
  if (session.endedAt) return 'ended';
  if (session.stoppedAt) return 'stopped';
  return 'active';
}

/**
 * Is this session a candidate for the Resume action? True only for
 * stopped sessions (resume is the "undo Stop" affordance).
 */
export function isResumable(session) {
  return sessionStatus(session) === 'stopped';
}

/**
 * Compute the desired state of the tracker's four action buttons given the
 * current session and event log. Pure function - the single source of truth
 * for tracker button UX, easy to unit test.
 *
 * Mental model:
 *   - up / pause / down  : drive the cycle FSM (idle->going_up->at_top->...).
 *   - 4th button          : session-level Stop / Resume.
 *       running    -> "Stop"   (stops the session)
 *       stopped    -> "Resume" (un-stops, for mistakes)
 *       no session -> "Stop"   (disabled placeholder)
 *
 *   When stopped (session is null but events exist OR session.stoppedAt is
 *   set), the cycle FSM is frozen. The user can either Resume or, by
 *   pressing Up, start a brand new session.
 *
 * @param {{ session: ({ stoppedAt?: number|null }|null), events: Array<{type:string}> }} input
 * @returns {{
 *   up:    { enabled: boolean },
 *   pause: { enabled: boolean },
 *   down:  { enabled: boolean },
 *   stop:  { enabled: boolean, label: 'Stop'|'Resume' },
 * }}
 */
export function buttonStatesFor({ session, events } = {}) {
  const evts = events || [];
  const isRunning = !!(session && !session.stoppedAt);
  const isStopped = !!(session && session.stoppedAt);
  const hasOrphanedEvents = !session && evts.length > 0;
  const inStoppedMode = isStopped || hasOrphanedEvents;

  // 4th button: Stop / Resume / disabled-Stop.
  let stop;
  if (isRunning) {
    stop = { enabled: true, label: 'Stop' };
  } else if (inStoppedMode) {
    stop = { enabled: true, label: 'Resume' };
  } else {
    stop = { enabled: false, label: 'Stop' };
  }

  // While stopped the FSM is frozen: only the 4th button (Resume) and Up
  // (start a new session) are meaningful.
  if (inStoppedMode) {
    return {
      up: { enabled: true },
      pause: { enabled: false },
      down: { enabled: false },
      stop,
    };
  }

  // No session at all - first press must be Up to begin.
  if (!isRunning) {
    return {
      up: { enabled: true },
      pause: { enabled: false },
      down: { enabled: false },
      stop,
    };
  }

  // Running: take FSM-allowed events plus the natural shortcuts at rest
  // states (at_top -> Down, at_bottom -> Up). going_up/going_down also
  // expose the opposite-direction button, which the tracker treats as an
  // implicit Pause+next sequence.
  const state = stateFromEvents(evts);
  const allowed = new Set(allowedEvents(state));
  if (state === STATES.GOING_UP) allowed.add(EVENTS.DOWN);
  if (state === STATES.AT_TOP) allowed.add(EVENTS.DOWN);
  if (state === STATES.GOING_DOWN) allowed.add(EVENTS.UP);
  if (state === STATES.AT_BOTTOM) allowed.add(EVENTS.UP);

  return {
    up: { enabled: allowed.has(EVENTS.UP) },
    pause: { enabled: allowed.has(EVENTS.PAUSE) },
    down: { enabled: allowed.has(EVENTS.DOWN) },
    stop,
  };
}
