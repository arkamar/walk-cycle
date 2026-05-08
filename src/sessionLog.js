import { el, formatTime } from './ui.js';
import { formatLive, findPrevSameType } from './analytics.js';

const DEFAULT_EVENT_LABELS = {
  up: 'Up',
  pause: 'Pause',
  down: 'Down',
};

export function renderLogEntries(container, events, options = {}) {
  const {
    isRunning = false,
    eventLabels = DEFAULT_EVENT_LABELS,
  } = options;

  container.innerHTML = '';

  const cycleCounts = [];
  let cycleNum = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === 'up') cycleNum++;
    cycleCounts[i] = cycleNum;
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    let diffStr = '';
    const thisCycle = cycleCounts[i];

    const thisDuration = i < events.length - 1
      ? events[i + 1].ts - ev.ts
      : (ev.nextTs ? ev.nextTs - ev.ts : null);

    let displayDuration;
    if (isRunning && i === events.length - 1) {
      displayDuration = '00:00';
    } else if (thisDuration) {
      displayDuration = formatLive(thisDuration);
    } else {
      displayDuration = '–';
    }

    const prevSame = findPrevSameType(i, ev.type, events);
    if (prevSame && i < events.length - 1 && prevSame.nextTs) {
      const prevDuration = prevSame.nextTs - prevSame.ts;
      if (thisDuration) {
        const diffMs = thisDuration - prevDuration;
        if (diffMs !== 0) {
          const sign = diffMs > 0 ? '+' : '-';
          diffStr = sign + formatLive(Math.abs(diffMs));
        }
      }
    }

    const row = el('div', { class: 'log-entry' }, [
      el('div', { class: 'log-entry-cycle' }, thisCycle > 0 ? `#${thisCycle}` : ''),
      el('div', { class: 'log-entry-time' }, formatTime(ev.ts)),
      el('div', { class: 'log-entry-kind' }, eventLabels[ev.type] || ev.type),
    ]);

    if (diffStr) {
      const diffEl = el('div', { class: 'log-entry-diff' }, diffStr);
      diffEl.dataset.faster = diffStr.startsWith('+') ? 'false' : 'true';
      row.appendChild(diffEl);
    } else {
      row.appendChild(el('div', { class: 'log-entry-diff' }));
    }

    row.appendChild(el('div', { class: 'log-entry-duration' }, displayDuration));

    container.appendChild(row);
  }
}
