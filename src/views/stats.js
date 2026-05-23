import { el } from '../ui.js';
import { listSessions, listEventsBySession, getCurrentSession } from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  cycleTotalMs,
  aggregateBySegmentKind,
  formatDuration,
  SEGMENT_KINDS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
} from '../analytics.js';
import { createTrendChart, createChartEmptyEl, segmentDataset } from '../chart.js';

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'session', label: 'Current session' },
];

const VIEWS = [
  { value: 'cycles', label: 'Per cycle' },
  { value: 'days', label: 'Daily averages' },
];

const CSS_DARK = matchMedia('(prefers-color-scheme: dark)');

const STATS_KEY = 'walk-cycle-stats';

function loadPrefs() {
  const stored = localStorage.getItem(STATS_KEY);
  return stored ? JSON.parse(stored) : {};
}

function savePrefs(prefs) {
  const current = loadPrefs();
  localStorage.setItem(STATS_KEY, JSON.stringify({ ...current, ...prefs }));
}

export async function renderStats(target) {
  const prefs = loadPrefs();
  let chart = null;
  let range = prefs.range || 'all';
  let view = prefs.view || 'cycles';

  // ---------- Toolbar ----------
  const rangeSel = el(
    'select',
    {
      class: 'btn',
      onChange: (e) => {
        range = e.target.value;
        savePrefs({ range });
        rerender();
      },
    },
    RANGES.map((r) => el('option', { value: r.value }, r.label)),
  );
  rangeSel.value = range;

  const viewSel = el(
    'select',
    {
      class: 'btn',
      onChange: (e) => {
        view = e.target.value;
        savePrefs({ view });
        rerender();
      },
    },
    VIEWS.map((v) => el('option', { value: v.value }, v.label)),
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
      'Lower lines = faster. A rising line for "Up" or "Down" means you\'re slowing down (degrading); falling lines mean improvement.',
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
    if (range === 'session') {
      const session = await getCurrentSession();
      if (!session) return [];
      const events = (await listEventsBySession(session.id)).filter(e => e.type !== 'session_stopped');
      const segs = segmentsFromEvents(events);
      const cs = cyclesFromSegments(segs);
      return cs.map(c => ({
        ...c,
        sessionId: session.id,
        excludeOpts: {
          excludeTopRest: session.includeTopRest === false,
          excludeBottomRest: session.includeBottomRest === false,
        },
      }));
    }

    const sessions = await listSessions({ limit: 500 });
    const cutoff = computeCutoff(range);
    const cycles = [];
    for (const s of sessions) {
      if (cutoff && s.createdAt < cutoff) continue;
      const events = (await listEventsBySession(s.id)).filter(e => e.type !== 'session_stopped');
      const segs = segmentsFromEvents(events);
      const cs = cyclesFromSegments(segs);
      for (const c of cs) {
        if (cutoff && c.endTs < cutoff) continue;
        cycles.push({
          ...c,
          sessionId: s.id,
          excludeOpts: {
            excludeTopRest: s.includeTopRest === false,
            excludeBottomRest: s.includeBottomRest === false,
          },
        });
      }
    }
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

    const totalCycles = cycles.length;

    const allSegs = cycles.flatMap((c) => {
      const opts = c.excludeOpts || {};
      return Object.values(c.segments).filter(s => {
        if (opts.excludeTopRest && s.kind === SEGMENT_KINDS.TOP_REST) return false;
        if (opts.excludeBottomRest && s.kind === SEGMENT_KINDS.BOTTOM_REST) return false;
        return true;
      });
    });
    const { byKind } = aggregateBySegmentKind(allSegs);

    const totalSeg = cycles.reduce((acc, c) => acc + cycleTotalMs(c, c.excludeOpts || {}), 0);
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
          ],
        ),
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
      if (!wrap.querySelector('.chart-empty')) {
        wrap.appendChild(createChartEmptyEl());
      }
      return;
    }
    const wrap = ctx.parentElement;
    const placeholder = wrap.querySelector('.chart-empty');
    if (placeholder) placeholder.remove();

    let datasets = [];
    let labels;

    if (view === 'cycles') {
      labels = cycles.map((_, i) => `#${i + 1}`);
      for (const k of Object.values(SEGMENT_KINDS)) {
        const data = cycles.map(c => {
          const opts = c.excludeOpts || {};
          if (opts.excludeTopRest && k === SEGMENT_KINDS.TOP_REST) return null;
          if (opts.excludeBottomRest && k === SEGMENT_KINDS.BOTTOM_REST) return null;
          const ms = c.segments[k]?.durationMs ?? null;
          return ms == null ? null : ms / 1000;
        });
        if (data.some(d => d !== null)) {
          datasets.push(segmentDataset(k, data));
        }
      }
    } else {
      // Daily averages
      const byDay = new Map(); // dayKey -> { kind: { sum, count } }
      for (const c of cycles) {
        const opts = c.excludeOpts || {};
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
          if (opts.excludeTopRest && k === SEGMENT_KINDS.TOP_REST) continue;
          if (opts.excludeBottomRest && k === SEGMENT_KINDS.BOTTOM_REST) continue;
          const seg = c.segments[k];
          if (seg) {
            bucket[k].sum += seg.durationMs;
            bucket[k].count += 1;
          }
        }
      }
      const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
      labels = sortedDays.map((t) =>
        new Date(t).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
      );
      for (const k of Object.values(SEGMENT_KINDS)) {
        const data = sortedDays.map((t) => {
          const b = byDay.get(t)[k];
          return b.count ? b.sum / b.count / 1000 : null;
        });
        datasets.push(segmentDataset(k, data));
      }
    }

    chart = createTrendChart(ctx, labels, datasets);
  }
}

function computeCutoff(range) {
  if (range === 'all') return null;
  const now = Date.now();
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}
