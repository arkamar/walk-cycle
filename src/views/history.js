import { el, formatDateTime, toast } from '../ui.js';
import { listSessions, listEventsBySession, deleteSession } from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatDuration,
} from '../analytics.js';

export async function renderHistory(target) {
  const heading = el('h2', {}, 'History');
  const subheading = el('p', { class: 'muted' }, 'Loading…');
  const list = el('div', { class: 'list' });
  target.appendChild(el('div', {}, [heading, subheading, list]));

  const sessions = await listSessions({ limit: 200 });

  if (!sessions.length) {
    subheading.textContent = '';
    list.appendChild(
      el('div', { class: 'empty' }, [
        el('p', {}, 'No sessions yet.'),
        el('p', { class: 'muted' }, 'Start tracking to see your history here.'),
      ])
    );
    return;
  }

  subheading.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;

  // Fetch summaries in parallel.
  const summaries = await Promise.all(
    sessions.map(async (s) => {
      const events = await listEventsBySession(s.id);
      const segments = segmentsFromEvents(events);
      const cycles = cyclesFromSegments(segments);
      const durationMs =
        (s.endedAt ?? (events.length ? events[events.length - 1].ts : s.startedAt)) -
        s.startedAt;
      return { session: s, cycleCount: cycles.length, durationMs };
    })
  );

  for (const { session: s, cycleCount, durationMs } of summaries) {
    const item = el('div', { class: 'list-item' }, [
      el('div', { style: { flex: 1 } }, [
        el('a', { href: `#/history/${s.id}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' } }, [
          el('div', {}, s.name || formatDateTime(s.startedAt)),
          el(
            'div',
            { class: 'meta' },
            s.name 
              ? `${formatDateTime(s.startedAt)} · ${cycleCount} ${cycleCount === 1 ? 'cycle' : 'cycles'} · ${formatDuration(durationMs)}${s.endedAt ? '' : ' · active'}`
              : `${cycleCount} ${cycleCount === 1 ? 'cycle' : 'cycles'} · ${formatDuration(durationMs)}${s.endedAt ? '' : ' · active'}`
          ),
        ]),
      ]),
      el('button', {
        class: 'btn btn-ghost',
        style: { color: 'var(--danger)', padding: '0.5rem' },
        onClick: async () => {
          if (!confirm('Delete this session?')) return;
          await deleteSession(s.id);
          toast('Session deleted');
          target.innerHTML = '';
          renderHistory(target);
        }
      }, '🗑'),
    ]);
    list.appendChild(item);
  }
}
