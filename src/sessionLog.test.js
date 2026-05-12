import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./ui.js', async () => {
  const actual = await vi.importActual('./ui.js');
  return {
    ...actual,
    formatTime: vi.fn((ts) => new Date(ts).toLocaleTimeString()),
  };
});

vi.mock('./analytics.js', () => ({
  formatLive: vi.fn((ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}:000`;
  }),
  findPrevSameType: vi.fn(() => null),
}));

import { enrichNextTs, renderLogEntries } from './sessionLog.js';
import { findPrevSameType } from './analytics.js';

describe('enrichNextTs', () => {
  it('does nothing for empty events', () => {
    const events = [];
    enrichNextTs(events);
    expect(events).toEqual([]);
  });

  it('sets nextTs on a single event using provided value', () => {
    const events = [{ id: 1, ts: 1000 }];
    enrichNextTs(events, 5000);
    expect(events[0].nextTs).toBe(5000);
  });

  it('sets intermediate events to next event ts and last to provided value', () => {
    const events = [
      { id: 1, ts: 1000 },
      { id: 2, ts: 3000 },
      { id: 3, ts: 6000 },
    ];
    enrichNextTs(events, 9999);
    expect(events[0].nextTs).toBe(3000);
    expect(events[1].nextTs).toBe(6000);
    expect(events[2].nextTs).toBe(9999);
  });

  it('defaults lastNextTs to Date.now()', () => {
    const now = Date.now();
    const events = [{ id: 1, ts: 1000 }];
    enrichNextTs(events);
    expect(events[0].nextTs).toBeGreaterThanOrEqual(now);
  });
});

describe('sessionLog.js', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    vi.clearAllMocks();
  });

  it('renders events in reverse order (newest first)', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 2000 },
      { id: 3, type: 'down', ts: 3000 },
    ];
    renderLogEntries(container, events);
    const kinds = container.querySelectorAll('.log-entry-kind');
    expect(kinds.length).toBe(3);
    expect(kinds[0].textContent).toBe('Down');
    expect(kinds[2].textContent).toBe('Up');
  });

  it('shows cycle numbers based on up events', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 2000 },
      { id: 3, type: 'up', ts: 3000 },
      { id: 4, type: 'pause', ts: 4000 },
    ];
    renderLogEntries(container, events);
    const cycles = container.querySelectorAll('.log-entry-cycle');
    expect(cycles[0].textContent).toBe('#2');
    expect(cycles[1].textContent).toBe('#2');
    expect(cycles[2].textContent).toBe('#1');
    expect(cycles[3].textContent).toBe('#1');
  });

  it('shows no cycle number before first up', () => {
    const events = [
      { id: 1, type: 'pause', ts: 1000 },
      { id: 2, type: 'down', ts: 2000 },
    ];
    renderLogEntries(container, events);
    const cycles = container.querySelectorAll('.log-entry-cycle');
    cycles.forEach(el => expect(el.textContent).toBe(''));
  });

  it('uses default event labels', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    renderLogEntries(container, events);
    expect(container.querySelector('.log-entry-kind').textContent).toBe('Up');
  });

  it('accepts custom event labels', () => {
    const events = [{ id: 1, type: 'stop', ts: 1000 }];
    renderLogEntries(container, events, { eventLabels: { stop: 'Stop' } });
    expect(container.querySelector('.log-entry-kind').textContent).toBe('Stop');
  });

  it('falls back to event type for unknown labels', () => {
    const events = [{ id: 1, type: 'custom', ts: 1000 }];
    renderLogEntries(container, events);
    expect(container.querySelector('.log-entry-kind').textContent).toBe('custom');
  });

  it('computes duration from next event timestamp', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 5000 },
    ];
    renderLogEntries(container, events);
    const durations = container.querySelectorAll('.log-entry-duration');
    expect(durations[1].textContent).toBe('00:04:000');
  });

  it('uses ev.nextTs for last event duration', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 5000, nextTs: 9000 },
    ];
    renderLogEntries(container, events);
    const durations = container.querySelectorAll('.log-entry-duration');
    expect(durations[0].textContent).toBe('00:04:000');
  });

  it('does not show diff when thisDuration is zero', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000, nextTs: 3000 },
      { id: 2, type: 'up', ts: 3000, nextTs: 3000 },
    ];
    findPrevSameType.mockReturnValue({ nextTs: 3000, ts: 1000 });
    renderLogEntries(container, events);
    const nonEmpty = Array.from(container.querySelectorAll('.log-entry-diff'))
      .filter(el => el.textContent !== '');
    expect(nonEmpty.length).toBe(0);
  });

  it('does not show diff when thisDuration equals prevDuration', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000, nextTs: 3000 },
      { id: 2, type: 'up', ts: 3000, nextTs: 5000 },
    ];
    findPrevSameType.mockReturnValue({ nextTs: 3000, ts: 1000 });
    renderLogEntries(container, events);
    const nonEmpty = Array.from(container.querySelectorAll('.log-entry-diff'))
      .filter(el => el.textContent !== '');
    expect(nonEmpty.length).toBe(0);
  });

  it('shows 00:00 for last event when isRunning', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 5000 },
    ];
    renderLogEntries(container, events, { isRunning: true });
    const durations = container.querySelectorAll('.log-entry-duration');
    expect(durations[0].textContent).toBe('00:00');
  });

  it('shows – for single event without nextTs', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    renderLogEntries(container, events);
    expect(container.querySelector('.log-entry-duration').textContent).toBe('–');
  });

  it('shows – when nextTs equals ts (zero duration)', () => {
    const events = [{ id: 1, type: 'up', ts: 1000, nextTs: 1000 }];
    renderLogEntries(container, events);
    expect(container.querySelector('.log-entry-duration').textContent).toBe('–');
  });

  it('handles empty events', () => {
    renderLogEntries(container, []);
    expect(container.querySelectorAll('.log-entry').length).toBe(0);
  });

  it('shows diff string when slower than previous same type', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 3000 },
      { id: 3, type: 'up', ts: 10000 },
      { id: 4, type: 'pause', ts: 15000 },
    ];
    findPrevSameType.mockImplementation((idx, type) => {
      if (type === 'up' && idx === 2) return { ...events[0], nextTs: events[1].ts };
      return null;
    });
    renderLogEntries(container, events);
    const diffs = container.querySelectorAll('.log-entry-diff');
    const nonEmpty = Array.from(diffs).find(el => el.textContent !== '');
    expect(nonEmpty).toBeDefined();
    expect(nonEmpty.dataset.faster).toBe('false');
  });

  it('shows diff string when faster than previous same type', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 5000 },
      { id: 3, type: 'up', ts: 6000 },
      { id: 4, type: 'pause', ts: 8000 },
    ];
    findPrevSameType.mockImplementation((idx, type) => {
      if (type === 'up' && idx === 2) return { ...events[0], nextTs: events[1].ts };
      return null;
    });
    renderLogEntries(container, events);
    const diffs = container.querySelectorAll('.log-entry-diff');
    const nonEmpty = Array.from(diffs).find(el => el.textContent !== '');
    expect(nonEmpty).toBeDefined();
    expect(nonEmpty.textContent.startsWith('-')).toBe(true);
    expect(nonEmpty.dataset.faster).toBe('true');
  });

  it('does not show diff for the last event', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 3000 },
    ];
    findPrevSameType.mockImplementation((idx, type) => {
      if (type === 'pause' && idx === 1) return { ...events[0], nextTs: events[1].ts };
      return null;
    });
    renderLogEntries(container, events);
    const diffs = container.querySelectorAll('.log-entry-diff');
    const nonEmpty = Array.from(diffs).filter(el => el.textContent !== '');
    expect(nonEmpty.length).toBe(0);
  });

  it('shows no diff when prevSame lacks nextTs', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'up', ts: 5000 },
    ];
    findPrevSameType.mockReturnValue({ ...events[0], nextTs: undefined });
    renderLogEntries(container, events);
    const nonEmpty = Array.from(container.querySelectorAll('.log-entry-diff'))
      .filter(el => el.textContent !== '');
    expect(nonEmpty.length).toBe(0);
  });

  it('renders time element for each event', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 2000 },
    ];
    renderLogEntries(container, events);
    expect(container.querySelectorAll('.log-entry-time').length).toBe(2);
  });
});
