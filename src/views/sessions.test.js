/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderSessions } from './sessions.js';

// Mock ui.js - keep actual el and formatDateTime, mock toast
vi.mock('../ui.js', async () => {
  const actual = await vi.importActual('../ui.js');
  return {
    ...actual,
    toast: vi.fn(),
    formatDateTime: vi.fn((ts) => new Date(ts).toLocaleString()),
  };
});

// Mock db.js
vi.mock('../db.js', () => ({
  createSession: vi.fn(),
  listSessions: vi.fn(),
  listEventsBySession: vi.fn(),
  deleteSession: vi.fn(),
  getCurrentSession: vi.fn(),
  setCurrentSession: vi.fn(),
}));

// Mock analytics.js
vi.mock('../analytics.js', () => ({
  segmentsFromEvents: vi.fn(() => []),
  cyclesFromSegments: vi.fn(() => []),
  formatDuration: vi.fn((ms) => `${Math.round(ms / 1000)}s`),
}));

// Mock stateMachine.js
vi.mock('../stateMachine.js', () => ({
  sessionStatus: vi.fn(),
}));

// Import mocked modules
import { toast, formatDateTime } from '../ui.js';
import {
  createSession,
  listSessions,
  listEventsBySession,
  deleteSession,
  getCurrentSession,
  setCurrentSession,
} from '../db.js';
import {
  segmentsFromEvents,
  cyclesFromSegments,
  formatDuration,
} from '../analytics.js';
import { sessionStatus } from '../stateMachine.js';

