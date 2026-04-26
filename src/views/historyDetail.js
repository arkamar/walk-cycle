import { el, formatDateTime, toast } from '../ui.js';
import {
  getSession,
  listEventsBySession,
  deleteSession,
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

export async function renderHistoryDetail(target, { id }) {
  const session = await getSession(id);
  if (!session) {
    target.appendChild(
      el('div', { class: 'card' }, [
        el('h2', {}, 'Session not found'),
        el(
          'a',
          { class: 'btn', href: '#/history' },
          '← Back to history'
        ),
      ])
    );
    return;
  }

  const events = await listEventsBySession(id);
  const segments = segmentsFromEvents(events);
  const cycles = cyclesFromSegments(segments);
  const { byKind } = aggregateBySegmentKind(segments);

  const headerRow = el('div', { class: 'row between' }, [
    el(
      'a',
      { class: 'btn btn-ghost', href: '#/history' },
      '← Back'
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
          window.location.hash = '/history';
        },
      },
      'Delete'
    ),
  ]);

  const headerCard = el('div', { class: 'card' }, [
    el('h2', {}, formatDateTime(session.startedAt)),
    el('p', { class: 'muted' }, [
      session.endedAt
        ? `Ended ${formatDateTime(session.endedAt)} · `
        : 'Still active · ',
      `${cycles.length} ${cycles.length === 1 ? 'cycle' : 'cycles'} · ${events.length} presses`,
    ]),
  ]);

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

  // Per-cycle table
  const cyclesCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Cycles'),
  ]);

  if (!cycles.length) {
    cyclesCard.appendChild(
      el('p', { class: 'muted' }, 'No completed cycles yet.')
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
  }

  target.appendChild(el('div', {}, [headerRow, headerCard, statsCard, cyclesCard]));
}
