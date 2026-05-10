import { el, toast } from '../ui.js';
import {
  getActivity,
  updateActivity,
  addRecord,
  listRecordsByActivity,
  updateRecord,
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

  const cumulativeById = new Map();
  {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    let total = 0;
    for (const r of sorted) {
      total += r.count;
      cumulativeById.set(r.id, total);
    }
  }

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

  const totalCount = records.reduce((s, r) => s + r.count, 0);
  const currentYear = new Date().getFullYear();
  const yearRecords = records.filter(r => r.date.startsWith(String(currentYear)));
  const yearCount = yearRecords.reduce((s, r) => s + r.count, 0);

  let projected = null;
  if (activity.goal) {
    const daysInYear = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;
    const startOfYear = new Date(currentYear, 0, 1).getTime();
    const elapsedDays = Math.max(1, Math.floor((Date.now() - startOfYear) / 86400000));
    projected = Math.round((yearCount / elapsedDays) * daysInYear);
  }

  const goalSquare = el('span', {
    dataset: { edit: 'goal' },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '2rem',
      height: '2rem',
      border: `2px ${activity.goal ? 'solid' : 'dashed'} var(--border)`,
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: 600,
      padding: '0 0.25rem',
    },
  }, activity.goal ?? '—');

  const goalInput = el('input', {
    type: 'number',
    min: 1,
    value: activity.goal ?? '',
    placeholder: '—',
    dataset: { edit: 'goal-input' },
    style: { width: '3rem', display: 'none' },
    onBlur: async () => { await saveGoal(); },
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); goalInput.blur(); } },
  });

  async function saveGoal() {
    const val = goalInput.value ? Number(goalInput.value) : null;
    const cleanVal = val && val > 0 ? val : null;
    if (cleanVal !== activity.goal) {
      await updateActivity(activity.id, { goal: cleanVal });
      activity.goal = cleanVal;
      target.innerHTML = '';
      renderActivityDetail(target, { id });
    } else {
      goalSquare.style.display = '';
      goalInput.style.display = 'none';
    }
  }

  goalSquare.onclick = () => {
    goalSquare.style.display = 'none';
    goalInput.style.display = '';
    goalInput.focus();
  };

  const statsCard = el('div', { class: 'card stat-grid', style: { gridTemplateColumns: activity.goal ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)' } }, [
    el('div', { class: 'stat' }, [
      el('div', { class: 'label' }, 'Total'),
      el('div', { class: 'value' }, String(totalCount)),
    ]),
    el('div', { class: 'stat' }, [
      el('div', { class: 'label' }, `${currentYear}`),
      el('div', { class: 'value', style: { display: 'flex', alignItems: 'center', gap: '0.25rem' } }, [
        el('span', {}, String(yearCount)),
        goalSquare,
        goalInput,
      ]),
    ]),
    ...(activity.goal ? [
      el('div', { class: 'stat' }, [
        el('div', { class: 'label' }, yearCount >= activity.goal ? 'Over' : 'Remaining'),
        el('div', { class: 'value', style: { color: yearCount >= activity.goal ? 'var(--success)' : 'var(--danger)' } }, String(Math.abs(activity.goal - yearCount))),
        el('div', { class: 'meta' }, yearCount >= activity.goal ? 'above goal' : 'to go'),
      ]),
    ] : []),
    ...(activity.goal && projected !== null ? [
      el('div', { class: 'stat' }, [
        el('div', { class: 'label' }, 'Projected'),
        el('div', { class: 'value' }, String(projected)),
        el('div', { class: 'meta' }, projected >= activity.goal ? '✅ on track' : '📉 behind'),
      ]),
    ] : []),
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
    dataset: { form: 'count' },
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
      const dateSpan = el('span', { dataset: { edit: 'date' }, style: { cursor: 'pointer' } }, r.date);
      const dateInput = el('input', {
        type: 'date',
        value: r.date,
        dataset: { edit: 'date-input' },
        style: { display: 'none' },
        onBlur: async () => { await saveDate(); },
        onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); dateInput.blur(); } },
      });
      async function saveDate() {
        const newDate = dateInput.value;
        if (newDate === r.date) {
          dateSpan.style.display = '';
          dateInput.style.display = 'none';
          return;
        }
        const existing = await listRecordsByActivity(activity.id);
        if (existing.find(rec => rec.date === newDate && rec.id !== r.id)) {
          toast('Record already exists for this date');
          dateInput.value = r.date;
          dateSpan.style.display = '';
          dateInput.style.display = 'none';
          return;
        }
        await updateRecord(r.id, { date: newDate });
        r.date = newDate;
        dateSpan.textContent = newDate;
        dateSpan.style.display = '';
        dateInput.style.display = 'none';
        toast('Date updated');
      }
      dateSpan.onclick = () => {
        dateSpan.style.display = 'none';
        dateInput.style.display = '';
        dateInput.focus();
      };

      const countSpan = el('span', { dataset: { edit: 'count' }, style: { cursor: 'pointer' } }, `${r.count}`);
      const countInput = el('input', {
        type: 'number',
        min: 1,
        value: r.count,
        dataset: { edit: 'count-input' },
        style: { width: '3rem', display: 'none' },
        onBlur: async () => { await saveCount(); },
        onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); countInput.blur(); } },
      });
      async function saveCount() {
        const val = Number(countInput.value);
        if (val !== r.count) {
          await updateRecord(r.id, { count: val });
          toast('Count updated');
          target.innerHTML = '';
          renderActivityDetail(target, { id });
          return;
        }
        countSpan.style.display = '';
        countInput.style.display = 'none';
      }
      countSpan.onclick = () => {
        countSpan.style.display = 'none';
        countInput.style.display = '';
        countInput.focus();
      };

      const children = [
        el('div', { style: { flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' } }, [dateSpan, dateInput]),
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } }, [
            el('span', { style: { display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' } }, [countSpan, countInput]),
            el('span', { style: { color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' } }, String(cumulativeById.get(r.id))),
          ]),
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

  target.appendChild(el('div', {}, [headerRow, headerCard, statsCard, formCard, recordsCard]));
}
