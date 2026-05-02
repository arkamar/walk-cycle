import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getActiveSession,
  getCurrentSession,
  getStoppedSession,
  getSession,
  createSession,
  updateSession,
  stopSession,
  resumeSession,
  setCurrentSession,
  listSessions,
  deleteSession,
  addEvent,
  deleteEvent,
  listEventsBySession,
  listAllEvents,
  exportAll,
  importAll,
  clearAll,
} from './db.js';

const CURRENT_SESSION_KEY = 'walk-cycle-current-session-id';

describe('db session queries', () => {
  beforeEach(async () => {
    await clearAll();
  });

  afterEach(() => {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  });

  describe('getActiveSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getActiveSession()).toBeNull();
    });

    it('returns session with isStopped false', async () => {
      const id = await createSession(Date.now(), 'active');
      const session = await getActiveSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.isStopped).toBe(false);
    });

    it('returns null when only stopped sessions exist', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      expect(await getActiveSession()).toBeNull();
    });

    it('returns the latest active session', async () => {
      await createSession(Date.now() - 1000, 'first');
      await stopSession(await createSession(Date.now() - 500, 'stopped'));
      const id = await createSession(Date.now(), 'second');
      const active = await getActiveSession();
      expect(active.note).toBe('second');
      expect(active.id).toBe(id);
    });
  });

  describe('getCurrentSession', () => {
    it('returns null when current session key is cleared', async () => {
      await createSession(Date.now(), 'active');
      localStorage.removeItem(CURRENT_SESSION_KEY);
      expect(await getCurrentSession()).toBeNull();
    });

    it('returns the session stored in localStorage', async () => {
      const id = await createSession(Date.now(), 'test');
      const session = await getCurrentSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.note).toBe('test');
    });

    it('returns stopped session if it is current', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      const session = await getCurrentSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.isStopped).toBe(true);
    });
  });

  describe('getStoppedSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getStoppedSession()).toBeNull();
    });

    it('returns null when only active sessions exist', async () => {
      await createSession(Date.now(), 'active');
      expect(await getStoppedSession()).toBeNull();
    });

    it('returns the stopped session', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      const stopped = await getStoppedSession();
      expect(stopped).not.toBeNull();
      expect(stopped.id).toBe(id);
      expect(stopped.isStopped).toBe(true);
    });
  });

  describe('setCurrentSession', () => {
    it('stores the session id in localStorage', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      await createSession(Date.now(), 'second');

      await setCurrentSession(id1);

      expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBe(String(id1));
      const current = await getCurrentSession();
      expect(current.id).toBe(id1);
    });

    it('does not modify session data', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      await stopSession(id1);
      const before = await getSession(id1);

      await setCurrentSession(id1);

      const after = await getSession(id1);
      expect(after.isStopped).toBe(before.isStopped);
      expect(after.createdAt).toBe(before.createdAt);
    });

    it('returns null for non-existent session', async () => {
      expect(await setCurrentSession(9999)).toBeNull();
    });

    it('dispatches current-session-changed event', async () => {
      const id = await createSession(Date.now(), 'test');
      let fired = false;
      const handler = () => { fired = true; };
      window.addEventListener('current-session-changed', handler);
      await setCurrentSession(id);
      window.removeEventListener('current-session-changed', handler);
      expect(fired).toBe(true);
    });
  });
});

describe('createSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  afterEach(() => {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  });

  it('defaults createdAt to Date.now() and note to empty string', async () => {
    const before = Date.now();
    const id = await createSession();
    const after = Date.now();
    const s = await getSession(id);
    expect(s.id).toBe(id);
    expect(s.createdAt).toBeGreaterThanOrEqual(before);
    expect(s.createdAt).toBeLessThanOrEqual(after);
    expect(s.note).toBe('');
  });

  it('persists isStopped as false initially', async () => {
    const id = await createSession();
    const s = await getSession(id);
    expect(s.isStopped).toBe(false);
  });

  it('accepts custom createdAt and note', async () => {
    const id = await createSession(12345, 'my note');
    const s = await getSession(id);
    expect(s.createdAt).toBe(12345);
    expect(s.note).toBe('my note');
  });

  it('returns auto-incremented numeric id', async () => {
    const id1 = await createSession();
    const id2 = await createSession();
    expect(typeof id1).toBe('number');
    expect(typeof id2).toBe('number');
    expect(id2).toBeGreaterThan(id1);
  });

  it('sets itself as current session', async () => {
    const id = await createSession();
    expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBe(String(id));
  });
});

