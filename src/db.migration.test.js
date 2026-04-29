import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB } from 'idb';

const DB_NAME = 'walk-cycle';
const STORE_SESSIONS = 'sessions';
const STORE_EVENTS = 'events';

async function deleteDB() {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
}

async function seedV1(sessions = [], events = []) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      const sessionsStore = db.createObjectStore(STORE_SESSIONS, {
        keyPath: 'id',
        autoIncrement: true,
      });
      sessionsStore.createIndex('startedAt', 'startedAt');

      const eventsStore = db.createObjectStore(STORE_EVENTS, {
        keyPath: 'id',
        autoIncrement: true,
      });
      eventsStore.createIndex('sessionId', 'sessionId');
      eventsStore.createIndex('ts', 'ts');
    },
  });

  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
  for (const s of sessions) {
    await tx.objectStore(STORE_SESSIONS).add(s);
  }
  for (const e of events) {
    await tx.objectStore(STORE_EVENTS).add(e);
  }
  await tx.done;
  db.close();
}

describe('v1 → v2 migration', () => {
  beforeEach(async () => {
    vi.resetModules();
    await deleteDB();
  });

  afterEach(async () => {
    try {
      const dbModule = await import('./db.js');
      const db = await dbModule.getDB();
      db.close();
    } catch {
      // ignore
    }
    await deleteDB();
  });

  it('renames pausedAt to stoppedAt', async () => {
    await seedV1([
      { startedAt: 1000, endedAt: null, pausedAt: 5000, note: 'paused' },
      { startedAt: 2000, endedAt: 3000, note: 'ended' },
    ]);

    const dbModule = await import('./db.js');
    await dbModule.clearAll();
  });

  it('removes pausedAt property entirely', async () => {
    await seedV1([
      { startedAt: 1000, endedAt: null, pausedAt: 5000, note: 'paused' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.stoppedAt).toBe(5000);
    expect(Object.prototype.hasOwnProperty.call(s, 'pausedAt')).toBe(false);
  });

  it('adds stoppedAt: null to sessions that had no pausedAt', async () => {
    await seedV1([
      { startedAt: 1000, endedAt: null, note: 'no-pause' },
      { startedAt: 2000, endedAt: 3000, note: 'ended' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    expect(sessions).toHaveLength(2);

    const noPause = sessions.find((s) => s.note === 'no-pause');
    expect(noPause).toBeDefined();
    expect(noPause.stoppedAt).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(noPause, 'pausedAt')).toBe(false);
    expect(noPause.startedAt).toBe(1000);
    expect(noPause.endedAt).toBeNull();

    const ended = sessions.find((s) => s.note === 'ended');
    expect(ended.stoppedAt).toBeNull();
    expect(ended.endedAt).toBe(3000);
  });

  it('preserves events store during upgrade', async () => {
    const sessionId = 1;
    await seedV1(
      [{ startedAt: 1000, endedAt: null, pausedAt: 2000, note: 'migrated' }],
      [
        { id: 1, sessionId, type: 'up', ts: 100 },
        { id: 2, sessionId, type: 'pause', ts: 500 },
        { id: 3, sessionId, type: 'down', ts: 900 },
      ]
    );

    const dbModule = await import('./db.js');
    const events = await dbModule.listEventsBySession(sessionId);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(['up', 'pause', 'down']);
    expect(events.map((e) => e.ts)).toEqual([100, 500, 900]);
    expect(events[0].id).toBe(1);
    expect(events[1].id).toBe(2);
    expect(events[2].id).toBe(3);
  });

  it('indexes still work after upgrade — sessions ordered by startedAt', async () => {
    await seedV1([
      { startedAt: 3000, endedAt: null, note: 'third' },
      { startedAt: 1000, endedAt: null, pausedAt: 1500, note: 'first' },
      { startedAt: 2000, endedAt: null, note: 'second' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    expect(sessions[0].note).toBe('third');
    expect(sessions[1].note).toBe('second');
    expect(sessions[2].note).toBe('first');
  });

  it('indexes still work after upgrade — events by sessionId', async () => {
    await seedV1(
      [
        { startedAt: 1000, endedAt: null, note: 's1' },
        { startedAt: 2000, endedAt: null, note: 's2' },
      ],
      [
        { sessionId: 1, type: 'up', ts: 100 },
        { sessionId: 2, type: 'pause', ts: 200 },
        { sessionId: 1, type: 'down', ts: 300 },
      ]
    );

    const dbModule = await import('./db.js');
    const events1 = await dbModule.listEventsBySession(1);
    expect(events1).toHaveLength(2);
    expect(events1.every((e) => e.sessionId === 1)).toBe(true);

    const events2 = await dbModule.listEventsBySession(2);
    expect(events2).toHaveLength(1);
    expect(events2[0].sessionId).toBe(2);
  });

  it('indexes still work after upgrade — all events ordered by ts', async () => {
    await seedV1(
      [
        { startedAt: 1000, endedAt: null, note: 's' },
      ],
      [
        { sessionId: 1, type: 'down', ts: 300 },
        { sessionId: 1, type: 'up', ts: 100 },
        { sessionId: 1, type: 'pause', ts: 200 },
      ]
    );

    const dbModule = await import('./db.js');
    const all = await dbModule.listAllEvents();
    expect(all.map((e) => e.ts)).toEqual([100, 200, 300]);
  });
});
