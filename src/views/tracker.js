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
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatLive,
} from '../analytics.js';

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

export async function renderTracker(target) {
  let session = null;
  let events = [];
  let state = STATES.IDLE;
  let timerInterval = null;
  let lastEventTs = null;

  const stateLabelEl = el('div', { class: 'tracker-mini-state' }, 'Ready');
  const cycleCountEl = el('div', { class: 'tracker-mini-cycles' }, '');
  const goalProgressEl = el('div', { class: 'tracker-goal-progress', style: { display: 'none' } }, '');

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
  
  const sessionControls = el('div', { class: 'session-controls' }, [startBtn]);
  
  const logHeader = el('div', { class: 'log-header' }, 'Session log');
  const logList = el('div', { class: 'log-list' });
  const logCard = el('div', { class: 'card log-card', style: { overflowY: 'auto' } }, [logHeader, logList]);

  target.appendChild(
    el('div', { class: 'tracker' }, [
      stateLabelEl,
      cycleCountEl,
      goalProgressEl,
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
      lastEventTs = null;
      render();
      return;
    }
    events = await listEventsBySession(session.id);
    for (let i = 0; i < events.length - 1; i++) {
      events[i].nextTs = events[i + 1].ts;
    }
    if (events.length > 0) {
      events[events.length - 1].nextTs = Date.now();
    }
    state = stateFromEvents(events);
    lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;
    render();
    renderLog();
    renderGoalProgress();
    startTimer();
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
  }

  async function onStopSession() {
    if (!session) {
      toast('No active session');
      return;
    }
    if (!confirm('Stop the current session?')) return;
    stopIntervalTimer();
    await endSession(session.id);
    session = null;
    events = [];
    state = STATES.IDLE;
    lastEventTs = null;
    toast('Session stopped');
    render();
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
      startTimer();
      return;
    }

    const ns = nextState(state, kind);
    if (!ns) {
      toast('Not allowed in current state');
      return;
    }

    const prevTs = lastEventTs;
    const newEv = await addEvent({ sessionId: session.id, type: kind });
    events.push(newEv);
    state = ns;
    lastEventTs = newEv.ts;

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
          
          if (goal.endTime && completedUps >= 2) {
            const now = new Date();
            const [h, m] = goal.endTime.split(':').map(Number);
            const target = new Date(now);
            target.setHours(h, m, 0, 0);
            if (target < now) target.setDate(target.getDate() + 1);
            const timeLeftMs = target - now;
            
            const avgCycle = calcAvgCycleTime();
            if (avgCycle > 0 && timeLeftMs > 0) {
              const requiredPerUp = timeLeftMs / remaining;
              if (avgCycle <= requiredPerUp) {
                status = 'on pace';
              } else {
                const needed = formatLive(avgCycle - requiredPerUp);
                status = `need -${needed}`;
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

  function render() {
    stateLabelEl.textContent = session ? stateLabel(state) : 'Ready';

    const upCount = events.filter(e => e.type === EVENTS.UP).length;
    cycleCountEl.textContent = session ? `Cycle ${upCount}` : '';

    const goal = getCompetitionGoal();
    if (goal && session) {
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

    const allowed = new Set(session ? allowedEvents(state) : []);
    for (const b of BUTTONS) {
      const node = buttonNodes[b.kind];
      const isAllowed = allowed.has(b.kind);
      node.disabled = !isAllowed;
      node.dataset.active = isAllowed ? 'true' : 'false';
    }

    startBtn.style.display = session ? 'none' : '';
  }

  function renderLog(prevToFreezeTs = null) {
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
      
      if (i === events.length - 1) {
        if (prevToFreezeTs) {
          displayDuration = formatLive(prevToFreezeTs - ev.ts);
        } else {
          displayDuration = '00:00';
        }
      } else {
        displayDuration = formatLive(thisDuration);
      }
      
      const prevSame = findPrevSameType(i, ev.type);
      if (prevSame && i < events.length - 1) {
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
    if (events.length > 0) {
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
