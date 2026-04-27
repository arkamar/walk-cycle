import { el, toast, formatTime } from '../ui.js';
import { getCompetitionGoal } from './settings.js';
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
  getLatestEndedSession,
  getPausedSession,
  resumeSession,
  pauseSession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatLive,
  formatDuration,
} from '../analytics.js';

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

  const buttonNodes = {};
  const actionGrid = el('div', { class: 'action-buttons' });
  for (const b of BUTTONS) {
    let onClick;
    if (b.kind === 'stop') {
      onClick = onStopSession;
    } else if (b.kind === 'start') {
      onClick = onStartSession;
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

  const logHeader = el('div', { class: 'log-header' }, 'Session log');
  const logList = el('div', { class: 'log-list' });
  const logCard = el('div', { class: 'card log-card', style: { overflowY: 'auto' } }, [logHeader, logList]);

  target.appendChild(
    el('div', { class: 'tracker' }, [
      stateLabelEl,
      cycleCountEl,
      goalProgressEl,
      actionGrid,
      logCard,
    ])
  );

  async function loadActiveSession() {
    const active = await getActiveSession();
    const paused = await getPausedSession();
    
    if (active) {
      session = active;
    } else if (paused) {
      session = paused;
    } else {
      session = null;
    }
    
    if (!session) {
      events = [];
      state = STATES.IDLE;
      lastEventTs = null;
      render();
      renderLog();
      return;
    }
    
    events = await listEventsBySession(session.id);
    for (let i = 0; i < events.length - 1; i++) {
      events[i].nextTs = events[i + 1].ts;
    }
    if (events.length > 0) {
      events[events.length - 1].nextTs = session.pausedAt || Date.now();
    }
    state = stateFromEvents(events);
    lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;
    render();
    renderLog();
    
    if (active) {
      renderGoalProgress();
      startTimer();
    }
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
    lastEventTs = null;
    toast('Session started');
    render();
    window.dispatchEvent(new Event('session-started'));
  }

  async function onStopSession() {
    if (isProcessing) return;
    isProcessing = true;
    try {
      if (!session || session.pausedAt) {
        const paused = await getPausedSession();
        if (!paused) {
          toast('No session to resume');
          return;
        }
        const resumed = await resumeSession(paused.id);
        session = resumed;
        events = await listEventsBySession(session.id);
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
        const paused = await pauseSession(session.id);
        if (events.length > 0) {
          events[events.length - 1].nextTs = paused.pausedAt;
        }
        session = null;
        state = STATES.IDLE;
        lastEventTs = null;
        toast('Session paused');
        render();
        renderLog();
        window.dispatchEvent(new Event('session-ended'));
      }
    } finally {
      isProcessing = false;
    }
  }

  async function onPress(kind) {
    if (!session) {
      await onStartSession();
      const ev = await addEvent({ sessionId: session.id, type: kind });
      events.push(ev);
      state = nextState(state, kind);
      lastEventTs = ev.ts;
      render();
      renderLog();
      renderGoalProgress();
      startTimer();
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

    const prevTs = lastEventTs;
    const newEv = await addEvent({ sessionId: session.id, type: kind });
    events.push(newEv);
    state = ns;
    lastEventTs = newEv.ts;

    await renderAndContinue(kind);
  }

  async function renderAndContinue(kind) {
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
      
      if (goal.ups) {
        const completedUps = countCompletedUps(goal.ups);
        const remaining = goal.ups - completedUps;
        if (remaining > 0) {
          parts.push(`${remaining} up${remaining === 1 ? '' : 's'}`);
          
          if (goal.endTime && completedUps >= 2 && session && !session.pausedAt) {
            const now = new Date();
            const [h, m] = goal.endTime.split(':').map(Number);
            const target = new Date(now);
            target.setHours(h, m, 0, 0);
            if (target < now) target.setDate(target.getDate() + 1);
            const timeLeftMs = target - now;
            
            const { avg, trend, trendDir } = calcCycleTrend();
            if (avg > 0 && timeLeftMs > 0) {
              const projected = avg + trend * (remaining - 1) * 0.5;
              const requiredPerUp = timeLeftMs / remaining;
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
      
      if (goal.endTime) {
        const now = new Date();
        const [h, m] = goal.endTime.split(':').map(Number);
        const target = new Date(now);
        target.setHours(h, m, 0, 0);
        if (target < now) target.setDate(target.getDate() + 1);
        const diffMs = target - now;
        if (diffMs > 0) {
          parts.push(formatLive(diffMs));
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
    cycleCountEl.textContent = (session || events.length > 0) ? `Cycle ${upCount}` : '';

    const goal = getCompetitionGoal();
    if (goal && (session || events.length > 0)) {
      goalProgressEl.style.display = '';
      let parts = [];
      
      if (goal.ups) {
        const remaining = goal.ups - upCount;
        if (remaining > 0) {
          parts.push(`${remaining} up`);
        } else if (remaining < 0) {
          parts.push(`${-remaining} over`);
        }
      }
      
      if (goal.endTime) {
        const now = new Date();
        const [h, m] = goal.endTime.split(':').map(Number);
        const target = new Date(now);
        target.setHours(h, m, 0, 0);
        if (target < now) target.setDate(target.getDate() + 1);
        const diffMs = target - now;
        if (diffMs > 0) {
          parts.push(formatLive(diffMs));
        } else {
          parts.push('time up');
        }
      }
      
      if (parts.length > 0) {
        goalProgressEl.textContent = parts.join(' · ');
      } else {
        goalProgressEl.style.display = 'none';
      }
    } else {
      goalProgressEl.style.display = 'none';
    }

    const hasPausedData = !session && events.length > 0;
    const allowed = (session || hasPausedData) ? [...allowedEvents(state)] : ['up'];
    if (session || hasPausedData) {
      if (state === STATES.GOING_UP) allowed.push('down');
      if (state === STATES.AT_TOP) allowed.push('down');
      if (state === STATES.GOING_DOWN) allowed.push('up');
      if (state === STATES.AT_BOTTOM) allowed.push('up');
    }
    const allowedSet = new Set(allowed);
    for (const b of BUTTONS) {
      if (b.kind === 'stop') continue;
      const node = buttonNodes[b.kind];
      const isAllowed = allowedSet.has(b.kind);
      node.disabled = !isAllowed;
      node.dataset.active = isAllowed ? 'true' : 'false';
    }

    const isRunning = session && !session.pausedAt;
    const isPaused = session && session.pausedAt;
    
    const stopNode = buttonNodes['stop'];
    if (isRunning) {
      stopNode.disabled = false;
      stopNode.style.display = '';
      stopNode.dataset.active = 'true';
      stopNode.querySelector('.action-icon').textContent = '■';
      stopNode.querySelector('span:last-child').textContent = 'Pause';
    } else if (isPaused || hasPausedData) {
      stopNode.disabled = false;
      stopNode.style.display = '';
      stopNode.dataset.active = 'true';
      stopNode.querySelector('.action-icon').textContent = '▶';
      stopNode.querySelector('span:last-child').textContent = 'Resume';
    } else {
      stopNode.disabled = true;
      stopNode.style.display = '';
      stopNode.dataset.active = 'false';
      stopNode.querySelector('.action-icon').textContent = '■';
      stopNode.querySelector('span:last-child').textContent = 'Stop';
    }
  }

  function renderLog() {
    logList.innerHTML = '';
    
    const cycleForEvent = (idx) => {
      let cycle = 0;
      for (let j = 0; j <= idx; j++) {
        if (events[j].type === EVENTS.UP) cycle++;
      }
      return cycle;
    };
    
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      let displayDuration = '–';
      let diffStr = '';
      const thisCycle = cycleForEvent(i);
      
      const thisDuration = i < events.length - 1 ? events[i + 1].ts - ev.ts : null;
      
      const isRunning = session && !session.pausedAt;
      const isPaused = session && session.pausedAt;
      
      if (isRunning && i === events.length - 1) {
        displayDuration = '00:00';
      } else if (thisDuration) {
        displayDuration = formatLive(thisDuration);
      } else if (isPaused || events.length > 0) {
        displayDuration = '–';
      } else {
        displayDuration = '–';
      }
      
      const prevSame = findPrevSameType(i, ev.type);
      if (prevSame && i < events.length - 1 && prevSame.nextTs) {
        const prevDuration = prevSame.nextTs - prevSame.ts;
        const diffMs = thisDuration - prevDuration;
        if (diffMs !== 0) {
          const sign = diffMs > 0 ? '+' : '-';
          diffStr = sign + formatLive(Math.abs(diffMs));
        }
      }
      
      const row = el('div', { class: 'log-entry' }, [
        el('div', { class: 'log-entry-cycle' }, thisCycle > 0 ? `#${thisCycle}` : ''),
        el('div', { class: 'log-entry-time' }, formatTime(ev.ts)),
        el('div', { class: 'log-entry-kind' }, EVENT_LABELS[ev.type] || ev.type),
      ]);
      
      if (diffStr) {
        const diffEl = el('div', { class: 'log-entry-diff' }, diffStr);
        diffEl.dataset.faster = diffStr.startsWith('+') ? 'false' : 'true';
        row.appendChild(diffEl);
      } else {
        row.appendChild(el('div', { class: 'log-entry-diff' }));
      }
      
      row.appendChild(el('div', { class: 'log-entry-duration' }, displayDuration));
      
      logList.appendChild(row);
    }
    
    for (let i = 0; i < events.length - 1; i++) {
      events[i].nextTs = events[i + 1].ts;
    }
    if (events.length > 0 && session) {
      events[events.length - 1].nextTs = Date.now();
    }
  }
  
  function findPrevSameType(currentIndex, type) {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (events[i].type === type && events[i].nextTs) {
        return events[i];
      }
    }
    return null;
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

  function calcAvgCycleTime() {
    const upEvents = events.filter(e => e.type === EVENTS.UP);
    if (upEvents.length < 2) return 0;
    
    let totalMs = 0;
    for (let i = 1; i < upEvents.length; i++) {
      const prev = upEvents[i-1];
      const curr = upEvents[i];
      if (curr.ts && prev.ts) {
        totalMs += curr.ts - prev.ts;
      }
    }
    const cycles = upEvents.length - 1;
    return cycles > 0 ? totalMs / cycles : 0;
  }

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

  function countCompletedUps(targetUps) {
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
  };
}
