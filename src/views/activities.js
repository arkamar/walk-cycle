import { el, toast } from '../ui.js';
import {
  createActivity,
  listActivities,
  deleteActivity,
  listRecordsByActivity,
} from '../db.js';

export async function renderActivities(target) {
  const heading = el('h2', { style: { margin: 0 } }, 'Activities');
  const newBtn = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    onClick: async () => {
      const id = await createActivity('New Activity');
      window.location.hash = `/activities/${id}`;
    },
  }, 'New Activity');
  const headingRow = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  }, [heading, newBtn]);
  const list = el('div', { class: 'list' });
  target.appendChild(el('div', {}, [headingRow, list]));

  const activities = await listActivities();

  if (!activities.length) {
    list.appendChild(
      el('div', { class: 'empty' }, [
        el('p', {}, 'No activities yet.'),
        el('p', { class: 'muted' }, 'Create one to start tracking.'),
      ])
    );
    return;
  }

  const summaries = await Promise.all(
    activities.map(async (a) => {
      const records = await listRecordsByActivity(a.id);
      return { activity: a, recordCount: records.length };
    })
  );

  for (const { activity: a, recordCount } of summaries) {
    const metaParts = [`${recordCount} ${recordCount === 1 ? 'record' : 'records'}`];

    const children = [
      el('div', { style: { flex: 1 } }, [
        el('a', {
          href: `#/activities/${a.id}`,
          style: { textDecoration: 'none', color: 'inherit', display: 'block' },
        }, [
          el('div', {}, a.name),
          el('div', { class: 'meta' }, metaParts.join(' · ')),
        ]),
      ]),
    ];

    children.push(el('button', {
      class: 'btn btn-ghost',
      style: { color: 'var(--danger)', padding: '0.5rem' },
      onClick: async () => {
        if (!confirm('Delete this activity?')) return;
        await deleteActivity(a.id);
        toast('Activity deleted');
        target.innerHTML = '';
        renderActivities(target);
      },
    }, '🗑'));

    list.appendChild(el('div', { class: 'list-item' }, children));
  }
}
