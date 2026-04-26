import { el, toast } from '../ui.js';
import {
  STATES,
  EVENTS,
  allowedEvents,
  nextState,
  stateFromEvents,
  stateLabel,
} from '../stateMachine.js';
import {
  createSession,
  endSession,
  addEvent,
  getActiveSession,
  listEventsBySession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatLive,
} from '../analytics.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // auto-close session after 30 min idle

const BUTTONS = [
  { kind: EVENTS.UP, label: 'Up', icon: '▲' },
  { kind: EVENTS.PAUSE, label: 'Pause', icon: '❚❚' },
  { kind: EVENTS.DOWN, label: 'Down', icon: '▼' },
];

export async function renderTracker(target) {
  // ---------- Local state ----------
  let session = null;            // active session row from DB
  let events = [];               // chronological events for the session
  let state = STATES.IDLE;       // current FSM state
  let segmentStartTs = null;     // when the active segment started (last event ts)
  let timerInterval = null;

  // ---------- DOM ----------
  const stateLabelEl = el('div', { class: 'tracker-state' }, '—');
  const timerEl = el('div', { class: 'tracker-timer' }, '00:00');
  const cyclesEl = el('div', { class: 'tracker-cycles' }, '');
  const statusCard = el('div', { class: 'card tracker-status' }, [
    stateLabelEl,
    timerEl,
    cyclesEl,
  ]);

  const buttonNodes = {};
  const actionGrid = el('div', { class: 'action-buttons' });
  for (const b of BUTTONS) {
    const btn = el(
      'button',
      {
        class: 'action-btn',
        type: 'button',
        dataset: { kind: b.kind },
        onClick: () => onPress(b.kind),
      },
      [
        el('span', { class: 'action-icon' }, b.icon),
        el('span', {}, b.label),
      ]
    );
    buttonNodes[b.kind] = btn;
    actionGrid.appendChild(btn);
  }

  const startBtn = el(
    'button',
    { class: 'btn btn-primary', type: 'button', onClick: onStartSession },
    'Start session'
  );
  const stopBtn = el(
    'button',
    { class: 'btn btn-danger', type: 'button', onClick: onStopSession },
    'Stop session'
  );
  const sessionControls = el('div', { class: 'session-controls' }, [startBtn, stopBtn]);

  const helpCard = el('div', { class: 'card' }, [
    el('h3', {}, 'How it works'),
    el('p', { class: 'muted' }, [
      'Press ',
      el('strong', { style: { color: 'var(--success)' } }, 'Up'),
      ' to start climbing. Press ',
      el('strong', { style: { color: 'var(--warning)' } }, 'Pause'),
      ' when you reach the top. Press ',
      el('strong', { style: { color: 'var(--danger)' } }, 'Down'),
      ' to head back. Press ',
      el('strong', { style: { color: 'var(--warning)' } }, 'Pause'),
      ' again at the start. Repeat.',
    ]),
  ]);

  target.appendChild(
    el('div', { class: 'tracker' }, [statusCard, actionGrid, sessionControls, helpCard])
  );

  // ---------- Logic ----------

  async function loadActiveSession() {
    session = await getActiveSession();
    if (!session) {
      events = [];
      state = STATES.IDLE;
      segmentStartTs = null;
      render();
      return;
    }
    // Auto-close stale sessions (idle > timeout).
    events = await listEventsBySession(session.id);
    const lastTs = events.length ? events[events.length - 1].ts : session.startedAt;
    if (Date.now() - lastTs > IDLE_TIMEOUT_MS) {
      await endSession(session.id, lastTs);
      toast('Stale session auto-closed');
      session = null;
      events = [];
      state = STATES.IDLE;
      segmentStartTs = null;
      render();
      return;
    }
    state = stateFromEvents(events);
    segmentStartTs = events.length ? events[events.length - 1].ts : session.startedAt;
    render();
  }

  async function onStartSession() {
    if (session) {
      toast('Session already active');
      return;
    }
    const id = await createSession();
    session = { id, startedAt: Date.now(), endedAt: null };
    events = [];
    state = STATES.IDLE;
    segmentStartTs = Date.now();
    toast('Session started');
    render();
  }

  async function onStopSession() {
    if (!session) {
      toast('No active session');
      return;
    }
    if (!confirm('Stop the current session?')) return;
    await endSession(session.id);
    session = null;
    events = [];
    state = STATES.IDLE;
    segmentStartTs = null;
    toast('Session stopped');
    render();
  }

  async function onPress(kind) {
    if (!session) {
      // Auto-start session on first press for convenience.
      await onStartSession();
    }
    const ns = nextState(state, kind);
    if (!ns) {
      toast('Not allowed in current state');
      return;
    }
    const ev = await addEvent({ sessionId: session.id, type: kind });
    events.push(ev);
    state = ns;
    segmentStartTs = ev.ts;
    render();
  }

  function render() {
    // State label
    stateLabelEl.textContent = session ? stateLabel(state) : 'No active session';

    // Cycle count + timer base
    const segments = segmentsFromEvents(events);
    const cycles = cyclesFromSegments(segments);
    const completed = cycles.length;
    cyclesEl.textContent = session
      ? `${completed} ${completed === 1 ? 'cycle' : 'cycles'} completed`
      : 'Press a button to begin';

    // Allowed buttons
    const allowed = new Set(session ? allowedEvents(state) : []);
    for (const b of BUTTONS) {
      const node = buttonNodes[b.kind];
      const isAllowed = allowed.has(b.kind);
      node.disabled = !isAllowed;
      node.dataset.active = isAllowed ? 'true' : 'false';
    }

    // Buttons / start-stop visibility
    startBtn.style.display = session ? 'none' : '';
    stopBtn.style.display = session ? '' : 'none';

    updateTimer();
  }

  function updateTimer() {
    if (!session || !segmentStartTs) {
      timerEl.textContent = '00:00';
      return;
    }
    timerEl.textContent = formatLive(Date.now() - segmentStartTs);
  }

  // ---------- Lifecycle ----------

  await loadActiveSession();
  timerInterval = setInterval(updateTimer, 250);

  // Cleanup callback returned to the router.
  return () => {
    if (timerInterval) clearInterval(timerInterval);
  };
}
