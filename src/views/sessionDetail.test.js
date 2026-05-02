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
  aggregateBySegmentKind: vi.fn().mockReturnValue({
    byKind: {
      up_duration: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      top_rest: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      down_duration: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      bottom_rest: { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 },
    }
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
});
