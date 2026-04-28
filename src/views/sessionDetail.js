import { el, formatDateTime, toast, formatTime } from '../ui.js';
import { createTrendChart, buildCycleDatasets } from '../chart.js';
import {
  getSession,
  listEventsBySession,
  deleteSession,
  getActiveSession,
  setCurrentSession,
  stopSession,
  updateSession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  aggregateBySegmentKind,
  formatDuration,
  formatLive,
  SEGMENT_KINDS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
} from '../analytics.js';
import { sessionStatus } from '../stateMachine.js';

export async function renderSessionDetail(target, { id }) {
  const session = await getSession(id);
  if (!session) {
    target.appendChild(
      el('div', { class: 'card' }, [
        el('h2', {}, 'Session not found'),
        el(
          'a',
          { class: 'btn', href: '#/sessions' },
          '← Back to sessions'
        ),
      ])
    );
    return;
  }

  const events = await listEventsBySession(id);
  const segments = segmentsFromEvents(events);
  const cycles = cyclesFromSegments(segments, true);
  const { byKind } = aggregateBySegmentKind(segments);

  const EVENT_LABELS = {
    up: 'Up',
    pause: 'Pause',
    down: 'Down',
  };

  // Build nextTs for each event (for duration calculation)
  for (let i = 0; i < events.length - 1; i++) {
    events[i].nextTs = events[i + 1].ts;
  }
  if (events.length > 0) {
    events[events.length - 1].nextTs = session.stoppedAt || session.endedAt || events[events.length - 1].ts;
  }

  function findPrevSameType(idx, type, evts) {
    for (let i = idx - 1; i >= 0; i--) {
      if (evts[i].type === type && evts[i].nextTs) return evts[i];
    }
    return null;
  }

  // Any session that isn't already the single current/active one can be
  // promoted to current. For stopped sessions the action is labeled
  // "Resume" (familiar wording, identical mechanic). For other non-current
  // sessions (e.g. an old active that lost its 'current' status, or a
  // future ended session) it shows as "Set as current".
  // setCurrentSession() is atomic: it stops any other active session and
  // clears stoppedAt/endedAt on the target in a single transaction.
  const currentActive = await getActiveSession();
  const isCurrent = currentActive && currentActive.id === id;
  const promoteLabel = sessionStatus(session) === 'stopped' ? 'Resume' : 'Set as current';

  const headerRow = el('div', { class: 'row between' }, [
    el(
      'a',
      { class: 'btn btn-ghost', href: '#/sessions' },
      '← Back'
    ),
    isCurrent ? el(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: async () => {
          await stopSession(id);
          toast('Session stopped');
          // Re-render the detail view in place so the button flips to
          // "Resume" without yanking the user back to the tracker.
          target.innerHTML = '';
          renderSessionDetail(target, { id });
        },
      },
      'Stop'
    ) : el(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: async () => {
          if (currentActive && currentActive.id !== id) {
            if (!confirm(
              'Another session is currently running. Stop it and switch to this one?'
            )) return;
          }
          await setCurrentSession(id);
          toast(promoteLabel === 'Resume' ? 'Session resumed' : 'Session is now current');
          window.location.hash = '/';
        },
      },
      promoteLabel
    ),
    el(
      'button',
      {
        class: 'btn btn-danger',
        type: 'button',
        onClick: async () => {
          if (!confirm('Delete this session and all its events?')) return;
          await deleteSession(id);
          toast('Session deleted');
          window.location.hash = '/sessions';
        },
      },
      'Delete'
    ),
  ]);

  const headerCard = el('div', { class: 'card' }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' } }, [
      el('input', {
        type: 'text',
        placeholder: 'Session name',
        value: session.name || '',
        style: { flex: 1, fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.25rem 0.5rem', background: 'var(--bg-elev)', color: 'var(--fg)' },
        onChange: async (e) => {
          await updateSession(id, { name: e.target.value });
          session.name = e.target.value;
        },
      }),
    ]),
    el('h2', { style: { fontSize: '1rem', fontWeight: 'normal', color: 'var(--muted)' } }, formatDateTime(session.startedAt)),
    el('p', { class: 'muted' }, [
      sessionStatus(session) === 'ended'
        ? `Ended ${formatDateTime(session.endedAt)} · `
        : sessionStatus(session) === 'stopped'
          ? `Stopped ${formatDateTime(session.stoppedAt)} · `
          : isCurrent
            ? 'Current · '
            : 'Active · ',
      `${cycles.length} ${cycles.length === 1 ? 'cycle' : 'cycles'} · ${events.length} presses`,
    ]),
  ]);

  // Session log
  const logCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Session log'),
    el('div', { class: 'log-list' }),
  ]);
  const logList = logCard.querySelector('.log-list');
  
  const cycleCounts = [];
  let cycleNum = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === 'up') cycleNum++;
    cycleCounts[i] = cycleNum;
  }
  
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    let diffStr = '';
    const thisDuration = ev.nextTs ? ev.nextTs - ev.ts : null;
    
    const prevSame = findPrevSameType(i, ev.type, events);
    if (prevSame && prevSame.nextTs) {
      const prevDuration = prevSame.nextTs - prevSame.ts;
      if (thisDuration && prevDuration) {
        const diffMs = thisDuration - prevDuration;
        if (diffMs !== 0) {
          const sign = diffMs > 0 ? '+' : '-';
          diffStr = sign + formatLive(Math.abs(diffMs));
        }
      }
    }
    
    const thisCycle = cycleCounts[i];
    
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
    
    row.appendChild(el('div', { class: 'log-entry-duration' }, thisDuration ? formatLive(thisDuration) : '–'));
    logList.appendChild(row);
  }

  // Per-segment averages
  const statsCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Per-segment averages'),
    el(
      'div',
      { class: 'stat-grid' },
      Object.values(SEGMENT_KINDS).map((k) =>
        el(
          'div',
          { class: 'stat', style: { borderLeft: `4px solid ${SEGMENT_COLORS[k]}` } },
          [
            el('div', { class: 'label' }, SEGMENT_LABELS[k]),
            el(
              'div',
              { class: 'value' },
              byKind[k].count ? formatDuration(byKind[k].avgMs) : '–'
            ),
            el(
              'div',
              { class: 'meta muted' },
              byKind[k].count
                ? `min ${formatDuration(byKind[k].minMs)} · max ${formatDuration(byKind[k].maxMs)}`
                : 'no data'
            ),
          ]
        )
      )
    ),
  ]);

