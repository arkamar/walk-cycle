import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveSession,
  getLatestEndedSession,
  getCurrentSession,
  getStoppedSession,
  getSession,
  createSession,
  endSession,
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

describe('db session queries', () => {
  beforeEach(async () => {
    const { clearAll } = await import('./db.js');
    await clearAll();
  });

  describe('getActiveSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getActiveSession()).toBeNull();
    });

    it('returns session with neither endedAt nor stoppedAt', async () => {
      const id = await createSession(Date.now(), 'active');
      const session = await getActiveSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.endedAt).toBeNull();
      expect(session.stoppedAt).toBeNull();
    });

    it('returns null when only ended sessions exist', async () => {
      const id = await createSession(Date.now(), 'ended');
      await endSession(id);
      expect(await getActiveSession()).toBeNull();
    });

    it('returns null when only stopped sessions exist', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      expect(await getActiveSession()).toBeNull();
    });

    it('returns the latest active session', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      await createSession(Date.now(), 'second');
      await endSession(id1);
      const active = await getActiveSession();
      expect(active.note).toBe('second');
    });
  });

  describe('getLatestEndedSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getLatestEndedSession()).toBeNull();
    });

    it('returns null when no ended sessions exist', async () => {
      await createSession(Date.now(), 'active');
      expect(await getLatestEndedSession()).toBeNull();
    });

    it('returns the latest ended session', async () => {
      const id1 = await createSession(Date.now() - 2000, 'first');
      const id2 = await createSession(Date.now() - 1000, 'second');
      await endSession(id1);
      await endSession(id2);
      const latest = await getLatestEndedSession();
      expect(latest.note).toBe('second');
    });
  });

  describe('getCurrentSession', () => {
    it('returns null when all sessions are ended', async () => {
      const id = await createSession(Date.now(), 'ended');
      await endSession(id);
      expect(await getCurrentSession()).toBeNull();
    });

    it('returns session with endedAt null (including stopped)', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      const session = await getCurrentSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.stoppedAt).not.toBeNull();
    });

    it('prefers active over stopped when both exist', async () => {
      const stoppedId = await createSession(Date.now() - 1000, 'stopped');
      await stopSession(stoppedId);
      await createSession(Date.now(), 'active');
      const current = await getCurrentSession();
      expect(current.note).toBe('active');
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

    it('returns null when only ended sessions exist', async () => {
      const id = await createSession(Date.now(), 'ended');
      await endSession(id);
      expect(await getStoppedSession()).toBeNull();
    });

    it('returns the stopped session that is not ended', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      const stopped = await getStoppedSession();
      expect(stopped).not.toBeNull();
      expect(stopped.id).toBe(id);
      expect(stopped.endedAt).toBeNull();
      expect(stopped.stoppedAt).not.toBeNull();
    });
  });

  describe('setCurrentSession', () => {
    it('makes target the active session', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      const id2 = await createSession(Date.now(), 'second');
      await stopSession(id1);

      await setCurrentSession(id2);

      const current = await getActiveSession();
      expect(current.id).toBe(id2);
      expect(current.stoppedAt).toBeNull();
      expect(current.endedAt).toBeNull();
    });

    it('stops any other active session', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      const id2 = await createSession(Date.now(), 'second');

      await setCurrentSession(id1);

      const s2 = await import('./db.js').then(m => m.getSession(id2));
      expect(s2.stoppedAt).not.toBeNull();
    });

    it('returns null for non-existent session', async () => {
      expect(await setCurrentSession(9999)).toBeNull();
    });
  });
});

describe('createSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('defaults startedAt to Date.now() and note to empty string', async () => {
    const before = Date.now();
    const id = await createSession();
    const after = Date.now();
    const s = await getSession(id);
    expect(s.id).toBe(id);
    expect(s.startedAt).toBeGreaterThanOrEqual(before);
    expect(s.startedAt).toBeLessThanOrEqual(after);
    expect(s.note).toBe('');
  });

  it('persists endedAt and stoppedAt as null initially', async () => {
    const id = await createSession();
    const s = await getSession(id);
    expect(s.endedAt).toBeNull();
    expect(s.stoppedAt).toBeNull();
  });

  it('accepts custom startedAt and note', async () => {
    const id = await createSession(12345, 'my note');
    const s = await getSession(id);
    expect(s.startedAt).toBe(12345);
    expect(s.note).toBe('my note');
  });

  it('returns auto-incremented numeric id', async () => {
    const id1 = await createSession();
    const id2 = await createSession();
    expect(typeof id1).toBe('number');
    expect(typeof id2).toBe('number');
    expect(id2).toBeGreaterThan(id1);
  });
});

