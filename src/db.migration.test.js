import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB } from 'idb';

const DB_NAME = 'walk-cycle';
const STORE_SESSIONS = 'sessions';
const STORE_EVENTS = 'events';
const STORE_ACTIVITIES = 'activities';
const STORE_RECORDS = 'records';

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

async function seedV2(sessions = [], events = []) {
  const db = await openDB(DB_NAME, 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
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
      }
      if (oldVersion < 2) {
        const store = tx.objectStore(STORE_SESSIONS);
        let cursor = await store.openCursor();
        while (cursor) {
          const s = cursor.value;
          if (Object.prototype.hasOwnProperty.call(s, 'pausedAt')) {
            s.stoppedAt = s.pausedAt;
            delete s.pausedAt;
          }
          if (!Object.prototype.hasOwnProperty.call(s, 'stoppedAt')) {
            s.stoppedAt = null;
          }
          cursor.update(s);
          cursor = await cursor.continue();
        }
      }
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

describe('v1 → v3 migration (full upgrade)', () => {
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

  it('renames startedAt to createdAt', async () => {
    await seedV1([
      { startedAt: 1000, stoppedAt: null, endedAt: null, note: 'active' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.createdAt).toBe(1000);
    expect(Object.prototype.hasOwnProperty.call(s, 'startedAt')).toBe(false);
  });

  it('creates session_stopped event from stoppedAt', async () => {
    await seedV1([
      { startedAt: 1000, stoppedAt: 5000, endedAt: null, note: 'stopped' },
    ]);

    const dbModule = await import('./db.js');
    const events = await dbModule.listEventsBySession(1);
    const stoppedEvent = events.find(e => e.type === 'session_stopped');
    expect(stoppedEvent).toBeDefined();
    expect(stoppedEvent.ts).toBe(5000);
  });

  it('sets isStopped flag correctly', async () => {
    await seedV1([
      { startedAt: 1000, stoppedAt: 5000, endedAt: null, note: 'stopped' },
      { startedAt: 2000, stoppedAt: null, endedAt: null, note: 'active' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    const stopped = sessions.find(s => s.note === 'stopped');
    const active = sessions.find(s => s.note === 'active');
    expect(stopped.isStopped).toBe(true);
    expect(active.isStopped).toBe(false);
  });

  it('removes stoppedAt and endedAt fields', async () => {
    await seedV1([
      { startedAt: 1000, stoppedAt: 5000, endedAt: 9000, note: 'ended' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    const s = sessions[0];
    expect(Object.prototype.hasOwnProperty.call(s, 'stoppedAt')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(s, 'endedAt')).toBe(false);
  });

  it('preserves existing cycle events', async () => {
    await seedV1(
      [{ startedAt: 1000, stoppedAt: null, endedAt: null, note: 's' }],
      [
        { sessionId: 1, type: 'up', ts: 100 },
        { sessionId: 1, type: 'pause', ts: 500 },
        { sessionId: 1, type: 'down', ts: 900 },
      ],
    );

    const dbModule = await import('./db.js');
    const events = await dbModule.listEventsBySession(1);
    const cycleEvents = events.filter(e => e.type !== 'session_stopped');
    expect(cycleEvents).toHaveLength(3);
    expect(cycleEvents.map(e => e.type)).toEqual(['up', 'pause', 'down']);
  });

  it('sessions ordered by createdAt after migration', async () => {
    await seedV1([
      { startedAt: 3000, stoppedAt: null, endedAt: null, note: 'third' },
      { startedAt: 1000, stoppedAt: 1500, endedAt: null, note: 'first' },
      { startedAt: 2000, stoppedAt: null, endedAt: null, note: 'second' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    expect(sessions[0].note).toBe('third');
    expect(sessions[1].note).toBe('second');
    expect(sessions[2].note).toBe('first');
  });
});

describe('v2 → v3 migration', () => {
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

  it('migrates stopped sessions', async () => {
    await seedV2([
      { startedAt: 1000, stoppedAt: 5000, endedAt: null, note: 'stopped' },
      { startedAt: 2000, stoppedAt: null, endedAt: null, note: 'active' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    const stopped = sessions.find(s => s.note === 'stopped');
    const active = sessions.find(s => s.note === 'active');
    expect(stopped.isStopped).toBe(true);
    expect(stopped.createdAt).toBe(1000);
    expect(active.isStopped).toBe(false);
    expect(active.createdAt).toBe(2000);
    expect(Object.prototype.hasOwnProperty.call(stopped, 'startedAt')).toBe(false);
  });

  it('creates stopped events for all stopped sessions', async () => {
    await seedV2([
      { startedAt: 1000, stoppedAt: 5000, endedAt: null, note: 's1' },
      { startedAt: 2000, stoppedAt: 7000, endedAt: null, note: 's2' },
    ]);

    const dbModule = await import('./db.js');
    const events1 = await dbModule.listEventsBySession(1);
    const events2 = await dbModule.listEventsBySession(2);
    expect(events1.find(e => e.type === 'session_stopped')?.ts).toBe(5000);
    expect(events2.find(e => e.type === 'session_stopped')?.ts).toBe(7000);
  });

  it('removes endedAt from ended sessions', async () => {
    await seedV2([
      { startedAt: 1000, stoppedAt: null, endedAt: 3000, note: 'ended' },
    ]);

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    const s = sessions[0];
    expect(Object.prototype.hasOwnProperty.call(s, 'endedAt')).toBe(false);
    expect(s.isStopped).toBe(false);
  });

  it('rewrites pausedAt to stoppedAt (v1→v2 path)', async () => {
    const db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const s = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('startedAt', 'startedAt');
        const e = db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
        e.createIndex('sessionId', 'sessionId');
      },
    });
    const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
    await tx.objectStore(STORE_SESSIONS).add({
      startedAt: 1000, pausedAt: 5000, note: 'from-pausedAt',
    });
    await tx.done;
    db.close();

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    const s = sessions[0];
    // v2→v3 migration deletes stoppedAt, but isStopped should be true
    expect(s.isStopped).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(s, 'pausedAt')).toBe(false);
    // A session_stopped event should have been created
    const events = await dbModule.listEventsBySession(s.id);
    const stopped = events.find(e => e.type === 'session_stopped');
    expect(stopped).toBeDefined();
    expect(stopped.ts).toBe(5000);
  });

  it('adds stoppedAt:null when missing in v1→v2 path', async () => {
    const db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const s = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('startedAt', 'startedAt');
        const e = db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
        e.createIndex('sessionId', 'sessionId');
      },
    });
    const tx = db.transaction([STORE_SESSIONS], 'readwrite');
    await tx.objectStore(STORE_SESSIONS).add({
      startedAt: 1000, note: 'no-stoppedAt',
    });
    await tx.done;
    db.close();

    const dbModule = await import('./db.js');
    const sessions = await dbModule.listSessions();
    const s = sessions[0];
    // v2→v3 migration deletes stoppedAt, but isStopped should be false
    expect(s.isStopped).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(s, 'stoppedAt')).toBe(false);
  });
});

describe('migration v4→v5 (written field)', () => {
  beforeEach(async () => {
    vi.resetModules();
    await deleteDB();
  });

  afterEach(async () => {
    await deleteDB();
  });

  it('adds written:false to records missing the field', async () => {
    const db4 = await openDB(DB_NAME, 4, {
      upgrade(db) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
        db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
        const a = db.createObjectStore(STORE_ACTIVITIES, { keyPath: 'id', autoIncrement: true });
        a.createIndex('createdAt', 'createdAt');
        const r = db.createObjectStore(STORE_RECORDS, { keyPath: 'id', autoIncrement: true });
        r.createIndex('activityId', 'activityId');
        r.createIndex('date', 'date');
      },
    });
    const tx = db4.transaction([STORE_RECORDS], 'readwrite');
    await tx.objectStore(STORE_RECORDS).add({ activityId: 0, date: '2026-01-01', count: 3 });
    await tx.done;
    db4.close();

    const dbModule = await import('./db.js');
    const records = await dbModule.listRecordsByActivity(0);
    expect(records).toHaveLength(1);
    expect(records[0].written).toBe(false);
    const db = await dbModule.getDB();
    db.close();
  });
});

describe('migration v5→v6 (note field)', () => {
  beforeEach(async () => {
    vi.resetModules();
    await deleteDB();
  });

  afterEach(async () => {
    await deleteDB();
  });

  it('adds note:"" to records missing the field', async () => {
    const db5 = await openDB(DB_NAME, 5, {
      upgrade(db) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
        db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
        const a = db.createObjectStore(STORE_ACTIVITIES, { keyPath: 'id', autoIncrement: true });
        a.createIndex('createdAt', 'createdAt');
        const r = db.createObjectStore(STORE_RECORDS, { keyPath: 'id', autoIncrement: true });
        r.createIndex('activityId', 'activityId');
        r.createIndex('date', 'date');
      },
    });
    const tx = db5.transaction([STORE_RECORDS], 'readwrite');
    await tx.objectStore(STORE_RECORDS).add({ activityId: 0, date: '2026-01-01', count: 3, written: false });
    await tx.done;
    db5.close();

    const dbModule = await import('./db.js');
    const records = await dbModule.listRecordsByActivity(0);
    expect(records).toHaveLength(1);
    expect(records[0].note).toBe('');
    const db = await dbModule.getDB();
    db.close();
  });
});