describe('updateSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('applies arbitrary patch via Object.assign', async () => {
    const id = await createSession(1000, 'original');
    await updateSession(id, { note: 'updated', extra: 'field' });
    const s = await getSession(id);
    expect(s.note).toBe('updated');
    expect(s.extra).toBe('field');
    expect(s.createdAt).toBe(1000);
  });

  it('can toggle isStopped', async () => {
    const id = await createSession();
    await updateSession(id, { isStopped: true });
    const s = await getSession(id);
    expect(s.isStopped).toBe(true);
  });

  it('returns null for unknown id', async () => {
    expect(await updateSession(9999, { note: 'x' })).toBeNull();
  });
});

describe('stopSession / resumeSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('stopSession sets isStopped to true', async () => {
    const id = await createSession();
    const result = await stopSession(id);
    expect(result.isStopped).toBe(true);
  });

  it('stopSession creates a session_stopped event', async () => {
    const id = await createSession();
    await stopSession(id);
    const events = await listEventsBySession(id);
    const stopped = events.find(e => e.type === 'session_stopped');
    expect(stopped).toBeDefined();
    expect(stopped.sessionId).toBe(id);
  });

  it('resumeSession clears isStopped', async () => {
    const id = await createSession();
    await stopSession(id);
    await resumeSession(id);
    const s = await getSession(id);
    expect(s.isStopped).toBe(false);
  });

  it('resumeSession deletes the session_stopped event', async () => {
    const id = await createSession();
    await stopSession(id);
    await resumeSession(id);
    const events = await listEventsBySession(id);
    expect(events.find(e => e.type === 'session_stopped')).toBeUndefined();
  });

  it('resumeSession preserves other fields', async () => {
    const id = await createSession(5000, 'keep note');
    await stopSession(id);
    await resumeSession(id);
    const s = await getSession(id);
    expect(s.note).toBe('keep note');
    expect(s.createdAt).toBe(5000);
  });

  it('resumeSession returns null for unknown id', async () => {
    expect(await resumeSession(9999)).toBeNull();
  });

  it('stopSession returns null for unknown id', async () => {
    expect(await stopSession(9999)).toBeNull();
  });
});

describe('getSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('returns full record for existing id', async () => {
    const id = await createSession(999, 'hello');
    const s = await getSession(id);
    expect(s.id).toBe(id);
    expect(s.createdAt).toBe(999);
    expect(s.note).toBe('hello');
  });

  it('returns undefined for unknown id', async () => {
    expect(await getSession(9999)).toBeUndefined();
  });
});

describe('listSessions', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('returns sessions newest-first by createdAt', async () => {
    await createSession(3000, 'third');
    await createSession(1000, 'first');
    await createSession(2000, 'second');
    const list = await listSessions();
    expect(list[0].note).toBe('third');
    expect(list[1].note).toBe('second');
    expect(list[2].note).toBe('first');
  });

  it('respects default limit of 100', async () => {
    for (let i = 0; i < 105; i++) {
      await createSession(i, `s${i}`);
    }
    const list = await listSessions();
    expect(list).toHaveLength(100);
    expect(list[0].note).toBe('s104');
  });

  it('respects custom limit', async () => {
    for (let i = 0; i < 5; i++) {
      await createSession(i, `s${i}`);
    }
    expect((await listSessions({ limit: 2 })).length).toBe(2);
  });

  it('returns empty array for limit 0', async () => {
    await createSession();
    expect(await listSessions({ limit: 0 })).toEqual([]);
  });
});

