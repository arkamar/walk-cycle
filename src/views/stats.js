import { el } from '../ui.js';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Title,
  Filler,
} from 'chart.js';
import { listSessions, listEventsBySession } from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  aggregateBySegmentKind,
  formatDuration,
  SEGMENT_KINDS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
} from '../analytics.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Title,
  Filler
);

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const VIEWS = [
  { value: 'cycles', label: 'Per cycle' },
  { value: 'days', label: 'Daily averages' },
];

const CSS_DARK = matchMedia('(prefers-color-scheme: dark)');

export async function renderStats(target) {
  let chart = null;
  let range = 'all';
  let view = 'cycles';

  // ---------- Toolbar ----------
  const rangeSel = el(
    'select',
    {
      class: 'btn',
      onChange: (e) => {
        range = e.target.value;
        rerender();
      },
    },
    RANGES.map((r) => el('option', { value: r.value }, r.label))
  );
  rangeSel.value = range;

  const viewSel = el(
    'select',
    {
      class: 'btn',
      onChange: (e) => {
        view = e.target.value;
        rerender();
      },
    },
    VIEWS.map((v) => el('option', { value: v.value }, v.label))
  );
  viewSel.value = view;

  const toolbar = el('div', { class: 'row between wrap', style: { marginBottom: '0.75rem' } }, [
    el('h2', {}, 'Stats'),
    el('div', { class: 'row wrap' }, [rangeSel, viewSel]),
  ]);

  // ---------- Containers ----------
  const summaryCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Summary'),
    el('div', { class: 'stat-grid', id: 'summary-grid' }),
  ]);

  const chartCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Trend'),
    el('div', { class: 'chart-wrap' }, [
      el('canvas', { id: 'trend-chart' }),
    ]),
    el(
      'p',
      { class: 'muted', style: { marginTop: '0.5rem' } },
      'Lower lines = faster. A rising line for "Up" or "Down" means you\'re slowing down (degrading); falling lines mean improvement.'
    ),
  ]);

  target.appendChild(el('div', {}, [toolbar, summaryCard, chartCard]));

  // Track theme changes during session.
  const themeListener = () => rerender();
  CSS_DARK.addEventListener('change', themeListener);

  await rerender();

  // Cleanup
  return () => {
    CSS_DARK.removeEventListener('change', themeListener);
    if (chart) chart.destroy();
  };

  // ---------- Logic ----------

  async function loadCycles() {
    const sessions = await listSessions({ limit: 500 });
    const cutoff = computeCutoff(range);
    const cycles = [];
    for (const s of sessions) {
      if (cutoff && s.startedAt < cutoff && (s.endedAt ?? s.startedAt) < cutoff) continue;
      const events = await listEventsBySession(s.id);
      const segs = segmentsFromEvents(events);
      const cs = cyclesFromSegments(segs);
      for (const c of cs) {
        if (cutoff && c.endTs < cutoff) continue;
        cycles.push({ ...c, sessionId: s.id });
      }
    }
    // Sort cycles chronologically across sessions.
    cycles.sort((a, b) => a.startTs - b.startTs);
    return cycles;
  }

  async function rerender() {
    const cycles = await loadCycles();
    renderSummary(cycles);
    renderChart(cycles);
  }

  function renderSummary(cycles) {
    const grid = summaryCard.querySelector('#summary-grid');
    grid.innerHTML = '';

    const allSegs = cycles.flatMap((c) => Object.values(c.segments));
    const { byKind } = aggregateBySegmentKind(allSegs);

    const totalCycles = cycles.length;
    const totalSeg = allSegs.reduce((acc, s) => acc + s.durationMs, 0);
    const avgCycleMs = totalCycles ? totalSeg / totalCycles : 0;

    const cards = [
      { label: 'Cycles', value: String(totalCycles) },
      { label: 'Avg cycle', value: totalCycles ? formatDuration(avgCycleMs) : '–' },
      ...Object.values(SEGMENT_KINDS).map((k) => ({
        label: `Avg ${SEGMENT_LABELS[k].toLowerCase()}`,
        value: byKind[k].count ? formatDuration(byKind[k].avgMs) : '–',
        color: SEGMENT_COLORS[k],
      })),
    ];

    for (const c of cards) {
      grid.appendChild(
        el(
          'div',
          {
            class: 'stat',
            style: c.color ? { borderLeft: `4px solid ${c.color}` } : {},
          },
          [
            el('div', { class: 'label' }, c.label),
            el('div', { class: 'value' }, c.value),
          ]
        )
      );
    }
  }

  function renderChart(cycles) {
    const ctx = chartCard.querySelector('#trend-chart');
    if (!ctx) return;
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (!cycles.length) {
      const ctx2d = ctx.getContext('2d');
      ctx2d.clearRect(0, 0, ctx.width, ctx.height);
      // Show empty placeholder text
      const wrap = ctx.parentElement;
      let placeholder = wrap.querySelector('.chart-empty');
      if (!placeholder) {
        placeholder = el(
          'div',
          {
            class: 'chart-empty muted',
            style: {
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          },
          'No data yet — track some cycles first.'
        );
        wrap.appendChild(placeholder);
      }
      return;
    }
    const wrap = ctx.parentElement;
    const placeholder = wrap.querySelector('.chart-empty');
    if (placeholder) placeholder.remove();

    const dark = CSS_DARK.matches;
    const fg = dark ? '#f1f5f9' : '#0f172a';
    const muted = dark ? '#94a3b8' : '#64748b';
    const grid = dark ? 'rgba(241,245,249,0.08)' : 'rgba(15,23,42,0.08)';

    const datasets = [];
    let labels = [];

    if (view === 'cycles') {
      labels = cycles.map((_, i) => `#${i + 1}`);
      for (const k of Object.values(SEGMENT_KINDS)) {
        datasets.push({
          label: SEGMENT_LABELS[k],
          data: cycles.map((c) => {
            const ms = c.segments[k]?.durationMs ?? null;
            return ms == null ? null : ms / 1000; // seconds
          }),
          borderColor: SEGMENT_COLORS[k],
          backgroundColor: SEGMENT_COLORS[k],
          tension: 0.25,
          spanGaps: true,
          pointRadius: 2,
        });
      }
    } else {
      // Daily averages
      const byDay = new Map(); // dayKey -> { kind: { sum, count } }
      for (const c of cycles) {
        const day = new Date(c.startTs);
        day.setHours(0, 0, 0, 0);
        const key = day.getTime();
        let bucket = byDay.get(key);
        if (!bucket) {
          bucket = {};
          for (const k of Object.values(SEGMENT_KINDS)) bucket[k] = { sum: 0, count: 0 };
          byDay.set(key, bucket);
        }
        for (const k of Object.values(SEGMENT_KINDS)) {
          const seg = c.segments[k];
          if (seg) {
            bucket[k].sum += seg.durationMs;
            bucket[k].count += 1;
          }
        }
      }
      const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
      labels = sortedDays.map((t) =>
        new Date(t).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
      );
      for (const k of Object.values(SEGMENT_KINDS)) {
        datasets.push({
          label: SEGMENT_LABELS[k],
          data: sortedDays.map((t) => {
            const b = byDay.get(t)[k];
            return b.count ? b.sum / b.count / 1000 : null;
          }),
          borderColor: SEGMENT_COLORS[k],
          backgroundColor: SEGMENT_COLORS[k],
          tension: 0.25,
          spanGaps: true,
          pointRadius: 3,
        });
      }
    }

    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: fg, boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${formatDuration(ctx.parsed.y * 1000)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: muted, maxTicksLimit: 10 },
            grid: { color: grid },
          },
          y: {
            ticks: {
              color: muted,
              callback: (v) => formatDuration(v * 1000),
            },
            grid: { color: grid },
            title: { display: true, text: 'Duration', color: muted },
          },
        },
      },
    });
  }
}

function computeCutoff(range) {
  if (range === 'all') return null;
  const now = Date.now();
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}
