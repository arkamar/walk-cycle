import { el, toast } from '../ui.js';
import { getCompetitionGoal } from './settings.js';
import {
  STATES,
  EVENTS,
  nextState,
  stateFromEvents,
  stateLabel,
  buttonStatesFor,
} from '../stateMachine.js';
import {
  addEvent,
  createSession,
  deleteEvent,
  getCurrentSession,
  listEventsBySession,
  resumeSession,
  stopSession,
} from '../db.js';
import {
  formatLive,
  formatDuration,
} from '../analytics.js';
import { renderLogEntries } from '../sessionLog.js';

function getGoalDeadlineInfo(endTime) {
  const now = new Date();
  const [h, m] = endTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target < now) target.setDate(target.getDate() + 1);
  return { target, diffMs: target - now };
}

const BUTTONS = [
  { kind: EVENTS.UP, label: 'Up', icon: '▲' },
  { kind: EVENTS.PAUSE, label: 'Pause', icon: '❚❚' },
  { kind: EVENTS.DOWN, label: 'Down', icon: '▼' },
  { kind: 'stop', label: 'Stop', icon: '■' },
];

const EVENT_LABELS = {
  [EVENTS.UP]: 'Up',
  [EVENTS.PAUSE]: 'Pause',
  [EVENTS.DOWN]: 'Down',
  stop: 'Stop',
};

