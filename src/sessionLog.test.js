import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./ui.js', async () => {
  const actual = await vi.importActual('./ui.js');
  return {
    ...actual,
    formatTime: vi.fn((ts) => new Date(ts).toLocaleTimeString()),
  };
});

vi.mock('./analytics.js', () => ({
  formatLive: vi.fn((ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const remainMs = ms % 1000;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(remainMs).padStart(3, '0')}`;
  }),
  findPrevSameType: vi.fn(() => null),
}));

import { enrichNextTs, renderLogEntries, showEventEditor } from './sessionLog.js';
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

  it('diffs top pause against previous top pause, not intervening bottom pause', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 3000 },
      { id: 3, type: 'down', ts: 3500 },
      { id: 4, type: 'pause', ts: 5000 },
      { id: 5, type: 'up', ts: 10000 },
      { id: 6, type: 'pause', ts: 13000 },
      { id: 7, type: 'down', ts: 14000 },
      { id: 8, type: 'pause', ts: 15000 },
    ];
    enrichNextTs(events, 16000);
    findPrevSameType.mockImplementation((idx, type) => {
      if (type === 'pause' && idx === 5) return events[1];
      return null;
    });
    renderLogEntries(container, events);

    // Events rendered in reverse: events[7] is first in DOM, events[0] is last.
    // Second top pause at idx=5 is at DOM position 2 (events[7,6,5]).
    // prevDuration = 3500-3000=500, thisDuration = 14000-13000=1000, diff = +500
    const diffs = container.querySelectorAll('.log-entry-diff');
    const topPauseDiff = diffs[2];
    expect(topPauseDiff.textContent).toBe('+00:00:500');
  });

  it('diffs bottom pause against previous bottom pause, not intervening top pause', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 2000 },
      { id: 3, type: 'down', ts: 2500 },
      { id: 4, type: 'pause', ts: 3000 },
      { id: 5, type: 'up', ts: 10000 },
      { id: 6, type: 'pause', ts: 11000 },
      { id: 7, type: 'down', ts: 11500 },
      { id: 8, type: 'pause', ts: 12000 },
      { id: 9, type: 'up', ts: 20000 },
      { id: 10, type: 'pause', ts: 21000 },
      { id: 11, type: 'down', ts: 21500 },
      { id: 12, type: 'pause', ts: 22000 },
    ];
    enrichNextTs(events, 30000);
    findPrevSameType.mockImplementation((idx, type) => {
      if (type === 'pause' && idx === 7) return events[3];
      return null;
    });
    renderLogEntries(container, events);

    // 12 events (idx 0-11), rendered in reverse DOM order (events[11] → DOM[0]).
    // Second bottom pause at idx=7 → DOM[4].
    // thisDuration = 20000-12000=8000, previous bottom pause at idx=3 has
    // prevDuration = 10000-3000=7000, diff = +1000 (not the intervening top
    // pause at idx=5 which would give prevDuration=500, diff=+7500).
    const diffs = container.querySelectorAll('.log-entry-diff');
    expect(diffs[4].textContent).toBe('+00:01:000');
    expect(diffs[4].dataset.faster).toBe('false');
  });

  it('diffs bottom pause against previous bottom pause, not intervening top pause', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 2000 },
      { id: 3, type: 'down', ts: 2500 },
      { id: 4, type: 'pause', ts: 3000 },
      { id: 5, type: 'up', ts: 10000 },
      { id: 6, type: 'pause', ts: 11000 },
      { id: 7, type: 'down', ts: 11500 },
      { id: 8, type: 'pause', ts: 12000 },
      { id: 9, type: 'up', ts: 20000 },
      { id: 10, type: 'pause', ts: 21000 },
      { id: 11, type: 'down', ts: 21500 },
      { id: 12, type: 'pause', ts: 22000 },
    ];
    enrichNextTs(events, 30000);
    renderLogEntries(container, events);

    // 12 events (idx 0-11), rendered in reverse DOM order (events[11] → DOM[0]).
    // Second bottom pause at idx=7 → DOM[4].
    // thisDuration = 20000-12000=8000, previous bottom pause at idx=3 has
    // prevDuration = 10000-3000=7000, diff = +1000 (not the intervening top
    // pause at idx=5 which would give prevDuration=500, diff=+7500).
    const diffs = container.querySelectorAll('.log-entry-diff');
    expect(diffs[4].textContent).toBe('+00:01:000');
    expect(diffs[4].dataset.faster).toBe('false');
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

describe('onEdit long-press behavior', () => {
  let editContainer;

  beforeEach(() => {
    editContainer = document.createElement('div');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers onEdit after 500ms pointerdown', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    const onEdit = vi.fn();
    renderLogEntries(editContainer, events, { onEdit });

    editContainer.querySelector('.log-entry').dispatchEvent(new PointerEvent('pointerdown'));
    expect(onEdit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(events[0]);
  });

  it('cancels long-press on pointerup before 500ms', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    const onEdit = vi.fn();
    renderLogEntries(editContainer, events, { onEdit });

    const row = editContainer.querySelector('.log-entry');
    row.dispatchEvent(new PointerEvent('pointerdown'));
    row.dispatchEvent(new PointerEvent('pointerup'));
    vi.advanceTimersByTime(500);

    expect(onEdit).not.toHaveBeenCalled();
  });

  it('cancels long-press on pointerleave before 500ms', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    const onEdit = vi.fn();
    renderLogEntries(editContainer, events, { onEdit });

    const row = editContainer.querySelector('.log-entry');
    row.dispatchEvent(new PointerEvent('pointerdown'));
    row.dispatchEvent(new PointerEvent('pointerleave'));
    vi.advanceTimersByTime(500);

    expect(onEdit).not.toHaveBeenCalled();
  });

  it('cancels long-press on pointercancel before 500ms', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    const onEdit = vi.fn();
    renderLogEntries(editContainer, events, { onEdit });

    const row = editContainer.querySelector('.log-entry');
    row.dispatchEvent(new PointerEvent('pointerdown'));
    row.dispatchEvent(new PointerEvent('pointercancel'));
    vi.advanceTimersByTime(500);

    expect(onEdit).not.toHaveBeenCalled();
  });

  it('does not attach pointer events when onEdit is omitted', () => {
    const events = [{ id: 1, type: 'up', ts: 1000 }];
    renderLogEntries(editContainer, events);
    const row = editContainer.querySelector('.log-entry');

    row.dispatchEvent(new PointerEvent('pointerdown'));
    vi.advanceTimersByTime(500);
  });

  it('triggers onEdit with the correct event per row (reverse render order)', () => {
    const events = [
      { id: 1, type: 'up', ts: 1000 },
      { id: 2, type: 'pause', ts: 2000 },
    ];
    const onEdit = vi.fn();
    renderLogEntries(editContainer, events, { onEdit });

    const rows = editContainer.querySelectorAll('.log-entry');
    // rows[0] = newest event (pause, id 2), rows[1] = oldest event (up, id 1)
    rows[0].dispatchEvent(new PointerEvent('pointerdown'));
    vi.advanceTimersByTime(500);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(events[1]);
  });
});

describe('showEventEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function makeEvent(ts) {
    return { id: 1, sessionId: 1, type: 'up', ts };
  }

  it('creates overlay with card containing input and buttons', () => {
    showEventEditor(makeEvent(1700000000000), vi.fn());

    const overlay = document.querySelector('.event-editor-overlay');
    expect(overlay).not.toBeNull();
    const card = overlay.querySelector('.event-editor-card');
    expect(card).not.toBeNull();
    const input = card.querySelector('input[type="datetime-local"]');
    expect(input).not.toBeNull();
    const buttons = card.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('Cancel');
    expect(buttons[1].textContent).toBe('Save');
  });

  it('pre-fills input with event timestamp', () => {
    showEventEditor(makeEvent(1700000000000), vi.fn());

    const input = document.querySelector('input[type="datetime-local"]');
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('calls onSave with ts patch when Save is clicked', () => {
    const onSave = vi.fn();
    showEventEditor(makeEvent(1700000000000), onSave);

    const input = document.querySelector('input[type="datetime-local"]');
    const saveBtn = document.querySelector('.btn-primary');
    input.value = '2023-11-15T10:30';
    saveBtn.click();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ ts: expect.any(Number) });
  });

  it('removes overlay on Cancel', () => {
    showEventEditor(makeEvent(1700000000000), vi.fn());

    document.querySelector('.btn-ghost').click();
    expect(document.querySelector('.event-editor-overlay')).toBeNull();
  });

  it('ignores Save when input is empty', () => {
    const onSave = vi.fn();
    showEventEditor(makeEvent(1700000000000), onSave);

    const input = document.querySelector('input[type="datetime-local"]');
    input.value = '';
    document.querySelector('.btn-primary').click();

    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.event-editor-overlay')).not.toBeNull();
  });

  it('closes overlay on click outside card', () => {
    showEventEditor(makeEvent(1700000000000), vi.fn());

    const overlay = document.querySelector('.event-editor-overlay');
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(document.querySelector('.event-editor-overlay')).toBeNull();
  });

  it('does not close overlay on click inside card', () => {
    showEventEditor(makeEvent(1700000000000), vi.fn());

    const card = document.querySelector('.event-editor-card');
    card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(document.querySelector('.event-editor-overlay')).not.toBeNull();
  });

  it('saves on Enter key in input', () => {
    const onSave = vi.fn();
    showEventEditor(makeEvent(1700000000000), onSave);

    const input = document.querySelector('input[type="datetime-local"]');
    input.value = '2023-11-15T10:30';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ ts: expect.any(Number) });
  });

  it('cleans up overlay after save', () => {
    const onSave = vi.fn();
    showEventEditor(makeEvent(1700000000000), onSave);

    document.querySelector('.btn-primary').click();

    expect(document.querySelector('.event-editor-overlay')).toBeNull();
  });
});
