import { el, toast } from '../ui.js';
import {
  getActivity,
  updateActivity,
  addRecord,
  listRecordsByActivity,
  deleteRecord,
} from '../db.js';

export async function renderActivityDetail(target, { id }) {
  const activity = await getActivity(id);
  if (!activity) {
    target.appendChild(
      el('div', { class: 'card' }, [
        el('h2', {}, 'Activity not found'),
        el('a', { class: 'btn', href: '#/activities' }, '← Back to activities'),
      ])
    );
    return;
  }

  const records = await listRecordsByActivity(id);

  const headerRow = el('div', { class: 'row between' }, [
    el('a', { class: 'btn btn-ghost', href: '#/activities' }, '← Back'),
  ]);

  const headerCard = el('div', { class: 'card' }, [
    el('input', {
      type: 'text',
      placeholder: 'Activity name',
      value: activity.name,
      style: { flex: 1, fontSize: '1.25rem', fontWeight: 'bold', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.25rem 0.5rem', background: 'var(--bg-elev)', color: 'var(--fg)', width: '100%', boxSizing: 'border-box' },
      onChange: async (e) => {
        await updateActivity(id, { name: e.target.value });
        activity.name = e.target.value;
      },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const dateInput = el('input', {
    type: 'date',
    value: today,
    style: { flex: 1 },
  });
  const countInput = el('input', {
    type: 'number',
    min: 1,
    value: 1,
    style: { width: '4rem' },
  });
  const addBtn = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    onClick: async () => {
      try {
        await addRecord({
          activityId: id,
          date: dateInput.value,
          count: Number(countInput.value),
        });
        toast('Record added');
        target.innerHTML = '';
        renderActivityDetail(target, { id });
      } catch (err) {
        toast(err.message);
      }
    },
  }, 'Add');

  const formCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Add record'),
    el('div', { class: 'row', style: { gap: '0.5rem', marginTop: '0.5rem' } }, [
      dateInput,
      countInput,
      addBtn,
    ]),
  ]);

  const recordsCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Records'),
  ]);

  if (!records.length) {
    recordsCard.appendChild(
      el('p', { class: 'muted' }, 'No records yet.')
    );
  } else {
    const list = el('div', { class: 'list' });
    recordsCard.appendChild(list);

    for (const r of records) {
      const children = [
        el('div', { style: { flex: 1, display: 'flex', justifyContent: 'space-between' } }, [
          el('span', {}, r.date),
          el('span', {}, `${r.count}`),
        ]),
      ];

      children.push(el('button', {
        class: 'btn btn-ghost',
        style: { color: 'var(--danger)', padding: '0.5rem' },
        onClick: async () => {
          if (!confirm('Delete this record?')) return;
          await deleteRecord(r.id);
          toast('Record deleted');
          target.innerHTML = '';
          renderActivityDetail(target, { id });
        },
      }, '🗑'));

      list.appendChild(el('div', { class: 'list-item' }, children));
    }
  }

  target.appendChild(el('div', {}, [headerRow, headerCard, formCard, recordsCard]));
}