export async function renderTracker(target) {
  let session = null;
  let events = [];
  let state = STATES.IDLE;
  let timerInterval = null;
  let lastEventTs = null;
  let isProcessing = false;

  const stateLabelEl = el('div', { class: 'tracker-mini-state' }, 'Ready');
  const cycleCountEl = el('div', { class: 'tracker-mini-cycles' }, '');
  const goalProgressEl = el('div', { class: 'tracker-goal-progress', style: { display: 'none' } }, '');
  const hintEl = el('div', { class: 'tracker-hint', style: { display: 'none' } }, '');

  const buttonNodes = {};
  const actionGrid = el('div', { class: 'action-buttons' });
  for (const b of BUTTONS) {
    let onClick;
    if (b.kind === 'stop') {
      onClick = onStopSession;
    } else {
      onClick = () => onPress(b.kind);
    }
    const btn = el(
      'button',
      {
        class: 'action-btn',
        type: 'button',
        dataset: { kind: b.kind },
        onClick,
      },
      [
        el('span', { class: 'action-icon' }, b.icon),
        el('span', {}, b.label),
      ]
    );
    buttonNodes[b.kind] = btn;
    actionGrid.appendChild(btn);
  }

  const undoBtn = el('button', {
    class: 'btn',
    type: 'button',
    textContent: 'Undo',
    onClick: onUndo,
    style: { marginLeft: 'auto' },
  });

  const logHeader = el('div', { class: 'log-header' }, [
    'Session log',
    undoBtn,
  ]);
  const logList = el('div', { class: 'log-list' });
  const logCard = el('div', { class: 'card log-card', style: { overflowY: 'auto' } }, [logHeader, logList]);

  target.appendChild(
    el('div', { class: 'tracker' }, [
      stateLabelEl,
      cycleCountEl,
      goalProgressEl,
      actionGrid,
      hintEl,
      logCard,
    ])
  );

  async function loadActiveSession() {
    const current = await getCurrentSession();
    session = current;

    if (!session) {
      events = [];
      state = STATES.IDLE;
      lastEventTs = null;
      render();
      renderLog();
      return;
    }

    events = (await listEventsBySession(session.id)).filter(e => e.type !== 'session_stopped');
    for (let i = 0; i < events.length - 1; i++) {
      events[i].nextTs = events[i + 1].ts;
    }
    if (events.length > 0) {
      const allEvents = await listEventsBySession(session.id);
      const stoppedEvent = allEvents.findLast(e => e.type === 'session_stopped');
      events[events.length - 1].nextTs = stoppedEvent?.ts || Date.now();
    }
    state = stateFromEvents(events);
    lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;
    render();
    renderLog();

    renderGoalProgress();
    if (!session.isStopped) {
      startTimer();
    }
  }

  function onCurrentSessionChanged() {
    loadActiveSession();
  }

  window.addEventListener('current-session-changed', onCurrentSessionChanged);

  async function onUndo() {
    if (events.length === 0) return;
    const lastEvent = events[events.length - 1];
    if (confirm(`Undo last ${lastEvent.type}?`)) {
      await deleteEvent(lastEvent.id);
      events.pop();
      state = stateFromEvents(events);
      lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;
      if (events.length > 0) {
        events[events.length - 1].nextTs = Date.now();
      }
      render();
      renderLog();
      renderGoalProgress();
    }
  }

  async function onStopSession() {
    if (isProcessing) return;
    isProcessing = true;
    try {
      if (!session) {
        toast('No active session');
        return;
      }
      if (session.isStopped) {
        const resumed = await resumeSession(session.id);
        if (!resumed) {
          toast('No session to resume');
          return;
        }
        session = resumed;
        events = (await listEventsBySession(session.id)).filter(e => e.type !== 'session_stopped');
        for (let i = 0; i < events.length - 1; i++) {
          events[i].nextTs = events[i + 1].ts;
        }
        if (events.length > 0) {
          events[events.length - 1].nextTs = Date.now();
        }
        state = stateFromEvents(events);
        lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;
        toast('Session resumed');
        render();
        renderLog();
        renderGoalProgress();
        startTimer();
      } else {
        stopIntervalTimer();
        await stopSession(session.id);
        session.isStopped = true;
        if (events.length > 0) {
          events[events.length - 1].nextTs = Date.now();
        }
        toast('Session stopped');
        render();
        renderLog();
        renderGoalProgress();
      }
    } finally {
      isProcessing = false;
    }
  }

  async function onPress(kind) {
    if (!session) {
      const id = await createSession();
      session = { id, isStopped: false, createdAt: Date.now() };
      events = [];
      state = STATES.IDLE;
      lastEventTs = null;
      const ev = await addEvent({ sessionId: id, type: kind });
      events.push(ev);
      state = nextState(state, kind);
      lastEventTs = ev.ts;
      toast('Session started');
      render();
      renderLog();
      renderGoalProgress();
      startTimer();
      return;
    }
    if (session.isStopped) {
      toast('Session is stopped. Resume to continue.');
      return;
    }

    const ns = nextState(state, kind);
    if (!ns) {
      if (kind === EVENTS.DOWN || kind === EVENTS.UP) {
        const pauseEv = await addEvent({ sessionId: session.id, type: EVENTS.PAUSE });
        events.push(pauseEv);
        const newState = nextState(state, EVENTS.PAUSE);
        if (newState) state = newState;
        lastEventTs = pauseEv.ts;

        const newEv = await addEvent({ sessionId: session.id, type: kind });
        events.push(newEv);
        state = nextState(state, kind);
        lastEventTs = newEv.ts;

        await renderAndContinue(kind);
        return;
      } else {
        toast('Not allowed in current state');
        return;
      }
    }

    const newEv = await addEvent({ sessionId: session.id, type: kind });
    events.push(newEv);
    state = ns;
    lastEventTs = newEv.ts;

    await renderAndContinue(kind);
  }

  async function renderAndContinue() {
    render();
    renderLog();
    renderGoalProgress();
    startTimer();
  }

  function renderGoalProgress() {
    const goal = getCompetitionGoal();
    if (goal && session) {
      goalProgressEl.style.display = '';
      let parts = [];
      let status = '';

      const deadlineDiffMs = goal.endTime ? getGoalDeadlineInfo(goal.endTime).diffMs : null;

      if (goal.ups) {
        const completedUps = countCompletedUps();
        const remaining = goal.ups - completedUps;
        if (remaining > 0) {
          parts.push(`${remaining} up${remaining === 1 ? '' : 's'}`);

          if (deadlineDiffMs != null && completedUps >= 2 && !session.isStopped) {
            const { avg, trend } = calcCycleTrend();
            if (avg > 0 && deadlineDiffMs > 0) {
              const projected = avg + trend * (remaining - 1) * 0.5;
              const requiredPerUp = deadlineDiffMs / remaining;
              const diff = projected - requiredPerUp;
              if (diff >= -requiredPerUp * 0.05) {
                const ahead = requiredPerUp - projected;
                status = ahead > 0 ? `+${formatDuration(ahead)}` : 'on target';
              } else {
                status = `-${formatDuration(Math.abs(diff))}`;
              }
            }
          }
        } else if (remaining < 0) {
          parts.push(`${-remaining} over`);
        }
      }

      if (deadlineDiffMs != null) {
        if (deadlineDiffMs > 0) {
          parts.push(formatLive(deadlineDiffMs));
        } else {
          parts.push('time up');
        }
      }

      if (parts.length > 0) {
        const display = status ? `${parts.join(' · ')} (${status})` : parts.join(' · ');
        goalProgressEl.textContent = display;
      } else {
        goalProgressEl.style.display = 'none';
      }
    } else {
      goalProgressEl.style.display = 'none';
    }
  }

  async function render() {
    stateLabelEl.textContent = events.length > 0 ? stateLabel(state) : 'Ready';

    const upCount = events.filter(e => e.type === EVENTS.UP).length;
    const sessionName = session?.name ? `${session.name} · ` : '';
    cycleCountEl.textContent = (session || events.length > 0) ? `${sessionName}Cycle ${upCount}` : '';

    const btnStates = buttonStatesFor({ session, events });

    for (const b of BUTTONS) {
      if (b.kind === 'stop') continue;
      const node = buttonNodes[b.kind];
      const s = btnStates[b.kind];
      node.disabled = !s.enabled;
      node.dataset.active = s.enabled ? 'true' : 'false';
    }

    undoBtn.style.display = (session || events.length > 0) ? 'inline-block' : 'none';

    const stopNode = buttonNodes['stop'];
    stopNode.disabled = !btnStates.stop.enabled;
    stopNode.style.display = '';
    stopNode.dataset.active = btnStates.stop.enabled ? 'true' : 'false';
    stopNode.querySelector('.action-icon').textContent =
      btnStates.stop.label === 'Resume' ? '▶' : '■';
    stopNode.querySelector('span:last-child').textContent = btnStates.stop.label;
  }

  function renderLog() {
    for (let i = 0; i < events.length - 1; i++) {
      events[i].nextTs = events[i + 1].ts;
    }
    if (events.length > 0 && session) {
      events[events.length - 1].nextTs = Date.now();
    }

    renderLogEntries(logList, events, {
      isRunning: session && !session.isStopped,
      eventLabels: EVENT_LABELS,
    });
  }

  function updateLiveTimer() {
    if (!session || !lastEventTs || events.length === 0) return;

    const firstRow = logList.firstChild;
    if (!firstRow) return;

    const startTs = events[events.length - 1].ts;
    const now = Date.now();
    const elapsed = now - startTs;

    const durationEl = firstRow.querySelector('.log-entry-duration');
    if (durationEl) {
      durationEl.textContent = formatLive(elapsed);
    }
  }

  function startTimer() {
    stopIntervalTimer();
    timerInterval = setInterval(() => {
      updateLiveTimer();
      renderGoalProgress();
    }, 250);
  }

  function stopIntervalTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  await loadActiveSession();

  function calcCycleTrend() {
    const upEvents = events.filter(e => e.type === EVENTS.UP);
    if (upEvents.length < 2) return { avg: 0, trend: 0, trendDir: 'flat' };

    const recent = upEvents.slice(-5);
    const cycles = [];
    for (let i = 1; i < recent.length; i++) {
      cycles.push(recent[i].ts - recent[i-1].ts);
    }
    if (cycles.length < 2) return { avg: 0, trend: 0, trendDir: 'flat' };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < cycles.length; i++) {
      sumX += i;
      sumY += cycles[i];
      sumXY += i * cycles[i];
      sumX2 += i * i;
    }
    const n = cycles.length;
    const slope = sumX2 !== sumX * sumX ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;

    const avg = cycles.reduce((a, b) => a + b, 0) / n;
    let trendDir = 'flat';
    if (slope > 500) trendDir = 'slower';
    else if (slope < -500) trendDir = 'faster';

    return { avg, trend: slope, trendDir };
  }

  function countCompletedUps() {
    const upEvents = events.filter(e => e.type === EVENTS.UP);
    let completed = 0;
    for (let i = 0; i < upEvents.length; i++) {
      const upEv = upEvents[i];
      const nextEv = events.find(e => e.ts > upEv.ts);
      if (nextEv && nextEv.type === EVENTS.PAUSE) {
        completed++;
      }
    }
    return completed;
  }

  return () => {
    stopIntervalTimer();
    window.removeEventListener('current-session-changed', onCurrentSessionChanged);
  };
}