describe('deleteSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  afterEach(() => {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  });

  it('removes the session record', async () => {
    const id = await createSession();
    await deleteSession(id);
    expect(await getSession(id)).toBeUndefined();
  });

  it('cascades to events with matching sessionId', async () => {
    const id = await createSession();
    await addEvent({ sessionId: id, type: 'up' });
    await addEvent({ sessionId: id, type: 'pause' });
    await deleteSession(id);
    expect((await listEventsBySession(id)).length).toBe(0);
  });

  it('leaves other sessions and events untouched', async () => {
    const keepId = await createSession(1000, 'keep');
    const delId = await createSession(2000, 'delete');
    await addEvent({ sessionId: keepId, type: 'up', ts: 100 });
    await addEvent({ sessionId: delId, type: 'up', ts: 200 });
    await deleteSession(delId);
    expect(await getSession(keepId)).toBeDefined();
    const keepEvents = await listEventsBySession(keepId);
    expect(keepEvents).toHaveLength(1);
    expect(keepEvents[0].type).toBe('up');
  });

  it('is a no-op for unknown id', async () => {
    const before = await listSessions();
    await deleteSession(9999);
    expect(await listSessions()).toEqual(before);
  });

  it('clears current session from localStorage if deleted', async () => {
    const id = await createSession();
    await deleteSession(id);
    expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBeNull();
  });
});

describe('addEvent', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it.each(['up', 'pause', 'down', 'session_stopped'])('accepts type "%s"', async (type) => {
    const id = await createSession();
    const result = await addEvent({ sessionId: id, type, ts: 1234 });
    expect(result.id).toBeDefined();
    expect(result.sessionId).toBe(id);
    expect(result.type).toBe(type);
    expect(result.ts).toBe(1234);
  });

  it('defaults ts to Date.now()', async () => {
    const id = await createSession();
    const before = Date.now();
    const result = await addEvent({ sessionId: id, type: 'up' });
    expect(result.ts).toBeGreaterThanOrEqual(before);
  });

  it('returns full record with new id', async () => {
    const id = await createSession();
    const result = await addEvent({ sessionId: id, type: 'pause', ts: 5000 });
    const events = await listAllEvents();
    const stored = events.find((e) => e.id === result.id);
    expect(stored).toBeDefined();
    expect(stored.sessionId).toBe(id);
    expect(stored.type).toBe('pause');
  });

  it('throws for invalid event type', async () => {
    const id = await createSession();
    await expect(addEvent({ sessionId: id, type: 'foo' })).rejects.toThrow(
      'Invalid event type: foo'
    );
  });

  it('throws for empty string type', async () => {
    const id = await createSession();
    await expect(addEvent({ sessionId: id, type: '' })).rejects.toThrow();
  });
});

describe('deleteEvent', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('removes only the targeted event', async () => {
    const id = await createSession();
    const e1 = await addEvent({ sessionId: id, type: 'up', ts: 100 });
    const e2 = await addEvent({ sessionId: id, type: 'down', ts: 200 });
    await deleteEvent(e1.id);
    const remaining = await listAllEvents();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(e2.id);
  });

  it('is a no-op for unknown id', async () => {
    await expect(deleteEvent(9999)).resolves.toBeUndefined();
  });
});

describe('listEventsBySession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('returns only events for that session', async () => {
    const id1 = await createSession();
    const id2 = await createSession();
    await addEvent({ sessionId: id1, type: 'up', ts: 100 });
    await addEvent({ sessionId: id2, type: 'pause', ts: 200 });
    await addEvent({ sessionId: id1, type: 'down', ts: 300 });
    const events = await listEventsBySession(id1);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.sessionId === id1)).toBe(true);
  });

  it('returns events sorted by ts ascending', async () => {
    const id = await createSession();
    await addEvent({ sessionId: id, type: 'down', ts: 300 });
    await addEvent({ sessionId: id, type: 'up', ts: 100 });
    await addEvent({ sessionId: id, type: 'pause', ts: 200 });
    const events = await listEventsBySession(id);
    expect(events.map((e) => e.ts)).toEqual([100, 200, 300]);
  });

  it('returns empty array for session with no events', async () => {
    const id = await createSession();
    expect(await listEventsBySession(id)).toEqual([]);
  });
});

describe('listAllEvents', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('returns all events across sessions ordered by ts', async () => {
    const id1 = await createSession();
    const id2 = await createSession();
    await addEvent({ sessionId: id1, type: 'up', ts: 300 });
    await addEvent({ sessionId: id2, type: 'pause', ts: 100 });
    await addEvent({ sessionId: id1, type: 'down', ts: 200 });
    const events = await listAllEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.ts)).toEqual([100, 200, 300]);
  });
});

