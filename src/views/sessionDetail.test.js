import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ui.js - keep real el(), mock side effects
vi.mock('../ui.js', async () => {
  const actual = await vi.importActual('../ui.js');
  return {
    ...actual,
    toast: vi.fn(),
    formatTime: vi.fn((ts) => new Date(ts).toLocaleTimeString()),
    formatDateTime: vi.fn((ts) => new Date(ts).toLocaleString()),
  };
});

vi.mock('../chart.js', () => ({
  createTrendChart: vi.fn(),
  buildCycleDatasets: vi.fn().mockReturnValue({ labels: [], datasets: [] }),
  createChartEmptyEl: vi.fn(() => document.createElement('div')),
  segmentDataset: vi.fn(() => ({})),
}));

vi.mock('../db.js', () => ({
  getSession: vi.fn(),
  listEventsBySession: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  getCurrentSession: vi.fn().mockResolvedValue(null),
  setCurrentSession: vi.fn().mockResolvedValue(undefined),
  stopSession: vi.fn().mockResolvedValue(undefined),
  resumeSession: vi.fn().mockResolvedValue(undefined),
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../analytics.js', () => ({
  segmentsFromEvents: vi.fn().mockReturnValue([]),
  cyclesFromSegments: vi.fn().mockReturnValue([]),
  cycleTotalMs: vi.fn((cycle) => cycle.totalMs),
  aggregateBySegmentKind: vi.fn().mockReturnValue({
    byKind: {
      up_duration: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      top_rest: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      down_duration: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      bottom_rest: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
    },
  }),
  formatDuration: vi.fn((ms) => `${ms}ms`),
  formatLive: vi.fn((ms) => `${ms}ms`),
  SEGMENT_KINDS: { UP: 'up_duration', TOP_REST: 'top_rest', DOWN: 'down_duration', BOTTOM_REST: 'bottom_rest' },
  SEGMENT_LABELS: { up_duration: 'Up', top_rest: 'Top rest', down_duration: 'Down', bottom_rest: 'Bottom rest' },
  SEGMENT_COLORS: { up_duration: '#4ade80', top_rest: '#fbbf24', down_duration: '#f87171', bottom_rest: '#94a3b8' },
  findPrevSameType: vi.fn().mockReturnValue(null),
}));

vi.mock('../stateMachine.js', () => ({
  sessionStatus: vi.fn().mockReturnValue('active'),
}));

import { renderSessionDetail } from './sessionDetail.js';
import * as db from '../db.js';
import * as stateMachine from '../stateMachine.js';