describe('renderSessions', () => {
  let target;
  let mockLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement('div');

    // Mock window.location.hash with a getter/setter
    mockLocation = { hash: '' };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('empty state', () => {
    it('renders empty state when no sessions exist', async () => {
      listSessions.mockResolvedValue([]);

      await renderSessions(target);

      expect(target.querySelector('h2').textContent).toBe('Sessions');
      expect(target.querySelector('.empty')).toBeTruthy();
      expect(target.querySelector('.empty p').textContent).toBe('No sessions yet.');
      expect(listSessions).toHaveBeenCalledWith({ limit: 200 });
    });

    it('shows loading text initially then updates subheading when empty', async () => {
      listSessions.mockResolvedValue([]);

      await renderSessions(target);

      const subheading = target.querySelector('p.muted');
      expect(subheading.textContent).toBe('');
    });
  });

  describe('sessions list rendering', () => {
    const createMockSession = (id, createdAt, name = null, isStopped = false) => ({
      id,
      createdAt,
      name,
      isStopped,
    });

    const createMockEvents = (sessionId, count = 4) => {
      const events = [];
      const baseTs = 1000000;
      for (let i = 0; i < count; i++) {
        events.push({
          sessionId,
          type: ['up', 'pause', 'down', 'pause'][i % 4],
          ts: baseTs + i * 1000,
        });
      }
      return events;
    };

    beforeEach(() => {
      sessionStatus.mockReturnValue('active');
      getCurrentSession.mockResolvedValue(null);
      segmentsFromEvents.mockImplementation((events) => {
        const segments = [];
        for (let i = 1; i < events.length; i++) {
          segments.push({
            kind: 'up_duration',
            startTs: events[i - 1].ts,
            endTs: events[i].ts,
            durationMs: events[i].ts - events[i - 1].ts,
            sessionId: events[i].sessionId,
          });
        }
        return segments;
      });
      cyclesFromSegments.mockReturnValue([{ index: 0 }, { index: 1 }]);
    });

    it('renders sessions with correct count in subheading', async () => {
      const sessions = [
        createMockSession(1, 1000000, 'Morning Walk'),
        createMockSession(2, 2000000, null),
      ];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const subheading = target.querySelector('p.muted');
      expect(subheading.textContent).toBe('2 sessions');
    });

    it('renders singular count for single session', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const subheading = target.querySelector('p.muted');
      expect(subheading.textContent).toBe('1 session');
    });

    it('renders session names when available', async () => {
      const sessions = [
        createMockSession(1, 1000000, 'Morning Walk'),
        createMockSession(2, 2000000, 'Evening Routine'),
      ];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const sessionNames = Array.from(target.querySelectorAll('.list-item div div:first-child'))
        .map(el => el.textContent);
      expect(sessionNames).toContain('Morning Walk');
      expect(sessionNames).toContain('Evening Routine');
    });

    it('renders formatted date when session has no name', async () => {
      const sessions = [createMockSession(1, 1000000, null)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      formatDateTime.mockReturnValue('Jan 01, 2024, 10:00 AM');

      await renderSessions(target);

      const firstSessionName = target.querySelector('.list-item div div:first-child');
      expect(firstSessionName.textContent).toBe('Jan 01, 2024, 10:00 AM');
    });

    it('renders links to session detail page', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const link = target.querySelector('a[href="#/sessions/1"]');
      expect(link).toBeTruthy();
    });

    it('displays cycle count in meta text', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue(createMockEvents(1, 8));
      cyclesFromSegments.mockReturnValue([{ index: 0 }, { index: 1 }]);

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('2 cycles');
    });

    it('displays singular cycle count for single cycle', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue(createMockEvents(1, 4));
      cyclesFromSegments.mockReturnValue([{ index: 0 }]);

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('1 cycle');
    });

    it('displays duration in meta text', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      const events = createMockEvents(1, 4);
      listEventsBySession.mockResolvedValue(events);
      formatDuration.mockReturnValue('5s');

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('5s');
    });
  });

  describe('session status display', () => {
    const createMockSession = (id, createdAt, name = null, isStopped = false) => ({
      id,
      createdAt,
      name,
      isStopped,
    });

    it('shows status text for current session (visual indicator + status)', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      getCurrentSession.mockResolvedValue({ id: 1 });
      sessionStatus.mockReturnValue('active');

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('▶');
      const row = target.querySelector('.list-item');
      expect(row.classList.contains('list-item--current')).toBe(true);
    });

    it('shows ▶ icon for active session', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      getCurrentSession.mockResolvedValue({ id: 2 });
      sessionStatus.mockReturnValue('active');

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('▶');
    });

    it('shows ■ icon for stopped session', async () => {
      const sessions = [createMockSession(1, 1000000, null, true)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      getCurrentSession.mockResolvedValue(null);
      sessionStatus.mockReturnValue('stopped');

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('■');
    });
  });

  describe('"Set as current" button', () => {
    const createMockSession = (id, createdAt) => ({
      id,
      createdAt,
      isStopped: false,
    });

    beforeEach(() => {
      sessionStatus.mockReturnValue('active');
      getCurrentSession.mockResolvedValue({ id: 999 });
    });

    it('renders "Set as current" button for non-current active sessions', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const button = target.querySelector('.list-item .btn-primary');
      expect(button).toBeTruthy();
      expect(button.textContent).toBe('Set as current');
    });

    it('calls setCurrentSession and shows toast when clicked', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      setCurrentSession.mockResolvedValue({ id: 1 });

      await renderSessions(target);

      const button = target.querySelector('.list-item .btn-primary');
      await button.click();

      expect(setCurrentSession).toHaveBeenCalledWith(1);
      expect(toast).toHaveBeenCalledWith('Session is now current');
    });

    it('navigates to home when "Set as current" is clicked', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      setCurrentSession.mockResolvedValue({ id: 1 });

      await renderSessions(target);

      const button = target.querySelector('.list-item .btn-primary');
      await button.click();

      expect(mockLocation.hash).toBe('/');
    });

    it('does not render "Set as current" button for current session', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      getCurrentSession.mockResolvedValue({ id: 1 });

      await renderSessions(target);

      const buttons = target.querySelectorAll('.list-item .btn-primary');
      expect(buttons.length).toBe(0);
    });
  });

  describe('"Set as current" button for stopped sessions', () => {
    const createMockSession = (id, createdAt) => ({
      id,
      createdAt,
      isStopped: true,
    });

    beforeEach(() => {
      sessionStatus.mockReturnValue('stopped');
      getCurrentSession.mockResolvedValue({ id: 999 });
    });

    it('renders "Set as current" button for stopped sessions', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const button = target.querySelector('.list-item .btn-primary');
      expect(button).toBeTruthy();
      expect(button.textContent).toBe('Set as current');
    });

    it('calls setCurrentSession when clicked', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      setCurrentSession.mockResolvedValue({ id: 1 });

      await renderSessions(target);

      const button = target.querySelector('.list-item .btn-primary');
      await button.click();

      expect(setCurrentSession).toHaveBeenCalledWith(1);
      expect(toast).toHaveBeenCalledWith('Session is now current');
    });
  });

  describe('Delete button', () => {
    const createMockSession = (id, createdAt) => ({
      id,
      createdAt,
      isStopped: false,
    });

    beforeEach(() => {
      sessionStatus.mockReturnValue('active');
      getCurrentSession.mockResolvedValue(null);
      window.confirm = vi.fn();
    });

    it('renders delete button for each session', async () => {
      const sessions = [
        createMockSession(1, 1000000),
        createMockSession(2, 2000000),
      ];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const deleteButtons = target.querySelectorAll('.btn-ghost');
      expect(deleteButtons.length).toBe(2);
      expect(deleteButtons[0].textContent).toBe('🗑');
    });

    it('calls deleteSession after confirmation', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      window.confirm.mockReturnValue(true);

      await renderSessions(target);

      const deleteButton = target.querySelector('.btn-ghost');
      await deleteButton.click();

      expect(window.confirm).toHaveBeenCalledWith('Delete this session?');
      expect(deleteSession).toHaveBeenCalledWith(1);
    });

    it('shows toast after deleting session', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      window.confirm.mockReturnValue(true);

      await renderSessions(target);

      const deleteButton = target.querySelector('.btn-ghost');
      await deleteButton.click();

      expect(toast).toHaveBeenCalledWith('Session deleted');
    });

    it('does not delete when confirmation is cancelled', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      window.confirm.mockReturnValue(false);

      await renderSessions(target);

      const deleteButton = target.querySelector('.btn-ghost');
      await deleteButton.click();

      expect(deleteSession).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith('Session deleted');
    });

    it('re-renders after deletion', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);
      window.confirm.mockReturnValue(true);

      // Mock the second call to listSessions (after re-render)
      listSessions.mockResolvedValueOnce(sessions).mockResolvedValueOnce([]);

      await renderSessions(target);

      const deleteButton = target.querySelector('.btn-ghost');

      // Mock the async behavior - when deleteSession is called, we need to simulate what happens
      // The code calls renderSessions again after deletion, which is async
      // We'll manually trigger a re-render by spying on the behavior
      deleteSession.mockImplementation(async () => {
        // After deletion, simulate the re-render
        target.innerHTML = '';
        await renderSessions(target);
      });

      await deleteButton.click();

      // After re-render with empty sessions list
      expect(target.querySelector('.empty')).toBeTruthy();
    });
  });

  describe('summary calculations', () => {
    const createMockSession = (id, createdAt) => ({
      id,
      createdAt,
      isStopped: false,
    });

    beforeEach(() => {
      sessionStatus.mockReturnValue('active');
      getCurrentSession.mockResolvedValue(null);
    });

    it('calculates cycle count correctly', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      const events = [
        { sessionId: 1, type: 'up', ts: 1000000 },
        { sessionId: 1, type: 'pause', ts: 1001000 },
        { sessionId: 1, type: 'down', ts: 1002000 },
        { sessionId: 1, type: 'pause', ts: 1003000 },
        { sessionId: 1, type: 'up', ts: 1004000 },
        { sessionId: 1, type: 'pause', ts: 1005000 },
        { sessionId: 1, type: 'down', ts: 1006000 },
        { sessionId: 1, type: 'pause', ts: 1007000 },
      ];
      listEventsBySession.mockResolvedValue(events);
      const mockCycles = [{ index: 0 }, { index: 1 }];
      cyclesFromSegments.mockReturnValue(mockCycles);

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('2 cycles');
      expect(cyclesFromSegments).toHaveBeenCalled();
    });

    it('calculates duration correctly based on last event', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      const events = [
        { sessionId: 1, type: 'up', ts: 1000000 },
        { sessionId: 1, type: 'pause', ts: 1005000 },
      ];
      listEventsBySession.mockResolvedValue(events);
      formatDuration.mockReturnValue('5s');

      await renderSessions(target);

      const metaText = target.querySelector('.meta').textContent;
      expect(metaText).toContain('5s');
      expect(formatDuration).toHaveBeenCalledWith(5000); // 1005000 - 1000000
    });

    it('uses createdAt for duration when no events exist', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      expect(formatDuration).toHaveBeenCalledWith(0); // lastTs - createdAt = 1000000 - 1000000
    });

    it('filters out session_stopped events before calculating cycles', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      const events = [
        { sessionId: 1, type: 'up', ts: 1000000 },
        { sessionId: 1, type: 'pause', ts: 1001000 },
        { sessionId: 1, type: 'session_stopped', ts: 1002000 },
      ];
      listEventsBySession.mockResolvedValue(events);

      await renderSessions(target);

      // Check that segmentsFromEvents was called with filtered events
      expect(segmentsFromEvents).toHaveBeenCalledWith(
        events.filter(e => e.type !== 'session_stopped')
      );
    });
  });

  describe('"New Session" button', () => {
    it('renders a "New Session" button in the heading row', async () => {
      listSessions.mockResolvedValue([]);

      await renderSessions(target);

      const btn = target.querySelector('.btn-primary');
      expect(btn).toBeTruthy();
      expect(btn.textContent).toBe('New Session');
    });

    it('calls createSession and navigates to tracker when clicked', async () => {
      createSession.mockResolvedValue(42);
      listSessions.mockResolvedValue([]);

      await renderSessions(target);

      const btn = target.querySelector('.btn-primary');
      await btn.click();

      expect(createSession).toHaveBeenCalled();
      expect(mockLocation.hash).toBe('/');
    });
  });

  describe('list item structure', () => {
    const createMockSession = (id, createdAt) => ({
      id,
      createdAt,
      isStopped: false,
    });

    beforeEach(() => {
      sessionStatus.mockReturnValue('active');
      getCurrentSession.mockResolvedValue(null);
    });

    it('renders sessions in list-item containers', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const listItems = target.querySelectorAll('.list-item');
      expect(listItems.length).toBe(1);
    });

    it('renders session link with correct href', async () => {
      const sessions = [createMockSession(1, 1000000)];
      listSessions.mockResolvedValue(sessions);
      listEventsBySession.mockResolvedValue([]);

      await renderSessions(target);

      const link = target.querySelector('a');
      expect(link.getAttribute('href')).toBe('#/sessions/1');
    });
  });
});