describe('exportAll', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('returns correct shape with version 3', async () => {
    const id = await createSession(1000, 'test');
    await addEvent({ sessionId: id, type: 'up', ts: 2000 });
    const data = await exportAll();
    expect(data.version).toBe(3);
    expect(typeof data.exportedAt).toBe('number');
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
  });

  it('includes all rows with their ids', async () => {
    const id = await createSession(1000, 'test');
    const e = await addEvent({ sessionId: id, type: 'pause', ts: 2000 });
    const data = await exportAll();
    const session = data.sessions.find((s) => s.id === id);
    expect(session).toBeDefined();
    expect(session.note).toBe('test');
    expect(session.createdAt).toBe(1000);
    const event = data.events.find((ev) => ev.id === e.id);
    expect(event).toBeDefined();
    expect(event.type).toBe('pause');
  });
});

describe('importAll', () => {
  beforeEach(async () => {
    await clearAll();
  });

  afterEach(() => {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  });

  it('throws for null data', async () => {
    await expect(importAll(null)).rejects.toThrow('Invalid import data');
  });

  it('throws for empty object', async () => {
    await expect(importAll({})).rejects.toThrow('Invalid import data');
  });

  it('throws for missing sessions array', async () => {
    await expect(
      importAll({ sessions: null, events: [] })
    ).rejects.toThrow('Invalid import data');
  });

  it('throws for missing events array', async () => {
    await expect(
      importAll({ sessions: [], events: null })
    ).rejects.toThrow('Invalid import data');
  });

  it('replace mode clears existing data first', async () => {
    const id = await createSession();
    await addEvent({ sessionId: id, type: 'up' });
    await importAll({ sessions: [], events: [] });
    expect((await listSessions()).length).toBe(0);
    expect((await listAllEvents()).length).toBe(0);
  });

  it('merge mode preserves existing data', async () => {
    await createSession(1000, 'existing');
    await importAll(
      {
        sessions: [{ id: 999, createdAt: 2000, note: 'imported', isStopped: false }],
        events: [],
      },
      { merge: true }
    );
    const sessions = await listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.some((s) => s.note === 'existing')).toBe(true);
    expect(sessions.some((s) => s.note === 'imported')).toBe(true);
  });

  it('re-maps session ids in events', async () => {
    const data = {
      sessions: [{ id: 100, createdAt: 1000, note: 's', isStopped: false }],
      events: [{ id: 1, sessionId: 100, type: 'up', ts: 500 }],
    };
    await importAll(data);
    const events = await listAllEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('up');
    expect(events[0].ts).toBe(500);
    expect(events[0].sessionId).not.toBe(100);
    const importedSession = (await listSessions()).find((s) => s.note === 's');
    expect(events[0].sessionId).toBe(importedSession.id);
  });

  it('round-trips export → clear → import', async () => {
    const id = await createSession(777, 'rt');
    await addEvent({ sessionId: id, type: 'up', ts: 888 });
    const exported = await exportAll();
    await clearAll();
    await importAll(exported);
    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].createdAt).toBe(777);
    expect(sessions[0].note).toBe('rt');
    const events = await listAllEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('up');
    expect(events[0].ts).toBe(888);
  });

  it('keeps session ids that are not in the import map (fallback)', async () => {
    const existingId = await createSession(1000, 'existing');
    await importAll(
      {
        sessions: [{ id: 200, createdAt: 3000, note: 'orphan-event', isStopped: false }],
        events: [{ id: 50, sessionId: existingId, type: 'down', ts: 400 }],
      },
      { merge: true }
    );
    const events = await listEventsBySession(existingId);
    expect(events.some((e) => e.type === 'down' && e.ts === 400)).toBe(true);
  });
});

  describe('clearAll', () => {
    afterEach(() => {
      localStorage.removeItem(CURRENT_SESSION_KEY);
    });

    it('empties both stores', async () => {
      const id = await createSession();
      await addEvent({ sessionId: id, type: 'up' });
      await clearAll();
      expect(await listSessions()).toEqual([]);
      expect(await listAllEvents()).toEqual([]);
    });

    it('clears current session from localStorage', async () => {
      const id = await createSession();
      expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBe(String(id));
      await clearAll();
      expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBeNull();
    });
  });

  describe('setCurrentSessionId(null) via clearAll', () => {
    it('clears current session key (line 95)', async () => {
      const id = await createSession();
      expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBe(String(id));
      await clearAll();
      expect(localStorage.getItem(CURRENT_SESSION_KEY)).toBeNull();
    });
  });