describe('sessionDetail.js', () => {
  let target;
  const mockSession = {
    id: 1,
    name: 'Morning Walk',
    createdAt: 1714656000000,
    isStopped: false,
  };

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    vi.clearAllMocks();

    db.getSession.mockResolvedValue(mockSession);
    db.listEventsBySession.mockResolvedValue([]);
    db.getCurrentSession.mockResolvedValue(null);
    stateMachine.sessionStatus.mockReturnValue('active');
  });

  afterEach(() => {
    document.body.removeChild(target);
  });

  it('renders content for valid session', async () => {
    await renderSessionDetail(target, { id: 1 });
    expect(target.innerHTML).not.toBe('');
    expect(db.getSession).toHaveBeenCalledWith(1);
  });

  it('handles session not found', async () => {
    db.getSession.mockResolvedValueOnce(undefined);
    await renderSessionDetail(target, { id: 999 });
    expect(target.textContent).toContain('Session not found');
  });

  it('shows editable name input with session name', async () => {
    await renderSessionDetail(target, { id: 1 });
    const nameInput = target.querySelector('input[type="text"]');
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe('Morning Walk');
  });

  it('shows stop button when session is current and running', async () => {
    db.getCurrentSession.mockResolvedValue({ id: 1 });
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const stopBtn = Array.from(buttons).find(b => b.textContent.includes('Stop'));
    expect(stopBtn).not.toBeUndefined();
  });

  it('calls stopSession when stop button is clicked', async () => {
    db.getCurrentSession.mockResolvedValue({ id: 1 });
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const stopBtn = Array.from(buttons).find(b => b.textContent.includes('Stop'));
    await stopBtn.click();
    expect(db.stopSession).toHaveBeenCalledWith(1);
  });

  it('shows resume button for stopped current session', async () => {
    db.getCurrentSession.mockResolvedValue({ id: 1 });
    db.getSession.mockResolvedValue({ ...mockSession, isStopped: true });
    stateMachine.sessionStatus.mockReturnValue('stopped');
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const resumeBtn = Array.from(buttons).find(b => b.textContent.includes('Resume'));
    expect(resumeBtn).not.toBeUndefined();
  });

  it('shows set current button when not current session', async () => {
    db.getCurrentSession.mockResolvedValue({ id: 2 });
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const setCurrentBtn = Array.from(buttons).find(b => b.textContent.includes('Set as current'));
    expect(setCurrentBtn).not.toBeUndefined();
  });

  it('calls setCurrentSession when set current button is clicked', async () => {
    db.getCurrentSession.mockResolvedValue({ id: 2 });
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const setCurrentBtn = Array.from(buttons).find(b => b.textContent.includes('Set as current'));
    await setCurrentBtn.click();
    expect(db.setCurrentSession).toHaveBeenCalledWith(1);
  });

  it('calls deleteSession after confirmation', async () => {
    window.confirm = vi.fn(() => true);
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const deleteBtn = Array.from(buttons).find(b => b.textContent.includes('Delete'));
    await deleteBtn.click();
    expect(window.confirm).toHaveBeenCalled();
    expect(db.deleteSession).toHaveBeenCalledWith(1);
  });

  it('does not call deleteSession if confirmation is cancelled', async () => {
    window.confirm = vi.fn(() => false);
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const deleteBtn = Array.from(buttons).find(b => b.textContent.includes('Delete'));
    await deleteBtn.click();
    expect(db.deleteSession).not.toHaveBeenCalled();
  });

  it('renders session log section', async () => {
    await renderSessionDetail(target, { id: 1 });
    expect(target.textContent).toContain('Session log');
  });

  it('renders stats card', async () => {
    await renderSessionDetail(target, { id: 1 });
    expect(target.textContent).toContain('Per-segment averages');
  });

  it('persists name change on change', async () => {
    await renderSessionDetail(target, { id: 1 });
    const nameInput = target.querySelector('input[type="text"]');
    nameInput.value = 'New Walk Session';
    nameInput.dispatchEvent(new Event('change'));
    expect(db.updateSession).toHaveBeenCalledWith(1, { name: 'New Walk Session' });
  });

  it('calls resumeSession when resume button is clicked (lines 95-98)', async () => {
    db.getCurrentSession.mockResolvedValue({ id: 1 });
    db.getSession.mockResolvedValue({ ...mockSession, isStopped: true });
    stateMachine.sessionStatus.mockReturnValue('stopped');
    await renderSessionDetail(target, { id: 1 });
    const buttons = target.querySelectorAll('button');
    const resumeBtn = Array.from(buttons).find(b => b.textContent.includes('Resume'));
    await resumeBtn.click();
    expect(db.resumeSession).toHaveBeenCalledWith(1);
  });

  it('renders session log with cycle counts (lines 166-168)', async () => {
    const now = Date.now();
    const mockEvents = [
      { id: 1, sessionId: 1, type: 'up', ts: now },
      { id: 2, sessionId: 1, type: 'pause', ts: now + 1000 },
      { id: 3, sessionId: 1, type: 'up', ts: now + 5000 },
      { id: 4, sessionId: 1, type: 'pause', ts: now + 6000 },
    ];
    db.listEventsBySession.mockResolvedValue(mockEvents);

    // Mock segments to return proper cycle data
    const { segmentsFromEvents } = await import('../analytics.js');
    segmentsFromEvents.mockReturnValue([
      { kind: 'up_duration', durationMs: 1000, cycleIndex: 0, sessionId: 1 },
      { kind: 'top_rest', durationMs: 500, cycleIndex: 0, sessionId: 1 },
    ]);

    await renderSessionDetail(target, { id: 1 });
    const logEntries = target.querySelectorAll('.log-entry');
    expect(logEntries.length).toBe(4);
    // Cycle counts should be shown
    expect(target.textContent).toContain('#1');
    expect(target.textContent).toContain('#2');
  });

  it('shows diff string when comparing with previous same type (lines 175-185)', async () => {
    const now = Date.now();
    const mockEvents = [
      { id: 1, sessionId: 1, type: 'up', ts: now },
      { id: 2, sessionId: 1, type: 'pause', ts: now + 1000 },
      { id: 3, sessionId: 1, type: 'up', ts: now + 5000 },
      { id: 4, sessionId: 1, type: 'pause', ts: now + 6500 },
    ];
    db.listEventsBySession.mockResolvedValue(mockEvents);

    const { findPrevSameType } = await import('../analytics.js');
    // Mock findPrevSameType to return the first up event when looking for second up
    findPrevSameType.mockImplementation((idx, type, events) => {
      if (type === 'up' && idx === 2) return { ...events[0], nextTs: events[1].ts };
      return null;
    });

    await renderSessionDetail(target, { id: 1 });
    // Should show diff string for second up event
    const diffEls = target.querySelectorAll('.log-entry-diff');
    expect(diffEls.length).toBeGreaterThan(0);
  });

  it('renders trend chart when cycles exist (lines 248-251)', async () => {
    const { buildCycleDatasets, createTrendChart } = await import('../chart.js');
    buildCycleDatasets.mockReturnValue({
      labels: ['Cycle 1'],
      datasets: [{ label: 'Up', data: [1.5] }],
    });

    const { cyclesFromSegments } = await import('../analytics.js');
    cyclesFromSegments.mockReturnValue([
      {
        index: 0,
        segments: { up_duration: { durationMs: 1500 } },
        totalMs: 1500,
        startTs: Date.now(),
      },
    ]);

    await renderSessionDetail(target, { id: 1 });
    expect(createTrendChart).toHaveBeenCalled();
  });

  it('renders cycles table with per-cycle data (lines 263-284)', async () => {
    const { cyclesFromSegments } = await import('../analytics.js');
    cyclesFromSegments.mockReturnValue([
      {
        index: 0,
        segments: {
          up_duration: { durationMs: 1500 },
          top_rest: { durationMs: 500 },
          down_duration: { durationMs: 2000 },
          bottom_rest: { durationMs: 300 },
        },
        totalMs: 4300,
        startTs: Date.now(),
      },
    ]);

    await renderSessionDetail(target, { id: 1 });
    expect(target.textContent).toContain('Cycle 1');
    expect(target.textContent).toContain('up');
    expect(target.textContent).toContain('top');
  });

  it('renders partial cycle when up events exceed complete cycles (lines 286-313)', async () => {
    const now = Date.now();
    const mockEvents = [
      { id: 1, sessionId: 1, type: 'up', ts: now },
      { id: 2, sessionId: 1, type: 'pause', ts: now + 1000 },
      { id: 3, sessionId: 1, type: 'down', ts: now + 1500 },
      { id: 4, sessionId: 1, type: 'pause', ts: now + 3500 },
      { id: 5, sessionId: 1, type: 'up', ts: now + 4000 },
    ];
    db.listEventsBySession.mockResolvedValue(mockEvents);

    const { cyclesFromSegments } = await import('../analytics.js');
    cyclesFromSegments.mockReturnValue([
      {
        index: 0,
        segments: {
          up_duration: { durationMs: 1000 },
          top_rest: { durationMs: 500 },
          down_duration: { durationMs: 2000 },
          bottom_rest: { durationMs: 500 },
        },
        totalMs: 4000,
        startTs: now,
      },
    ]);

    await renderSessionDetail(target, { id: 1 });
    // Should show partial cycle
    expect(target.textContent).toContain('partial');
  });

  it('shows stopped time in session status (lines 147-148)', async () => {
    const now = Date.now();
    const mockEvents = [
      { id: 1, sessionId: 1, type: 'up', ts: now },
    ];
    db.listEventsBySession.mockResolvedValue(mockEvents);
    db.getSession.mockResolvedValue({ ...mockSession, isStopped: true });
    stateMachine.sessionStatus.mockReturnValue('stopped');

    const { listEventsBySession } = await import('../db.js');
    listEventsBySession.mockResolvedValueOnce(mockEvents).mockResolvedValueOnce([
      ...mockEvents,
      { id: 2, sessionId: 1, type: 'session_stopped', ts: now + 5000 },
    ]);

    await renderSessionDetail(target, { id: 1 });
    expect(target.textContent).toContain('Stopped');
  });

  describe('cycle rest toggles', () => {
    it('renders both checkboxes checked by default', async () => {
      await renderSessionDetail(target, { id: 1 });
      const checkboxes = target.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);
      expect(checkboxes[0].checked).toBe(true);
      expect(checkboxes[1].checked).toBe(true);
    });

    it('renders both checkboxes unchecked when session has both set to false', async () => {
      db.getSession.mockResolvedValue({
        ...mockSession,
        includeTopRest: false,
        includeBottomRest: false,
      });
      await renderSessionDetail(target, { id: 1 });
      const checkboxes = target.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);
      expect(checkboxes[0].checked).toBe(false);
      expect(checkboxes[1].checked).toBe(false);
    });

    it('calls updateSession when toggling include top rest checkbox', async () => {
      await renderSessionDetail(target, { id: 1 });
      const checkboxes = target.querySelectorAll('input[type="checkbox"]');
      checkboxes[0].checked = false;
      checkboxes[0].dispatchEvent(new Event('change'));
      expect(db.updateSession).toHaveBeenCalledWith(1, { includeTopRest: false });
    });

    it('calls updateSession when toggling include bottom rest checkbox', async () => {
      await renderSessionDetail(target, { id: 1 });
      const checkboxes = target.querySelectorAll('input[type="checkbox"]');
      checkboxes[1].checked = false;
      checkboxes[1].dispatchEvent(new Event('change'));
      expect(db.updateSession).toHaveBeenCalledWith(1, { includeBottomRest: false });
    });

    it('labels checkboxes correctly', async () => {
      await renderSessionDetail(target, { id: 1 });
      const labels = target.querySelectorAll('label');
      const checkboxLabels = Array.from(labels).filter(l => l.querySelector('input[type="checkbox"]'));
      expect(checkboxLabels.length).toBe(2);
      expect(checkboxLabels[0].textContent).toContain('Include top rest');
      expect(checkboxLabels[1].textContent).toContain('Include bottom rest');
    });
  });
});
