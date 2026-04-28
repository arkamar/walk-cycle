import { openDB } from 'idb';

const DB_NAME = 'walk-cycle';
const DB_VERSION = 2;

export const STORE_SESSIONS = 'sessions';
export const STORE_EVENTS = 'events';

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const sessions = db.createObjectStore(STORE_SESSIONS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          sessions.createIndex('startedAt', 'startedAt');

          const events = db.createObjectStore(STORE_EVENTS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          events.createIndex('sessionId', 'sessionId');
          events.createIndex('ts', 'ts');
        }
        if (oldVersion < 2) {
          // Rename `pausedAt` -> `stoppedAt` on existing sessions to match the
          // UI vocabulary (the 4th button is now "Stop" / "Resume").
          const store = tx.objectStore(STORE_SESSIONS);
          let cursor = await store.openCursor();
          while (cursor) {
            const s = cursor.value;
            if (Object.prototype.hasOwnProperty.call(s, 'pausedAt')) {
              s.stoppedAt = s.pausedAt;
              delete s.pausedAt;
              await cursor.update(s);
            }
            cursor = await cursor.continue();
          }
        }
      },
    });
  }
  return dbPromise;
}

// ---------- Sessions ----------

export async function createSession(startedAt = Date.now(), note = '') {
  const db = await getDB();
  const id = await db.add(STORE_SESSIONS, {
    startedAt,
    endedAt: null,
    note,
  });
  return id;
}

export async function endSession(id, endedAt = Date.now()) {
  const db = await getDB();
  const session = await db.get(STORE_SESSIONS, id);
  if (!session) return null;
  session.endedAt = endedAt;
  await db.put(STORE_SESSIONS, session);
  return session;
}

export async function updateSession(id, patch) {
  const db = await getDB();
  const session = await db.get(STORE_SESSIONS, id);
  if (!session) return null;
  Object.assign(session, patch);
  await db.put(STORE_SESSIONS, session);
  return session;
}

export async function resumeSession(id) {
  return updateSession(id, { stoppedAt: null });
}

export async function stopSession(id) {
  return updateSession(id, { stoppedAt: Date.now() });
}

export async function getSession(id) {
  const db = await getDB();
  return db.get(STORE_SESSIONS, id);
}

async function findSession(predicate) {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_SESSIONS, 'startedAt');
  for (let i = all.length - 1; i >= 0; i--) {
    if (predicate(all[i])) return all[i];
  }
  return null;
}

export async function getActiveSession() {
  return findSession(s => !s.endedAt && !s.stoppedAt);
}

export async function getLatestEndedSession() {
  return findSession(s => s.endedAt);
}

export async function getCurrentSession() {
  return findSession(s => !s.endedAt);
}

export async function getStoppedSession() {
  return findSession(s => s.stoppedAt && !s.endedAt);
}

/**
 * Make the given session the single active session.
 *
 * Atomically:
 *   1. Stops any other session that is currently active (stoppedAt = now).
 *   2. Clears `stoppedAt` and `endedAt` on the target so it shows as active.
 *
 * Used by sessions list/detail to "Resume" or "Set as current". Preserves
 * the invariant that at most one session has neither stoppedAt nor endedAt.
 *
 * @returns the updated target session, or null if not found.
 */
export async function setCurrentSession(id) {
  const db = await getDB();
  const tx = db.transaction(STORE_SESSIONS, 'readwrite');
  const store = tx.objectStore(STORE_SESSIONS);
  const target = await store.get(id);
  if (!target) {
    await tx.done;
    return null;
  }
  const now = Date.now();
  let cursor = await store.openCursor();
  while (cursor) {
    const s = cursor.value;
    if (s.id !== id && !s.stoppedAt && !s.endedAt) {
      s.stoppedAt = now;
      await cursor.update(s);
    }
    cursor = await cursor.continue();
  }
  target.stoppedAt = null;
  target.endedAt = null;
  await store.put(target);
  await tx.done;
  return target;
}

export async function listSessions({ limit = 100 } = {}) {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_SESSIONS, 'startedAt');
  return all.reverse().slice(0, limit);
}

export async function deleteSession(id) {
  const db = await getDB();
  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
  await tx.objectStore(STORE_SESSIONS).delete(id);
  const idx = tx.objectStore(STORE_EVENTS).index('sessionId');
  let cursor = await idx.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---------- Events ----------

export async function addEvent({ sessionId, type, ts = Date.now() }) {
  if (!['up', 'pause', 'down'].includes(type)) {
    throw new Error(`Invalid event type: ${type}`);
  }
  const db = await getDB();
  const id = await db.add(STORE_EVENTS, { sessionId, type, ts });
  return { id, sessionId, type, ts };
}

export async function deleteEvent(id) {
  const db = await getDB();
  await db.delete(STORE_EVENTS, id);
}

export async function listEventsBySession(sessionId) {
  const db = await getDB();
  const events = await db.getAllFromIndex(STORE_EVENTS, 'sessionId', sessionId);
  events.sort((a, b) => a.ts - b.ts);
  return events;
}

export async function listAllEvents() {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_EVENTS, 'ts');
  return all;
}

// ---------- Bulk ops (for export/import) ----------

export async function exportAll() {
  const db = await getDB();
  const sessions = await db.getAll(STORE_SESSIONS);
  const events = await db.getAll(STORE_EVENTS);
  return { version: DB_VERSION, exportedAt: Date.now(), sessions, events };
}

export async function importAll(data, { merge = false } = {}) {
  if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.events)) {
    throw new Error('Invalid import data');
  }
  const db = await getDB();
  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
  if (!merge) {
    await tx.objectStore(STORE_SESSIONS).clear();
    await tx.objectStore(STORE_EVENTS).clear();
  }
  // Re-key: avoid clashing autoIncrement IDs by remapping
  const sessionIdMap = new Map();
  for (const s of data.sessions) {
    const { id: oldId, ...rest } = s;
    const newId = await tx.objectStore(STORE_SESSIONS).add(rest);
    sessionIdMap.set(oldId, newId);
  }
  for (const e of data.events) {
    const { id: _oldId, sessionId, ...rest } = e;
    const newSessionId = sessionIdMap.get(sessionId) ?? sessionId;
    await tx.objectStore(STORE_EVENTS).add({ sessionId: newSessionId, ...rest });
  }
  await tx.done;
}

export async function clearAll() {
  const db = await getDB();
  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
  await tx.objectStore(STORE_SESSIONS).clear();
  await tx.objectStore(STORE_EVENTS).clear();
  await tx.done;
}
