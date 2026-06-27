import { el, formatTime } from './ui.js';
import { formatLive, findPrevSameType } from './analytics.js';

const DEFAULT_EVENT_LABELS = {
  up: 'Up',
  pause: 'Pause',
  down: 'Down',
};

export function enrichNextTs(events, lastNextTs = Date.now()) {
  for (let i = 0; i < events.length - 1; i++) {
    events[i].nextTs = events[i + 1].ts;
  }
  if (events.length > 0) {
    events[events.length - 1].nextTs = lastNextTs;
  }
}

function tsToDatetimeLocal(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function showEventEditor(ev, onSave) {
  const overlay = el('div', { class: 'event-editor-overlay' });

  const timeInput = el('input', {
    type: 'datetime-local',
    value: tsToDatetimeLocal(ev.ts),
    style: { width: '100%', boxSizing: 'border-box', fontSize: '1rem', padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--fg)' },
  });

  const card = el('div', { class: 'event-editor-card' }, [
    el('p', { style: { margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.95rem' } }, 'Edit event time'),
    timeInput,
    el('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' } }, [
      el('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => overlay.remove(),
      }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const val = timeInput.value;
          if (!val) return;
          const newTs = new Date(val).getTime();
          if (isNaN(newTs)) return;
          overlay.remove();
          onSave({ ts: newTs });
        },
      }, 'Save'),
    ]),
  ]);

  overlay.appendChild(card);
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  timeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      card.querySelector('.btn-primary').click();
    }
  });

  document.body.appendChild(overlay);
  timeInput.focus();
  timeInput.select();
}

export function renderLogEntries(container, events, options = {}) {
  const {
    isRunning = false,
    eventLabels = DEFAULT_EVENT_LABELS,
    onEdit,
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

    if (onEdit) {
      let timer = null;
      row.addEventListener('pointerdown', () => {
        timer = setTimeout(() => {
          timer = null;
          onEdit(ev);
        }, 500);
      });
      row.addEventListener('pointerup', () => {
        if (timer) { clearTimeout(timer); timer = null; }
      });
      row.addEventListener('pointerleave', () => {
        if (timer) { clearTimeout(timer); timer = null; }
      });
      row.addEventListener('pointercancel', () => {
        if (timer) { clearTimeout(timer); timer = null; }
      });
    }

    container.appendChild(row);
  }
}
