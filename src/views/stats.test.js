import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to set up matchMedia BEFORE importing stats.js
// Can't do it here since stats.js is imported below
// Solution: mock the module that uses it

vi.mock('../analytics.js', () => ({
  segmentsFromEvents: vi.fn().mockReturnValue([]),
  cyclesFromSegments: vi.fn().mockReturnValue([]),
  aggregateBySegmentKind: vi.fn().mockReturnValue({
    byKind: {
      up_duration: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      top_rest: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      down_duration: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      bottom_rest: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
    }
  }),
  formatDuration: vi.fn((ms) => `${ms}ms`),
  SEGMENT_KINDS: { UP: 'up_duration', TOP_REST: 'top_rest', DOWN: 'down_duration', BOTTOM_REST: 'bottom_rest' },
  SEGMENT_LABELS: { up_duration: 'Up', top_rest: 'Top rest', down_duration: 'Down', bottom_rest: 'Bottom rest' },
  SEGMENT_COLORS: { up_duration: '#4ade80', top_rest: '#fbbf24', down_duration: '#f87171', bottom_rest: '#94a3b8' },
}));

vi.mock('../db.js', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  listEventsBySession: vi.fn().mockResolvedValue([]),
  getCurrentSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../chart.js', () => ({
  createTrendChart: vi.fn(),
  buildCycleDatasets: vi.fn().mockReturnValue({ labels: [], datasets: [] }),
}));

vi.mock('../ui.js', async () => {
  const actual = await vi.importActual('../ui.js');
  return {
    ...actual,
    formatTime: vi.fn(),
    formatDateTime: vi.fn(),
  };
});

// Mock chart.js at the module level
vi.mock('chart.js', () => {
  const Chart = vi.fn();
  Chart.register = vi.fn();
  return {
    Chart,
    LineController: vi.fn(),
    LineElement: vi.fn(),
    PointElement: vi.fn(),
    LinearScale: vi.fn(),
    CategoryScale: vi.fn(),
    Tooltip: vi.fn(),
    Legend: vi.fn(),
    Title: vi.fn(),
    Filler: vi.fn(),
  };
});

// Now import - matchMedia needs to exist before stats.js evaluates
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import { renderStats } from './stats.js';

describe('stats.js', () => {
  let target;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    document.body.removeChild(target);
  });

  it('renders toolbar with range and view selectors', async () => {
    const cleanup = await renderStats(target);
    expect(target.querySelector('h2').textContent).toBe('Stats');
    expect(target.querySelectorAll('select').length).toBe(2);
    if (cleanup) cleanup();
  });

  it('renders summary card', async () => {
    const cleanup = await renderStats(target);
    expect(target.textContent).toContain('Summary');
    if (cleanup) cleanup();
  });

  it('renders trend chart card', async () => {
    const cleanup = await renderStats(target);
    expect(target.textContent).toContain('Trend');
    if (cleanup) cleanup();
  });

  it('saves range preference to localStorage', async () => {
    const cleanup = await renderStats(target);
    const selects = target.querySelectorAll('select');
    const rangeSelect = selects[0];
    rangeSelect.value = '7d';
    rangeSelect.dispatchEvent(new Event('change'));
    const saved = JSON.parse(localStorage.getItem('walk-cycle-stats'));
    expect(saved).toHaveProperty('range', '7d');
    if (cleanup) cleanup();
  });

  it('saves view preference to localStorage', async () => {
    const cleanup = await renderStats(target);
    const selects = target.querySelectorAll('select');
    const viewSelect = selects[1];
    viewSelect.value = 'days';
    viewSelect.dispatchEvent(new Event('change'));
    const saved = JSON.parse(localStorage.getItem('walk-cycle-stats'));
    expect(saved).toHaveProperty('view', 'days');
    if (cleanup) cleanup();
  });

  it('returns cleanup function', async () => {
    const cleanup = await renderStats(target);
    expect(typeof cleanup).toBe('function');
    if (cleanup) cleanup();
  });

  it('handles empty data gracefully', async () => {
    const cleanup = await renderStats(target);
    expect(target.textContent).toContain('Summary');
    if (cleanup) cleanup();
  });

  it('renders stat grid with cycle count when cycles exist', async () => {
    const { cyclesFromSegments } = await import('../analytics.js');
    cyclesFromSegments.mockReturnValue([
      { index: 0, segments: {} },
      { index: 1, segments: {} },
    ]);
    const cleanup = await renderStats(target);
    expect(target.textContent).toContain('Cycles');
    if (cleanup) cleanup();
  });
});
