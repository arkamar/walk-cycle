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

  let chartCard;
  if (activity.goal) {
    chartCard = el('div', { class: 'card' }, [
      el('h3', {}, 'Motivation'),
    ]);

    let chartMode = 'week';

    const activeBtn = { background: 'var(--fg)', color: 'var(--bg)', border: '1px solid var(--fg)' };
    const inactiveBtn = { background: 'transparent', color: 'var(--fg)', border: '1px solid var(--border)' };

    const dayBtn = el('button', {
      style: { ...inactiveBtn, padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px 0 0 4px', cursor: 'pointer' },
      onClick: () => switchMode('day'),
    }, 'Day');

    const weekBtn = el('button', {
      style: { ...activeBtn, padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '0 4px 4px 0', cursor: 'pointer' },
      onClick: () => switchMode('week'),
    }, 'Week');

    const resetBtn = el('button', {
      style: { display: 'none', padding: '0.15rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: '3px', background: 'transparent', color: 'var(--fg)' },
      onClick: () => {
        resetBtn.style.display = 'none';
        canvasWrap.innerHTML = '';
        renderMotivationChart(canvasWrap, yearRecords, activity.goal, yearCount, chartMode, null, onZoomChange);
      },
    }, '← Reset zoom');

    chartCard.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' } }, [
      el('div', { style: { display: 'flex', gap: 0 } }, [dayBtn, weekBtn]),
      resetBtn,
    ]));

    const canvasWrap = el('div', { style: { marginTop: '0.5rem' } });
    chartCard.appendChild(canvasWrap);
    renderMotivationChart(canvasWrap, yearRecords, activity.goal, yearCount, 'week', null, onZoomChange);

    function onZoomChange(bounds) {
      resetBtn.style.display = bounds ? '' : 'none';
    }

    function switchMode(mode) {
      if (mode === chartMode) return;
      chartMode = mode;
      resetBtn.style.display = 'none';
      Object.assign(dayBtn.style, mode === 'day' ? activeBtn : inactiveBtn);
      Object.assign(weekBtn.style, mode === 'week' ? activeBtn : inactiveBtn);
      canvasWrap.innerHTML = '';
      renderMotivationChart(canvasWrap, yearRecords, activity.goal, yearCount, mode, null, onZoomChange);
    }
  }

  target.appendChild(el('div', {}, [headerRow, headerCard, statsCard, formCard, recordsCard, ...(chartCard ? [chartCard] : [])]));
}

function renderMotivationChart(container, yearRecords, goal, yearCount, mode, initialZoom, onZoomChange) {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const daysInYear = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;
  const todayDayIndex = Math.floor((Date.now() - startOfYear.getTime()) / 86400000);

  let data;
  let totalUnits;
  let todayIndex;

  if (mode === 'week') {
    totalUnits = 52;
    todayIndex = Math.min(Math.floor(todayDayIndex / 7), totalUnits - 1);
    const weekCounts = new Map();
    for (const r of yearRecords) {
      const w = Math.floor((new Date(r.date + 'T00:00:00') - startOfYear) / 86400000 / 7);
      weekCounts.set(w, (weekCounts.get(w) || 0) + r.count);
    }
    let runningRecords = 0;
    data = [];
    for (let w = 0; w < totalUnits; w++) {
      runningRecords += weekCounts.get(w) || 0;
      data.push({ index: w, records: runningRecords, maxPossible: runningRecords + (totalUnits - w - 1) });
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

  let zoom = initialZoom;

  const canvas = el('canvas', {
    style: { width: '100%', height: '200px', display: 'block' },
  });
  container.appendChild(canvas);

  let isDragging = false;
  let dragStartX = 0;
  let dragEndX = 0;

  const pad = { top: 24, right: 12, bottom: 28, left: 40 };

  function getPlotW() {
    const rect = canvas.getBoundingClientRect();
    return rect.width - pad.left - pad.right;
  }

  function pixelToIndex(px) {
    const plotW = getPlotW();
    if (plotW <= 0) return 0;
    const raw = ((px - pad.left) / plotW) * totalUnits;
    return Math.round(Math.max(0, Math.min(totalUnits - 1, raw)));
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

    const x = (idx) => pad.left + ((idx - visibleStart) / visibleUnits) * plotW;
    const y = (val) => pad.top + plotH - (val / maxVal) * plotH;

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

    if (mode === 'week') {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      for (let w = Math.max(0, visibleStart); w <= visibleEnd; w++) {
        const xx = x(w);
        ctx.beginPath();
        ctx.moveTo(xx, pad.top);
        ctx.lineTo(xx, pad.top + plotH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (mode === 'day' && visibleUnits < 60) {
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
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    if (mode === 'day') {
      if (visibleUnits > 60) {
        for (let m = 0; m < 12; m++) {
          const dayOfMonth = Math.floor((new Date(currentYear, m, 1) - startOfYear) / 86400000);
          if (dayOfMonth < visibleStart || dayOfMonth > visibleEnd) continue;
          ctx.fillText(
            new Date(currentYear, m, 1).toLocaleDateString('en', { month: 'short' }),
            x(dayOfMonth), pad.top + plotH + 4
          );
        }
      } else {
        const step = visibleUnits > 20 ? 7 : Math.max(1, Math.floor(visibleUnits / 8));
        for (let day = Math.ceil(visibleStart / step) * step; day <= visibleEnd; day += step) {
          const d = new Date(currentYear, 0, day + 1);
          ctx.fillText(
            d.toLocaleDateString('en', { day: 'numeric', month: 'short' }),
            x(day), pad.top + plotH + 4
          );
        }
      }
    } else {
      if (visibleUnits > 16) {
        for (let m = 0; m < 12; m++) {
          const dayOfMonth = Math.floor((new Date(currentYear, m, 1) - startOfYear) / 86400000);
          const idx = Math.floor(dayOfMonth / 7);
          if (idx < visibleStart || idx > visibleEnd) continue;
          ctx.fillText(
            new Date(currentYear, m, 1).toLocaleDateString('en', { month: 'short' }),
            x(idx), pad.top + plotH + 4
          );
        }
      } else {
        for (let w = visibleStart; w <= visibleEnd; w++) {
          const d = new Date(currentYear, 0, w * 7 + 1);
          ctx.fillText(
            d.toLocaleDateString('en', { day: 'numeric', month: 'short' }),
            x(w), pad.top + plotH + 4
          );
        }
      }
    }

    const currentPossible = data[todayIndex]?.maxPossible ?? 0;
    const belowGoal = currentPossible < goal;

    ctx.beginPath();
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
    ctx.lineTo(x(visibleEnd), y(0));
    ctx.lineTo(x(visibleStart), y(0));
    ctx.closePath();
    ctx.fillStyle = (belowGoal ? danger : success) + '18';
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = belowGoal ? danger : success;
    ctx.lineWidth = 2;
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

  const onMouseUp = () => { endDrag(); };
  window.addEventListener('mouseup', onMouseUp);

  draw();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
  }
}
