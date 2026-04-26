import { openDB } from 'idb';

const DB_NAME = 'walk-cycle';
const DB_VERSION = 1;

export const STORE_SESSIONS = 'sessions';
export const STORE_EVENTS = 'events';

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
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

export async function resumeSession(id) {
  const db = await getDB();
  const session = await db.get(STORE_SESSIONS, id);
  if (!session) return null;
  session.endedAt = null;
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

export async function getSession(id) {
  const db = await getDB();
  return db.get(STORE_SESSIONS, id);
}

export async function getActiveSession() {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_SESSIONS, 'startedAt');
  for (let i = all.length - 1; i >= 0; i--) {
    if (!all[i].endedAt) return all[i];
  }
  return null;
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
