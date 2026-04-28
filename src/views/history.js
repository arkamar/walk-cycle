import { el, formatDateTime, toast } from '../ui.js';
import {
  listSessions,
  listEventsBySession,
  deleteSession,
  getActiveSession,
  setCurrentSession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatDuration,
} from '../analytics.js';
import { sessionStatus } from '../stateMachine.js';

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

  // The currently-active session (if any) - used to suppress the
  // "Set as current" button on the row that's already current.
  const currentActive = await getActiveSession();
  const currentId = currentActive ? currentActive.id : null;

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
    const status = sessionStatus(s);
    const isCurrent = s.id === currentId;

    const statusSuffix =
      isCurrent ? ' · current'
      : status === 'active' ? ' · active'
      : status === 'stopped' ? ' · stopped'
      : ''; // 'ended' or unknown - no suffix (date already shown)

    const baseMeta = `${cycleCount} ${cycleCount === 1 ? 'cycle' : 'cycles'} · ${formatDuration(durationMs)}${statusSuffix}`;
    const metaText = s.name
      ? `${formatDateTime(s.startedAt)} · ${baseMeta}`
      : baseMeta;

    const children = [
      el('div', { style: { flex: 1 } }, [
        el('a', { href: `#/history/${s.id}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' } }, [
          el('div', {}, s.name || formatDateTime(s.startedAt)),
          el('div', { class: 'meta' }, metaText),
        ]),
      ]),
    ];

    // Any non-current session can be made current. Label varies so the
    // common "Resume" affordance keeps its familiar wording.
    if (!isCurrent) {
      const label = status === 'stopped' ? 'Resume' : 'Set as current';
      children.push(el('button', {
        class: 'btn btn-primary',
        style: { padding: '0.4rem 0.75rem', fontSize: '0.85rem' },
        type: 'button',
        onClick: async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (currentActive && currentActive.id !== s.id) {
            if (!confirm(
              'Another session is currently running. Stop it and switch to this one?'
            )) return;
          }
          await setCurrentSession(s.id);
          toast(label === 'Resume' ? 'Session resumed' : 'Session is now current');
          window.location.hash = '/';
        },
      }, label));
    }

    children.push(el('button', {
      class: 'btn btn-ghost',
      style: { color: 'var(--danger)', padding: '0.5rem' },
      onClick: async () => {
        if (!confirm('Delete this session?')) return;
        await deleteSession(s.id);
        toast('Session deleted');
        target.innerHTML = '';
        renderHistory(target);
      }
    }, '🗑'));

    list.appendChild(el('div', { class: 'list-item' }, children));
  }
}
