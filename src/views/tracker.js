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
  SEGMENT_LABELS,
} from '../analytics.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const BUTTONS = [
  { kind: EVENTS.UP, label: 'Up', icon: '▲' },
  { kind: EVENTS.PAUSE, label: 'Pause', icon: '❚❚' },
  { kind: EVENTS.DOWN, label: 'Down', icon: '▼' },
];

const EVENT_LABELS = {
  [EVENTS.UP]: 'Up',
  [EVENTS.PAUSE]: 'Pause',
  [EVENTS.DOWN]: 'Down',
};

const SEGMENT_KINDS = {
  UP: 'up_duration',
  TOP_REST: 'top_rest',
  DOWN: 'down_duration',
  BOTTOM_REST: 'bottom_rest',
};

export async function renderTracker(target) {
  let session = null;
  let events = [];
  let state = STATES.IDLE;

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
      render();
      return;
    }
    state = stateFromEvents(events);
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
  }

  function addLogEntry(ev) {
    const prevEv = events.length > 1 ? events[events.length - 2] : null;
    let duration = null;
    let segmentKind = null;

    if (prevEv) {
      duration = ev.ts - prevEv.ts;
      segmentKind = segmentKindFromPair(prevEv.type, ev.type);
    }

    let diffMs = null;
    if (segmentKind && duration) {
      const segments = segmentsFromEvents(events.slice(0, -1));
      const cycles = cyclesFromSegments(segments);

      if (cycles.length > 1) {
        const prevCycle = cycles[cycles.length - 2];
        const prevSeg = prevCycle.segments[segmentKind];
        if (prevSeg) {
          diffMs = duration - prevSeg.durationMs;
        }
      }
    }

    const row = el('div', { class: 'log-entry' }, [
      el('div', { class: 'log-entry-time' }, formatTime(ev.ts)),
      el('div', { class: 'log-entry-kind' }, EVENT_LABELS[ev.type] || ev.type),
      el('div', { class: 'log-entry-duration' }, duration ? formatDuration(duration) : '–'),
    ]);

    if (diffMs !== null) {
      const diffEl = el('div', { class: 'log-entry-diff' });
      const diffSec = Math.round(diffMs / 1000);
      const prefix = diffSec > 0 ? '+' : '';
      diffEl.textContent = `${prefix}${diffSec}s`;
      diffEl.dataset.faster = diffSec < 0 ? 'true' : diffSec > 0 ? 'false' : 'none';
      row.appendChild(diffEl);
    }

    logList.insertBefore(row, logList.firstChild);
  }

  function rebuildLog() {
    logList.innerHTML = '';
    if (!session || events.length === 0) return;

    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      const prevEv = i > 0 ? events[i - 1] : null;
      let duration = null;
      let segmentKind = null;

      if (prevEv) {
        duration = ev.ts - prevEv.ts;
        segmentKind = segmentKindFromPair(prevEv.type, ev.type);
      }

      let diffMs = null;
      if (segmentKind && duration) {
        const segments = segmentsFromEvents(events.slice(0, i + 1));
        const cycles = cyclesFromSegments(segments);

        if (cycles.length > 1) {
          const prevCycle = cycles[cycles.length - 2];
          const prevSeg = prevCycle.segments[segmentKind];
          if (prevSeg) {
            diffMs = duration - prevSeg.durationMs;
          }
        }
      }

      const row = el('div', { class: 'log-entry' }, [
        el('div', { class: 'log-entry-time' }, formatTime(ev.ts)),
        el('div', { class: 'log-entry-kind' }, EVENT_LABELS[ev.type] || ev.type),
        el('div', { class: 'log-entry-duration' }, duration ? formatDuration(duration) : '–'),
      ]);

      if (diffMs !== null) {
        const diffEl = el('div', { class: 'log-entry-diff' });
        const diffSec = Math.round(diffMs / 1000);
        const prefix = diffSec > 0 ? '+' : '';
        diffEl.textContent = `${prefix}${diffSec}s`;
        diffEl.dataset.faster = diffSec < 0 ? 'true' : diffSec > 0 ? 'false' : 'none';
        row.appendChild(diffEl);
      }

      logList.insertBefore(row, logList.firstChild);
    }
    logList.scrollTop = 0;
  }

  await loadActiveSession();

  return () => {};
}

function segmentKindFromPair(a, b) {
  if (a === 'up' && b === 'pause') return SEGMENT_KINDS.UP;
  if (a === 'pause' && b === 'down') return SEGMENT_KINDS.TOP_REST;
  if (a === 'down' && b === 'pause') return SEGMENT_KINDS.DOWN;
  if (a === 'pause' && b === 'up') return SEGMENT_KINDS.BOTTOM_REST;
  return null;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  if (ms < 1000) return `${ms} ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) {
    return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${totalSec}s`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}