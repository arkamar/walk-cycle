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
      ]),
    );
    return;
  }

  const records = await listRecordsByActivity(id);
  const currentYear = new Date().getFullYear();

  const cumulativeById = new Map();
  {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const byYear = {};
    for (const r of sorted) {
      const year = r.date.slice(0, 4);
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(r);
    }
    for (const year of Object.keys(byYear).sort()) {
      let total = 0;
      for (const r of byYear[year]) {
        total += r.count;
        cumulativeById.set(r.id, total);
      }
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
  const yearRecords = records.filter(r => r.date.startsWith(String(currentYear)));
  const yearCount = yearRecords.reduce((s, r) => s + r.count, 0);

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

  const statsCard = el('div', { class: 'card stat-grid', style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, [
    el('div', { class: 'stat' }, [
      el('div', { class: 'label' }, 'Total'),
      el('div', { class: 'value' }, String(totalCount)),
    ]),
    el('div', { class: 'stat' }, [
      el('div', { class: 'label' }, `${currentYear}`),
      el('div', { class: 'value', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' } }, [
        el('span', {}, String(yearCount)),
        el('span', { style: { color: 'var(--muted)' } }, '/'),
        goalSquare,
        goalInput,
      ]),
      ...(activity.goal ? [el('div', { class: 'meta' }, `${Math.round(yearCount / activity.goal * 100)}%`)] : []),
    ]),
    ...(activity.goal ? [
      el('div', { class: 'stat' }, [
        el('div', { class: 'label' }, yearCount >= activity.goal ? 'Over' : 'Remaining'),
        el('div', { class: 'value', style: { color: yearCount >= activity.goal ? 'var(--success)' : 'var(--danger)' } }, String(Math.abs(activity.goal - yearCount))),
        el('div', { class: 'meta' }, yearCount >= activity.goal ? 'above goal' : 'to go'),
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
      el('p', { class: 'muted' }, 'No records yet.'),
    );
  } else {
    const list = el('div', { class: 'list' });
    recordsCard.appendChild(list);

    let prevYear = null;

    for (const r of records) {
      const year = r.date.slice(0, 4);
      if (year !== prevYear) {
        if (year !== String(currentYear)) {
          const yearLabel = el('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '0.5rem 0.25rem',
            },
          }, [
            el('span', { style: { flex: 1, height: '1px', background: 'var(--border)' } }),
            el('span', {}, year),
            el('span', { style: { flex: 1, height: '1px', background: 'var(--border)' } }),
          ]);
          list.appendChild(yearLabel);
        }
        prevYear = year;
      }
      const dateSpan = el('span', { dataset: { edit: 'date' }, style: { cursor: 'pointer' } }, new Date(r.date + 'T00:00:00').toLocaleDateString());
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
        dateSpan.textContent = new Date(newDate + 'T00:00:00').toLocaleDateString();
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

      const writtenChk = el('input', {
        type: 'checkbox',
        checked: r.written,
        dataset: { edit: 'written' },
        style: { cursor: 'pointer', margin: 0 },
        onChange: async (e) => {
          await updateRecord(r.id, { written: e.target.checked });
          toast(e.target.checked ? 'Marked as written' : 'Marked as not written');
          target.innerHTML = '';
          renderActivityDetail(target, { id });
        },
      });

      const noteSpan = el('span', {
        dataset: { edit: 'note' },
        style: { flex: 1, alignSelf: 'stretch', color: 'var(--muted)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center' },
      }, r.note);
      const noteInput = el('input', {
        type: 'text',
        value: r.note,
        dataset: { edit: 'note-input' },
        style: { flex: 1, display: 'none', fontSize: '0.85rem' },
        onBlur: async () => { await saveNote(); },
        onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); noteInput.blur(); } },
      });
      async function saveNote() {
        const val = noteInput.value.trim();
        if (val !== (r.note || '')) {
          await updateRecord(r.id, { note: val });
          toast('Note updated');
          target.innerHTML = '';
          renderActivityDetail(target, { id });
          return;
        }
        noteSpan.style.display = '';
        noteInput.style.display = 'none';
      }
      noteSpan.onclick = () => {
        noteSpan.style.display = 'none';
        noteInput.style.display = '';
        noteInput.focus();
      };

      const children = [
        el('span', { style: { flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' } }, [
          writtenChk,
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' } }, [dateSpan, dateInput]),
          noteSpan,
          noteInput,
        ]),
        el('span', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } }, [
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' } }, [countSpan, countInput]),
          el('span', { style: { color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' } }, cumulativeById.has(r.id) ? String(cumulativeById.get(r.id)) : ''),
          el('button', {
            class: 'btn btn-ghost',
            style: { color: 'var(--danger)', padding: '0.5rem' },
            onClick: async () => {
              if (!confirm('Delete this record?')) return;
              await deleteRecord(r.id);
              toast('Record deleted');
              target.innerHTML = '';
              renderActivityDetail(target, { id });
            },
          }, '🗑'),
        ]),
      ];

      list.appendChild(el('div', { class: 'list-item' }, children));
    }
  }

  let chartCard;
  let canvasWrap;

  if (activity.goal) {
    chartCard = el('div', { class: 'card' }, [
      el('h3', {}, 'Motivation'),
    ]);

    const CHART_MODE_KEY = 'walk-cycle-chart-mode';
    let chartMode = JSON.parse(localStorage.getItem(CHART_MODE_KEY) || '{}')[id] || 'week';

    function persistChartMode(mode) {
      const prefs = JSON.parse(localStorage.getItem(CHART_MODE_KEY) || '{}');
      prefs[id] = mode;
      localStorage.setItem(CHART_MODE_KEY, JSON.stringify(prefs));
    }

    const activeBtn = { background: 'var(--fg)', color: 'var(--bg)', border: '1px solid var(--fg)' };
    const inactiveBtn = { background: 'transparent', color: 'var(--fg)', border: '1px solid var(--border)' };

    const activeModes = { day: false, week: false, pace: false };
    activeModes[chartMode] = true;

    const btnStyle = (active) => ({
      ...(active ? activeBtn : inactiveBtn),
      padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer',
    });

    const dayBtn = el('button', {
      style: { ...btnStyle(activeModes.day), borderRadius: '4px 0 0 4px' },
      onClick: () => switchMode('day'),
    }, 'Day');

    const weekBtn = el('button', {
      style: { ...btnStyle(activeModes.week), borderRadius: 0 },
      onClick: () => switchMode('week'),
    }, 'Week');

    const paceBtn = el('button', {
      style: { ...btnStyle(activeModes.pace), borderRadius: '0 4px 4px 0' },
      onClick: () => switchMode('pace'),
    }, 'Pace');

    const resetBtn = el('button', {
      style: { display: 'none', padding: '0.15rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: '3px', background: 'transparent', color: 'var(--fg)' },
      onClick: () => {
        resetBtn.style.display = 'none';
        canvasWrap.innerHTML = '';
        renderMotivationChart(canvasWrap, yearRecords, activity.goal, chartMode, null, onZoomChange);
      },
    }, '← Reset zoom');

    chartCard.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' } }, [
      el('div', { style: { display: 'flex', gap: 0 } }, [dayBtn, weekBtn, paceBtn]),
      resetBtn,
    ]));

    canvasWrap = el('div', { style: { marginTop: '0.5rem' } });
    chartCard.appendChild(canvasWrap);
    renderMotivationChart(canvasWrap, yearRecords, activity.goal, chartMode, null, onZoomChange);

    function onZoomChange(bounds) {
      resetBtn.style.display = bounds ? '' : 'none';
    }

    function switchMode(mode) {
      if (mode === chartMode) return;
      chartMode = mode;
      persistChartMode(mode);
      resetBtn.style.display = 'none';
      Object.assign(dayBtn.style, mode === 'day' ? activeBtn : inactiveBtn);
      Object.assign(weekBtn.style, mode === 'week' ? activeBtn : inactiveBtn);
      Object.assign(paceBtn.style, mode === 'pace' ? activeBtn : inactiveBtn);
      canvasWrap.innerHTML = '';
      renderMotivationChart(canvasWrap, yearRecords, activity.goal, mode, null, onZoomChange);
    }
  }

  let placesCard = null;

  if (records.length > 0) {
    placesCard = el('div', { class: 'card' }, [
      el('h3', {}, 'By Note'),
    ]);

    const byNote = new Map();
    for (const r of records) {
      const label = r.note || '';
      byNote.set(label, (byNote.get(label) || 0) + r.count);
    }
    const sorted = [...byNote.entries()].sort((a, b) => b[1] - a[1]);

    const list = el('div', { class: 'list' });
    for (const [note, sum] of sorted) {
      const pct = totalCount > 0 ? sum / totalCount * 100 : 0;
      list.appendChild(el('div', { class: 'list-item' }, [
        el('span', { style: { flex: 1 } }, note),
        el('span', { style: { color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', width: '3rem', textAlign: 'right' } }, String(sum)),
        el('span', { style: { color: 'var(--muted)', fontSize: '0.85rem', width: '3.5rem', textAlign: 'right' } }, `${pct.toFixed(1)}%`),
      ]));
    }
    placesCard.appendChild(list);
  }

  target.appendChild(el('div', {}, [
    headerRow,
    headerCard,
    statsCard,
    ...(chartCard ? [chartCard] : []),
    formCard,
    recordsCard,
    ...(placesCard ? [placesCard] : []),
  ]));

  return () => {
    if (!canvasWrap) return;
    const handler = _mouseUpHandlers.get(canvasWrap);
    if (handler) window.removeEventListener('mouseup', handler);
    _mouseUpHandlers.delete(canvasWrap);
    const ro = _resizeObservers.get(canvasWrap);
    if (ro) ro.disconnect();
    _resizeObservers.delete(canvasWrap);
  };
}

const _mouseUpHandlers = new Map();
const _resizeObservers = new Map();

function renderMotivationChart(container, yearRecords, goal, mode, initialZoom, onZoomChange) {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const daysInYear = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;
  const now = new Date();
  const todayDayIndex = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(currentYear, 0, 1)) / 86400000);
  const df = new Intl.DateTimeFormat(navigator.language, { day: 'numeric', month: 'short' });
  const mf = new Intl.DateTimeFormat(navigator.language, { month: 'short' });

  let data;
  let totalUnits;
  let todayIndex;
  let firstWeekStart = 0;
  let stepWidth;

  if (mode === 'week') {
    const locale = new Intl.Locale(navigator.language);
    const localeFirstDay = locale.weekInfo?.firstDay ?? 1;
    const firstDayOfWeek = localeFirstDay % 7;
    const jan1DayOfWeek = startOfYear.getDay();
    firstWeekStart = (firstDayOfWeek - jan1DayOfWeek + 7) % 7;

    totalUnits = firstWeekStart === 0
      ? Math.ceil(daysInYear / 7)
      : 1 + Math.ceil((daysInYear - firstWeekStart) / 7);

    todayIndex = todayDayIndex < firstWeekStart
      ? todayDayIndex / firstWeekStart
      : (firstWeekStart > 0 ? 1 : 0) + (todayDayIndex - firstWeekStart) / 7;
    todayIndex = Math.min(todayIndex, totalUnits - 1);

    const weekCounts = new Map();
    for (const r of yearRecords) {
      const [yr, mo, da] = r.date.split('-').map(Number);
      const dayIndex = Math.floor((Date.UTC(yr, mo - 1, da) - Date.UTC(currentYear, 0, 1)) / 86400000);
      const w = dayIndex < firstWeekStart ? 0 : 1 + Math.floor((dayIndex - firstWeekStart) / 7);
      weekCounts.set(w, (weekCounts.get(w) || 0) + r.count);
    }
    let runningRecords = 0;
    data = [];
    for (let w = 0; w < totalUnits; w++) {
      runningRecords += weekCounts.get(w) || 0;
      data.push({ index: w, records: runningRecords, maxPossible: runningRecords + (totalUnits - w - 1) });
    }
  } else if (mode === 'pace') {
    stepWidth = daysInYear / goal;
    totalUnits = goal;
    todayIndex = todayDayIndex / stepWidth;

    const paceCounts = new Map();
    for (const r of yearRecords) {
      const [yr, mo, da] = r.date.split('-').map(Number);
      const dayIndex = Math.floor((Date.UTC(yr, mo - 1, da) - Date.UTC(currentYear, 0, 1)) / 86400000);
      const p = Math.min(Math.floor(dayIndex / stepWidth), totalUnits - 1);
      paceCounts.set(p, (paceCounts.get(p) || 0) + r.count);
    }
    let running = 0;
    data = [];
    for (let i = 0; i < totalUnits; i++) {
      running += paceCounts.get(i) || 0;
      data.push({ index: i, records: running, maxPossible: running + (totalUnits - i - 1) });
    }
  } else {
    totalUnits = daysInYear;
    todayIndex = todayDayIndex;
    const dayCounts = new Map();
    for (const r of yearRecords) {
      dayCounts.set(r.date, (dayCounts.get(r.date) || 0) + r.count);
    }
    let runningRecords = 0;
    data = [];
    for (let day = 0; day < totalUnits; day++) {
      const dateStr = new Date(currentYear, 0, day + 1).toISOString().slice(0, 10);
      runningRecords += dayCounts.get(dateStr) || 0;
      data.push({ index: day, records: runningRecords, maxPossible: runningRecords + (totalUnits - day - 1) });
    }
  }

  const cumDays = [0];
  if (mode === 'week') {
    for (let w = 0; w < totalUnits; w++) {
      const prev = cumDays[w];
      const span = w === 0
        ? (firstWeekStart > 0 ? firstWeekStart : 7)
        : (w === totalUnits - 1 ? daysInYear - prev : 7);
      cumDays.push(prev + span);
    }
  } else if (mode === 'pace') {
    for (let i = 1; i <= totalUnits; i++) cumDays.push(i * stepWidth);
  } else {
    for (let i = 1; i <= totalUnits; i++) cumDays.push(i);
  }

  const cumDaysAt = (idx) => {
    const i = Math.floor(idx);
    const frac = idx - i;
    if (i >= cumDays.length - 1) return cumDays.at(-1);
    return cumDays[i] + frac * (cumDays[i + 1] - cumDays[i]);
  };

  let zoom = initialZoom;

  const canvas = el('canvas', {
    style: { width: '100%', height: '200px', display: 'block' },
  });
  container.appendChild(canvas);

  let isDragging = false;
  let dragStartX = 0;
  let dragEndX = 0;
  let initialPinchDist = 0;
  let pinchFocalIndex = 0;
  let panStartX = 0;
  let panStartZoom = null;

  const pad = { top: 24, right: 12, bottom: 28, left: 40 };

  function getPlotW() {
    const rect = canvas.getBoundingClientRect();
    return rect.width - pad.left - pad.right;
  }

  function pixelToIndex(px) {
    const plotW = getPlotW();
    if (plotW <= 0) return 0;
    const vs = zoom ? zoom.start : 0;
    const ve = zoom ? zoom.end : totalUnits - 1;
    const startDays = cumDaysAt(vs);
    const endDays = cumDaysAt(ve + 1);
    const targetDays = startDays + ((px - pad.left) / plotW) * (endDays - startDays);
    let lo = 0, hi = cumDays.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumDays[mid] <= targetDays) lo = mid;
      else hi = mid;
    }
    const frac = (targetDays - cumDays[lo]) / (cumDays[hi] - cumDays[lo] || 1);
    return Math.round(Math.max(0, Math.min(totalUnits - 1, lo + frac)));
  }

  const draw = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    const visibleStart = zoom ? zoom.start : 0;
    const visibleEnd = zoom ? zoom.end : totalUnits - 1;
    const visibleUnits = visibleEnd - visibleStart + 1;
    const visibleData = data.slice(visibleStart, visibleEnd + 1);

    const style = getComputedStyle(canvas);
    const fg = style.getPropertyValue('--fg').trim() || '#333';
    const muted = style.getPropertyValue('--muted').trim() || '#999';
    const border = style.getPropertyValue('--border').trim() || '#ddd';
    const success = style.getPropertyValue('--success').trim() || '#16a34a';
    const danger = style.getPropertyValue('--danger').trim() || '#dc2626';

    const maxVal = Math.max(goal, ...visibleData.map(d => d.maxPossible), 1);

    const x = (idx) => {
      const startDays = cumDaysAt(visibleStart);
      const endDays = cumDaysAt(visibleEnd + 1);
      return pad.left + ((cumDaysAt(idx) - startDays) / (endDays - startDays)) * plotW;
    };
    const y = (val) => pad.top + plotH - (val / maxVal) * plotH;
    const monthIdx = (dayOfMonth) => {
      if (mode === 'day') return dayOfMonth;
      if (mode === 'pace') return dayOfMonth / stepWidth;
      return dayOfMonth < firstWeekStart
        ? dayOfMonth / (firstWeekStart || 1)
        : (firstWeekStart > 0 ? 1 : 0) + (dayOfMonth - firstWeekStart) / 7;
    };

    ctx.clearRect(0, 0, w, h);

    ctx.font = '10px sans-serif';
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((maxVal / ySteps) * i);
      const yy = y(val);
      ctx.beginPath();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(pad.left + plotW, yy);
      ctx.stroke();
      ctx.fillText(String(val), pad.left - 4, yy);
    }

    if (mode === 'week' || mode === 'pace') {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      const step = mode === 'pace' && visibleUnits > 20 ? Math.ceil(visibleUnits / 20) : 1;
      for (let i = Math.max(0, visibleStart); i <= visibleEnd + 1; i += step) {
        const xx = x(i);
        ctx.beginPath();
        ctx.moveTo(xx, pad.top);
        ctx.lineTo(xx, pad.top + plotH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else {
      const dayStep = visibleUnits < 14 ? 1 : 7;
      ctx.strokeStyle = border;
      ctx.lineWidth = dayStep === 1 ? 0.5 : 1;
      ctx.setLineDash([2, 4]);
      for (let day = Math.max(0, visibleStart); day <= visibleEnd; day += dayStep) {
        const xx = x(day);
        ctx.beginPath();
        ctx.moveTo(xx, pad.top);
        ctx.lineTo(xx, pad.top + plotH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pad.left + plotW, pad.top);
      ctx.lineTo(pad.left + plotW, pad.top + plotH);
      ctx.stroke();
    }

    const monthStartDay = Array.from({ length: 12 }, (_, m) =>
      Math.floor((Date.UTC(currentYear, m, 1) - Date.UTC(currentYear, 0, 1)) / 86400000),
    );

    ctx.strokeStyle = muted + '60';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (let m = 1; m < 12; m++) {
      const idx = monthIdx(monthStartDay[m]);
      if (idx < visibleStart || idx > visibleEnd) continue;
      const xx = x(idx);
      ctx.beginPath();
      ctx.moveTo(xx, pad.top);
      ctx.lineTo(xx, pad.top + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const drawMonthLabels = (threshold) => {
      if (visibleUnits <= threshold) return;
      for (let m = 0; m < 12; m++) {
        const idx = monthIdx(monthStartDay[m]);
        if (idx < visibleStart || idx > visibleEnd) continue;
        ctx.fillText(
          mf.format(new Date(currentYear, m, 1)),
          x(idx), pad.top + plotH + 4,
        );
      }
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    if (mode === 'day') {
      drawMonthLabels(60);
      if (visibleUnits <= 60) {
        const step = visibleUnits > 20 ? 7 : Math.max(1, Math.floor(visibleUnits / 8));
        for (let day = Math.ceil(visibleStart / step) * step; day <= visibleEnd; day += step) {
          const d = new Date(currentYear, 0, day + 1);
          ctx.fillText(
            df.format(d),
            x(day), pad.top + plotH + 4,
          );
        }
      }
    } else if (mode === 'pace') {
      drawMonthLabels(14);
      if (visibleUnits <= 14) {
        const step = visibleUnits > 14 ? 2 : 1;
        for (let i = visibleStart; i <= visibleEnd; i += step) {
          const day = Math.min(cumDays[i], daysInYear - 1);
          ctx.fillText(
            df.format(new Date(currentYear, 0, Math.floor(day) + 1)),
            x(i), pad.top + plotH + 4,
          );
        }
      }
    } else {
      drawMonthLabels(16);
      if (visibleUnits <= 3) {
        const dayCount = cumDays[visibleEnd + 1] - cumDays[visibleStart];
        const step = Math.max(1, Math.floor(dayCount / 8));
        for (let d = Math.ceil(cumDays[visibleStart] / step) * step; d < cumDays[visibleEnd + 1]; d += step) {
          ctx.fillText(
            df.format(new Date(currentYear, 0, d + 1)),
            x(monthIdx(d)), pad.top + plotH + 4,
          );
        }
      } else if (visibleUnits <= 16) {
        for (let w = visibleStart; w <= visibleEnd; w++) {
          const d = w === 0 ? new Date(currentYear, 0, 1) : new Date(currentYear, 0, firstWeekStart + (w - 1) * 7 + 1);
          ctx.fillText(
            df.format(d),
            x(w), pad.top + plotH + 4,
          );
        }
      }
    }

    const currentPossible = data[Math.min(Math.floor(todayIndex), totalUnits - 1)]?.maxPossible ?? 0;
    const belowGoal = currentPossible < goal;

    const drawStepPath = () => {
      visibleData.forEach((d, i) => {
        const xx = x(d.index);
        const yy = y(d.maxPossible);
        if (i === 0) {
          ctx.moveTo(xx, yy);
        } else {
          const prev = visibleData[i - 1];
          ctx.lineTo(xx, y(prev.maxPossible));
          ctx.lineTo(xx, yy);
        }
      });
      if (visibleData.length) {
        ctx.lineTo(pad.left + plotW, y(visibleData[visibleData.length - 1].maxPossible));
      }
    };

    ctx.beginPath();
    drawStepPath();
    ctx.lineTo(pad.left + plotW, y(0));
    ctx.lineTo(x(visibleStart), y(0));
    ctx.closePath();
    ctx.fillStyle = (belowGoal ? danger : success) + '18';
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = belowGoal ? danger : success;
    ctx.lineWidth = 2;
    drawStepPath();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = success;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    const goalY = y(goal);
    ctx.moveTo(pad.left, goalY);
    ctx.lineTo(pad.left + plotW, goalY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = success;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = '10px sans-serif';
    ctx.fillText('goal', pad.left + plotW, goalY - 2);

    if (todayIndex >= visibleStart && todayIndex <= visibleEnd) {
      ctx.beginPath();
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      const todayX = x(todayIndex);
      ctx.moveTo(todayX, pad.top);
      ctx.lineTo(todayX, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '10px sans-serif';
      ctx.fillText('today', todayX, pad.top - 2);
    }

    if (isDragging) {
      const minX = Math.min(dragStartX, dragEndX);
      const maxX = Math.max(dragStartX, dragEndX);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
      ctx.fillRect(minX, pad.top, maxX - minX, plotH);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX, pad.top, maxX - minX, plotH);
    }
  };

  const startDrag = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    isDragging = true;
    dragStartX = clientX - rect.left;
    dragEndX = dragStartX;
    canvas.style.cursor = 'ew-resize';
    draw();
  };

  const moveDrag = (clientX) => {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    dragEndX = clientX - rect.left;
    draw();
  };

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = '';

    const minX = Math.min(dragStartX, dragEndX);
    const maxX = Math.max(dragStartX, dragEndX);
    const dist = maxX - minX;

    const plotW = getPlotW();
    if (plotW <= 0 || dist < 5) {
      draw();
      return;
    }

    const start = pixelToIndex(minX);
    const end = pixelToIndex(maxX);
    if (start >= end) {
      draw();
      return;
    }

    zoom = { start, end };
    draw();

    if (onZoomChange) onZoomChange(zoom);
  };

  canvas.addEventListener('mousedown', (e) => { startDrag(e.clientX); });
  canvas.addEventListener('mousemove', (e) => { moveDrag(e.clientX); });

  const prevHandler = _mouseUpHandlers.get(container);
  if (prevHandler) window.removeEventListener('mouseup', prevHandler);
  const onMouseUp = () => { endDrag(); };
  window.addEventListener('mouseup', onMouseUp);
  _mouseUpHandlers.set(container, onMouseUp);

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const rect = canvas.getBoundingClientRect();
      pinchFocalIndex = pixelToIndex(midX - rect.left);
      initialPinchDist = dist;
      panStartZoom = null;
      e.preventDefault();
      return;
    }
    if (e.touches.length === 1) {
      e.preventDefault();
      panStartX = e.touches[0].clientX;
      panStartZoom = zoom ? { start: zoom.start, end: zoom.end } : null;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDist > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const scale = initialPinchDist / newDist;
      if (Math.abs(scale - 1) < 0.05) return;

      const curStart = zoom ? zoom.start : 0;
      const curEnd = zoom ? zoom.end : totalUnits - 1;
      const curW = curEnd - curStart + 1;
      let newW = Math.max(2, Math.min(totalUnits, Math.round(curW * scale)));
      let newStart = Math.round(pinchFocalIndex - (pinchFocalIndex - curStart) * (newW / curW));
      let newEnd = newStart + newW - 1;
      if (newStart < 0) { newStart = 0; newEnd = newW - 1; }
      if (newEnd >= totalUnits) { newEnd = totalUnits - 1; newStart = newEnd - newW + 1; }
      if (newStart < 0) newStart = 0;

      if (newStart !== curStart || newEnd !== curEnd) {
        zoom = { start: newStart, end: newEnd };
        initialPinchDist = newDist;
        draw();
        if (onZoomChange) onZoomChange(zoom);
      }
      return;
    }
    if (e.touches.length === 1 && panStartZoom) {
      e.preventDefault();
      const plotW = getPlotW();
      if (plotW <= 0) return;
      const vu = panStartZoom.end - panStartZoom.start + 1;
      const deltaPx = e.touches[0].clientX - panStartX;
      const deltaIdx = Math.round(-(deltaPx / plotW) * vu);
      let newStart = panStartZoom.start + deltaIdx;
      let newEnd = panStartZoom.end + deltaIdx;
      if (newStart < 0) { newStart = 0; newEnd = vu - 1; }
      if (newEnd >= totalUnits) { newEnd = totalUnits - 1; newStart = newEnd - vu + 1; }
      if (newStart < 0) newStart = 0;
      if (newStart !== zoom.start || newEnd !== zoom.end) {
        zoom = { start: newStart, end: newEnd };
        draw();
        if (onZoomChange) onZoomChange(zoom);
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    panStartZoom = null;
    panStartX = 0;
    initialPinchDist = 0;
  }, { passive: false });

  draw();
  const prevRo = _resizeObservers.get(container);
  if (prevRo) prevRo.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    _resizeObservers.set(container, ro);
  }
}
