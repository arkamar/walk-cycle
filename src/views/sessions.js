import { el, formatDateTime, toast } from '../ui.js';
import {
  createSession,
  listSessions,
  listEventsBySession,
  deleteSession,
  getCurrentSession,
  setCurrentSession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatDuration,
} from '../analytics.js';
import { sessionStatus } from '../stateMachine.js';

export async function renderSessions(target) {
  const heading = el('h2', { style: { margin: 0 } }, 'Sessions');
  const newSessionBtn = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    onClick: async () => {
      await createSession();
      window.location.hash = '/';
    },
  }, 'New Session');
  const headingRow = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  }, [heading, newSessionBtn]);
  const subheading = el('p', { class: 'muted' }, 'Loading…');
  const list = el('div', { class: 'list' });
  target.appendChild(el('div', {}, [headingRow, subheading, list]));

  const sessions = await listSessions({ limit: 200 });

  if (!sessions.length) {
    subheading.textContent = '';
    list.appendChild(
      el('div', { class: 'empty' }, [
        el('p', {}, 'No sessions yet.'),
        el('p', { class: 'muted' }, 'Start tracking to see your sessions here.'),
      ])
    );
    return;
  }

  subheading.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;

  const current = await getCurrentSession();
  const currentId = current ? current.id : null;

  // Fetch summaries in parallel.
  const summaries = await Promise.all(
    sessions.map(async (s) => {
      const events = await listEventsBySession(s.id);
      const cycleEvents = events.filter(e => e.type !== 'session_stopped');
      const segments = segmentsFromEvents(cycleEvents);
      const cycles = cyclesFromSegments(segments);
      const lastTs = cycleEvents.length ? cycleEvents[cycleEvents.length - 1].ts : s.createdAt;
      const durationMs = lastTs - s.createdAt;
      return { session: s, cycleCount: cycles.length, durationMs };
    })
  );

  for (const { session: s, cycleCount, durationMs } of summaries) {
    const status = sessionStatus(s);
    const isCurrent = s.id === currentId;

    const rowClass = `list-item${isCurrent ? ' list-item--current' : ''}`;
    const statusIcon =
      status === 'active' ? ' ▶'
      : status === 'stopped' ? ' ■'
      : '';

    const baseMeta = `${cycleCount} ${cycleCount === 1 ? 'cycle' : 'cycles'} · ${formatDuration(durationMs)}${statusIcon}`;
    const metaText = s.name
      ? `${formatDateTime(s.createdAt)} · ${baseMeta}`
      : baseMeta;

    const children = [
      el('div', { style: { flex: 1 } }, [
        el('a', { href: `#/sessions/${s.id}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' } }, [
          el('div', {}, s.name || formatDateTime(s.createdAt)),
          el('div', { class: 'meta' }, metaText),
        ]),
      ]),
    ];

    if (!isCurrent) {
      children.push(el('button', {
        class: 'btn btn-primary',
        style: { padding: '0.4rem 0.75rem', fontSize: '0.85rem' },
        type: 'button',
        onClick: async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await setCurrentSession(s.id);
          toast('Session is now current');
          window.location.hash = '/';
        },
      }, 'Set as current'));
    }

    children.push(el('button', {
      class: 'btn btn-ghost',
      style: { color: 'var(--danger)', padding: '0.5rem' },
      onClick: async () => {
        if (!confirm('Delete this session?')) return;
        await deleteSession(s.id);
        toast('Session deleted');
        target.innerHTML = '';
        renderSessions(target);
      }
    }, '🗑'));

    list.appendChild(el('div', { class: rowClass }, children));
  }
}