describe('endSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('sets endedAt and returns updated session', async () => {
    const id = await createSession(1000, 'test');
    const result = await endSession(id, 2000);
    expect(result.id).toBe(id);
    expect(result.endedAt).toBe(2000);
    expect(result.note).toBe('test');
    const s = await getSession(id);
    expect(s.endedAt).toBe(2000);
  });

  it('defaults endedAt to Date.now()', async () => {
    const id = await createSession();
    const before = Date.now();
    await endSession(id);
    const s = await getSession(id);
    expect(s.endedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns null for unknown id', async () => {
    expect(await endSession(9999)).toBeNull();
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
    expect(s.startedAt).toBe(1000);
  });

  it('can clear stoppedAt and endedAt independently', async () => {
    const id = await createSession();
    await endSession(id);
    await updateSession(id, { endedAt: null });
    const s = await getSession(id);
    expect(s.endedAt).toBeNull();
  });

  it('returns null for unknown id', async () => {
    expect(await updateSession(9999, { note: 'x' })).toBeNull();
  });
});

describe('stopSession / resumeSession', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('stopSession sets stoppedAt to ~now', async () => {
    const id = await createSession();
    const before = Date.now();
    const result = await stopSession(id);
    expect(result.stoppedAt).toBeGreaterThanOrEqual(before);
  });

  it('resumeSession clears stoppedAt', async () => {
    const id = await createSession();
    await stopSession(id);
    await resumeSession(id);
    const s = await getSession(id);
    expect(s.stoppedAt).toBeNull();
  });

  it('resumeSession preserves other fields', async () => {
    const id = await createSession(5000, 'keep note');
    await stopSession(id);
    await resumeSession(id);
    const s = await getSession(id);
    expect(s.note).toBe('keep note');
    expect(s.startedAt).toBe(5000);
    expect(s.endedAt).toBeNull();
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
    expect(s.startedAt).toBe(999);
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

  it('returns sessions newest-first by startedAt', async () => {
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
});

describe('addEvent', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it.each(['up', 'pause', 'down'])('accepts type "%s"', async (type) => {
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

  it('returns correct shape with version 2', async () => {
    const id = await createSession(1000, 'test');
    await addEvent({ sessionId: id, type: 'up', ts: 2000 });
    const data = await exportAll();
    expect(data.version).toBe(2);
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
    const event = data.events.find((ev) => ev.id === e.id);
    expect(event).toBeDefined();
    expect(event.type).toBe('pause');
  });
});

describe('importAll', () => {
  beforeEach(async () => {
    await clearAll();
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
    const id = await createSession(1000, 'existing');
    await importAll(
      {
        sessions: [{ id: 999, startedAt: 2000, note: 'imported', endedAt: null, stoppedAt: null }],
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
      sessions: [{ id: 100, startedAt: 1000, note: 's', endedAt: null, stoppedAt: null }],
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
    expect(sessions[0].startedAt).toBe(777);
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
        sessions: [{ id: 200, startedAt: 3000, note: 'orphan-event', endedAt: null, stoppedAt: null }],
        events: [{ id: 50, sessionId: existingId, type: 'down', ts: 400 }],
      },
      { merge: true }
    );
    const events = await listEventsBySession(existingId);
    expect(events.some((e) => e.type === 'down' && e.ts === 400)).toBe(true);
  });
});

describe('clearAll', () => {
  it('empties both stores', async () => {
    const id = await createSession();
    await addEvent({ sessionId: id, type: 'up' });
    await clearAll();
    expect(await listSessions()).toEqual([]);
    expect(await listAllEvents()).toEqual([]);
  });
});
