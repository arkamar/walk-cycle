import { el, toast, formatTime } from '../ui.js';
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
  formatDuration,
  segmentDurationFromCycle,
  SEGMENT_KINDS,
  SEGMENT_LABELS,
} from '../analytics.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const BUTTONS = [
  { kind: EVENTS.UP, label: 'Up', icon: '▲' },
  { kind: EVENTS.PAUSE, label: 'Pause', icon: '❚❚' },
  { kind: EVENTS.DOWN, label: 'Down', icon: '▼' },
];

export async function renderTracker(target) {
  let session = null;
  let events = [];
  let state = STATES.IDLE;
  let segmentStartTs = null;

  const stateLabelEl = el('div', { class: 'tracker-mini-state' }, 'Ready');
  const cycleCountEl = el('div', { class: 'tracker-mini-cycles' }, '');

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

  const logHeader = el('div', { class: 'log-header' }, 'Session log');
  const logList = el('div', { class: 'log-list' });
  const logCard = el('div', { class: 'card log-card' }, [logHeader, logList]);

  target.appendChild(
    el('div', { class: 'tracker' }, [
      stateLabelEl,
      cycleCountEl,
      actionGrid,
      sessionControls,
      logCard,
    ])
  );

  async function loadActiveSession() {
    session = await getActiveSession();
    if (!session) {
      events = [];
      state = STATES.IDLE;
      segmentStartTs = null;
      render();
      return;
    }
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
    rebuildLog();
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
    logList.innerHTML = '';
  }

  async function onPress(kind) {
    if (!session) {
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
    addLogEntry(ev);
  }

  function render() {
    stateLabelEl.textContent = session ? stateLabel(state) : 'Ready';

    const segments = segmentsFromEvents(events);
    const cycles = cyclesFromSegments(segments);
    const completed = cycles.length;
    cycleCountEl.textContent = session
      ? `Cycle ${completed + 1}`
      : '';

    const allowed = new Set(session ? allowedEvents(state) : []);
    for (const b of BUTTONS) {
      const node = buttonNodes[b.kind];
      const isAllowed = allowed.has(b.kind);
      node.disabled = !isAllowed;
      node.dataset.active = isAllowed ? 'true' : 'false';
    }

    startBtn.style.display = session ? 'none' : '';
    stopBtn.style.display = session ? '' : 'none';
    logCard.style.display = session ? '' : 'none';
  }

  function addLogEntry(ev) {
    if (events.length < 2) return;
    const prevEv = events[events.length - 2];
    const kind = pairKind(prevEv.type, ev.type);
    if (!kind) return;

    const duration = ev.ts - prevEv.ts;
    const segments = segmentsFromEvents(events.slice(0, -1));
    const cycles = cyclesFromSegments(segments);

    const currentCycleIndex = cycles.length;
    const prevDuration = segmentDurationFromCycle(cycles, currentCycleIndex - 1, kind);
    const diffMs = prevDuration !== undefined ? duration - prevDuration : null;

    const row = el('div', { class: 'log-entry' }, [
      el('div', { class: 'log-entry-time' }, formatTime(ev.ts)),
      el('div', { class: 'log-entry-kind' }, SEGMENT_LABELS[kind] || kind),
      el('div', { class: 'log-entry-duration' }, formatDuration(duration)),
    ]);

    if (diffMs !== null) {
      const diffEl = el('div', { class: 'log-entry-diff' });
      const diffSec = Math.round(diffMs / 1000);
      const prefix = diffSec > 0 ? '+' : '';
      diffEl.textContent = `${prefix}${diffSec}s`;
      diffEl.dataset.faster = diffSec < 0 ? 'true' : diffSec > 0 ? 'false' : 'none';
      row.appendChild(diffEl);
    }

    logList.appendChild(row);
    logList.scrollTop = logList.scrollHeight;
  }

  function rebuildLog() {
    logList.innerHTML = '';
    if (!session || events.length < 2) return;

    for (let i = 1; i < events.length; i++) {
      const prevEv = events[i - 1];
      const ev = events[i];
      const kind = pairKind(prevEv.type, ev.type);
      if (!kind) continue;

      const duration = ev.ts - prevEv.ts;
      const currentEventsSlice = events.slice(0, i);
      const segments = segmentsFromEvents(currentEventsSlice);
      const cycles = cyclesFromSegments(segments);
      const currentCycleIndex = cycles.length;
      const prevDuration = segmentDurationFromCycle(cycles, currentCycleIndex - 1, kind);
      const diffMs = prevDuration !== undefined ? duration - prevDuration : null;

      const row = el('div', { class: 'log-entry' }, [
        el('div', { class: 'log-entry-time' }, formatTime(ev.ts)),
        el('div', { class: 'log-entry-kind' }, SEGMENT_LABELS[kind] || kind),
        el('div', { class: 'log-entry-duration' }, formatDuration(duration)),
      ]);

      if (diffMs !== null) {
        const diffEl = el('div', { class: 'log-entry-diff' });
        const diffSec = Math.round(diffMs / 1000);
        const prefix = diffSec > 0 ? '+' : '';
        diffEl.textContent = `${prefix}${diffSec}s`;
        diffEl.dataset.faster =
          diffSec < 0 ? 'true' : diffSec > 0 ? 'false' : 'none';
        row.appendChild(diffEl);
      }

      logList.appendChild(row);
    }
    logList.scrollTop = logList.scrollHeight;
  }

  await loadActiveSession();

  return () => {};
}

function pairKind(a, b) {
  if (a === 'up' && b === 'pause') return SEGMENT_KINDS.UP;
  if (a === 'pause' && b === 'down') return SEGMENT_KINDS.TOP_REST;
  if (a === 'down' && b === 'pause') return SEGMENT_KINDS.DOWN;
  if (a === 'pause' && b === 'up') return SEGMENT_KINDS.BOTTOM_REST;
  return null;
}