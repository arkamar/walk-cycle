import { el, formatDateTime, toast } from '../ui.js';
import { createTrendChart, buildCycleDatasets } from '../chart.js';
import {
  getSession,
  listEventsBySession,
  deleteSession,
  getCurrentSession,
  setCurrentSession,
  stopSession,
  resumeSession,
  updateSession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  aggregateBySegmentKind,
  formatDuration,
  SEGMENT_KINDS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
} from '../analytics.js';
import { sessionStatus } from '../stateMachine.js';
import { enrichNextTs, renderLogEntries } from '../sessionLog.js';

export async function renderSessionDetail(target, { id }) {
  const session = await getSession(id);
  if (!session) {
    target.appendChild(
      el('div', { class: 'card' }, [
        el('h2', {}, 'Session not found'),
        el(
          'a',
          { class: 'btn', href: '#/sessions' },
          '← Back to sessions',
        ),
      ]),
    );
    return;
  }

  const events = (await listEventsBySession(id)).filter(e => e.type !== 'session_stopped');
  const segments = segmentsFromEvents(events);
  const cycles = cyclesFromSegments(segments, true);
  const { byKind } = aggregateBySegmentKind(segments);

  const EVENT_LABELS = {
    up: 'Up',
    pause: 'Pause',
    down: 'Down',
  };

  let lastNextTs;
  if (events.length > 0) {
    const allEvents = await listEventsBySession(id);
    const stoppedEvent = allEvents.findLast(e => e.type === 'session_stopped');
    lastNextTs = stoppedEvent?.ts ?? events[events.length - 1].ts;
  }
  enrichNextTs(events, lastNextTs);

  const current = await getCurrentSession();
  const isCurrent = current && current.id === id;
  const promoteLabel = sessionStatus(session) === 'stopped' ? 'Resume' : 'Set as current';

  const headerRow = el('div', { class: 'row between' }, [
    el(
      'a',
      { class: 'btn btn-ghost', href: '#/sessions' },
      '← Back',
    ),
    isCurrent && !session.isStopped
      ? el(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: async () => {
            await stopSession(id);
            toast('Session stopped');
            target.innerHTML = '';
            renderSessionDetail(target, { id });
          },
        },
        'Stop',
      )
      : isCurrent && session.isStopped
        ? el(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onClick: async () => {
              await resumeSession(id);
              toast('Session resumed');
              target.innerHTML = '';
              renderSessionDetail(target, { id });
            },
          },
          'Resume',
        )
        : el(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onClick: async () => {
              await setCurrentSession(id);
              toast('Session is now current');
              window.location.hash = '/';
            },
          },
          promoteLabel,
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
      'Delete',
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
    el('h2', { style: { fontSize: '1rem', fontWeight: 'normal', color: 'var(--muted)' } }, formatDateTime(session.createdAt)),
    el('p', { class: 'muted' }, [
      sessionStatus(session) === 'stopped'
        ? `Stopped ${formatDateTime(events.length ? events[events.length - 1].nextTs : session.createdAt)} · `
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
  renderLogEntries(logList, events, { eventLabels: EVENT_LABELS });

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
              byKind[k].count ? formatDuration(byKind[k].avgMs) : '–',
            ),
            el(
              'div',
              { class: 'meta muted' },
              byKind[k].count
                ? `min ${formatDuration(byKind[k].minMs)} · max ${formatDuration(byKind[k].maxMs)}`
                : 'no data',
            ),
          ],
        ),
      ),
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
      el('p', { class: 'muted' }, 'No cycles yet.'),
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
              ].join(' · '),
            ),
          ]),
          el('div', { class: 'meta' }, formatDuration(c.totalMs)),
        ]),
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
        const dur = seg.ts - events[i - 1].ts;
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
        ]),
      );
    }
  }

  target.appendChild(el('div', {}, [headerRow, headerCard, logCard, statsCard, trendsCard, cyclesCard]));
}