// Trend chart from cycles (same as stats view cycles mode)
  const cycleChartCanvas = el('canvas');
  
  // Trend chart card
  const trendsCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Trend'),
    el('div', { class: 'chart-wrap' }, [
      cycleChartCanvas,
    ]),
  ]);

  if (cycles.length > 0) {
    const { labels, datasets } = buildCycleDatasets(cycles);
    createTrendChart(cycleChartCanvas, labels, datasets);
  }

  // Per-cycle table
  const cyclesCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Cycles'),
  ]);

  if (!cycles.length && events.filter(e => e.type === 'up').length === 0) {
    cyclesCard.appendChild(
      el('p', { class: 'muted' }, 'No cycles yet.')
    );
  } else {
    const list = el('div', { class: 'list' });
    cyclesCard.appendChild(list);
    for (const c of cycles) {
      list.appendChild(
        el('div', { class: 'list-item' }, [
          el('div', {}, [
            el('div', {}, `Cycle ${c.index + 1}`),
            el(
              'div',
              { class: 'meta' },
              [
                `up ${formatDuration(c.segments[SEGMENT_KINDS.UP]?.durationMs ?? 0)}`,
                `top ${formatDuration(c.segments[SEGMENT_KINDS.TOP_REST]?.durationMs ?? 0)}`,
                `down ${formatDuration(c.segments[SEGMENT_KINDS.DOWN]?.durationMs ?? 0)}`,
                `bot ${formatDuration(c.segments[SEGMENT_KINDS.BOTTOM_REST]?.durationMs ?? 0)}`,
              ].join(' · ')
            ),
          ]),
          el('div', { class: 'meta' }, formatDuration(c.totalMs)),
        ])
      );
    }
    
    // Show ongoing partial cycle (last Up without full cycle)
    const upEvents = events.filter(e => e.type === 'up');
    if (upEvents.length > cycles.length) {
      const lastUp = upEvents[upEvents.length - 1];
      const lastUpIdx = events.indexOf(lastUp);
      let parts = [];
      let partialDuration = 0;
      for (let i = lastUpIdx + 1; i < events.length; i++) {
        const seg = events[i];
        const segType = seg.type === 'pause' ? (i === lastUpIdx + 1 ? 'top' : 'bot') : 'down';
        const dur = seg.ts - events[i-1].ts;
        parts.push(`${segType} ${formatDuration(dur)}`);
        partialDuration += dur;
      }
      if (lastUp.nextTs) {
        partialDuration = lastUp.nextTs - lastUp.ts;
      }
      list.appendChild(
        el('div', { class: 'list-item', style: { opacity: 0.7 } }, [
          el('div', {}, [
            el('div', {}, `Cycle ${upEvents.length} (partial)`),
            el('div', { class: 'meta' }, parts.join(' · ') || 'in progress'),
          ]),
          el('div', { class: 'meta' }, partialDuration ? formatDuration(partialDuration) : '–'),
        ])
      );
    }
  }

  target.appendChild(el('div', {}, [headerRow, headerCard, logCard, statsCard, trendsCard, cyclesCard]));
}