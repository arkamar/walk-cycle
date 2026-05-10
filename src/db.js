import { openDB } from 'idb';

const DB_NAME = 'walk-cycle';
const DB_VERSION = 4;

export const STORE_SESSIONS = 'sessions';
export const STORE_EVENTS = 'events';
export const STORE_ACTIVITIES = 'activities';
export const STORE_RECORDS = 'records';

const CURRENT_SESSION_KEY = 'walk-cycle-current-session-id';

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const sessions = db.createObjectStore(STORE_SESSIONS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          sessions.createIndex('createdAt', 'createdAt');

          const events = db.createObjectStore(STORE_EVENTS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          events.createIndex('sessionId', 'sessionId');
          events.createIndex('ts', 'ts');
          events.createIndex('type', 'type');
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
            await cursor.update(s);
            cursor = await cursor.continue();
          }
        }
        if (oldVersion < 3) {
          const sessionsStore = tx.objectStore(STORE_SESSIONS);
          const eventsStore = tx.objectStore(STORE_EVENTS);

          // Update index: startedAt → createdAt
          if (sessionsStore.indexNames.contains('startedAt')) {
            sessionsStore.deleteIndex('startedAt');
          }
          if (!sessionsStore.indexNames.contains('createdAt')) {
            sessionsStore.createIndex('createdAt', 'createdAt');
          }

          // Rename startedAt → createdAt
          // Remove stoppedAt / endedAt → create session_stopped events
          // Add isStopped helper field
          let cursor = await sessionsStore.openCursor();
          while (cursor) {
            const s = cursor.value;
            s.createdAt = s.startedAt;
            delete s.startedAt;
            if (s.stoppedAt != null) {
              await eventsStore.add({ sessionId: s.id, type: 'session_stopped', ts: s.stoppedAt });
              s.isStopped = true;
            } else {
              s.isStopped = false;
            }
            delete s.stoppedAt;
            delete s.endedAt;
            await cursor.update(s);
            cursor = await cursor.continue();
          }
        }
        if (oldVersion < 4) {
          const activities = db.createObjectStore(STORE_ACTIVITIES, {
            keyPath: 'id',
            autoIncrement: true,
          });
          activities.createIndex('createdAt', 'createdAt');

          const records = db.createObjectStore(STORE_RECORDS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          records.createIndex('activityId', 'activityId');
          records.createIndex('date', 'date');
        }
      },
    });
  }
  return dbPromise;
}

// ---------- Session tracking (localStorage) ----------

function getCurrentSessionId() {
  const raw = localStorage.getItem(CURRENT_SESSION_KEY);
  return raw ? Number(raw) : null;
}

export function setCurrentSessionId(id) {
  if (id == null) {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  } else {
    localStorage.setItem(CURRENT_SESSION_KEY, String(id));
  }
  window.dispatchEvent(new CustomEvent('current-session-changed', { detail: { id } }));
}

// ---------- Sessions ----------

export async function createSession(createdAt = Date.now(), note = '') {
  const db = await getDB();
  const id = await db.add(STORE_SESSIONS, {
    createdAt,
    isStopped: false,
    note,
  });
  setCurrentSessionId(id);
  return id;
}

export async function updateSession(id, patch) {
  const db = await getDB();
  const session = await db.get(STORE_SESSIONS, id);
  if (!session) return null;
  Object.assign(session, patch);
  await db.put(STORE_SESSIONS, session);
  return session;
}

export async function stopSession(id) {
  const db = await getDB();
  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
  const store = tx.objectStore(STORE_SESSIONS);
  const session = await store.get(id);
  if (!session) {
    await tx.done;
    return null;
  }
  session.isStopped = true;
  await store.put(session);
  await tx.objectStore(STORE_EVENTS).add({ sessionId: id, type: 'session_stopped', ts: Date.now() });
  await tx.done;
  return session;
}

export async function resumeSession(id) {
  const db = await getDB();
  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS], 'readwrite');
  const sessionsStore = tx.objectStore(STORE_SESSIONS);
  const eventsStore = tx.objectStore(STORE_EVENTS);
  const session = await sessionsStore.get(id);
  if (!session) {
    await tx.done;
    return null;
  }
  // Delete the most recent session_stopped event for this session
  const idx = eventsStore.index('sessionId');
  let cursor = await idx.openCursor(IDBKeyRange.only(id));
  let lastStoppedEventId = null;
  while (cursor) {
    if (cursor.value.type === 'session_stopped') {
      lastStoppedEventId = cursor.value.id;
    }
    cursor = await cursor.continue();
  }
  if (lastStoppedEventId != null) {
    await eventsStore.delete(lastStoppedEventId);
  }
  session.isStopped = false;
  await sessionsStore.put(session);
  await tx.done;
  return session;
}

export async function getSession(id) {
  const db = await getDB();
  return db.get(STORE_SESSIONS, id);
}

async function findSession(predicate) {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_SESSIONS, 'createdAt');
  for (let i = all.length - 1; i >= 0; i--) {
    if (predicate(all[i])) return all[i];
  }
  return null;
}

export async function getActiveSession() {
  return findSession(s => !s.isStopped);
}

export async function getStoppedSession() {
  return findSession(s => s.isStopped);
}

export async function getCurrentSession() {
  const id = getCurrentSessionId();
  if (id == null) return null;
  const db = await getDB();
  return db.get(STORE_SESSIONS, id);
}

/**
 * Make the given session the current one (shown in the tracker).
 * Writes the ID to localStorage and dispatches an event.
 */
export async function setCurrentSession(id) {
  const db = await getDB();
  const session = await db.get(STORE_SESSIONS, id);
  if (!session) return null;
  setCurrentSessionId(id);
  return session;
}

export async function listSessions({ limit = 100 } = {}) {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_SESSIONS, 'createdAt');
  return all.reverse().slice(0, limit);
}

export async function deleteSession(id) {
  const db = await getDB();
  const currentId = getCurrentSessionId();
  if (currentId === id) {
    setCurrentSessionId(null);
  }
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

// ---------- Activities ----------

export async function createActivity(name, createdAt = Date.now(), goal = null) {
  const db = await getDB();
  return db.add(STORE_ACTIVITIES, { name, createdAt, goal });
}

export async function listActivities() {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_ACTIVITIES, 'createdAt');
  return all.reverse();
}

export async function getActivity(id) {
  const db = await getDB();
  return db.get(STORE_ACTIVITIES, id);
}

export async function updateActivity(id, patch) {
  const db = await getDB();
  const activity = await db.get(STORE_ACTIVITIES, id);
  if (!activity) return null;
  Object.assign(activity, patch);
  await db.put(STORE_ACTIVITIES, activity);
  return activity;
}

export async function deleteActivity(id) {
  const db = await getDB();
  const tx = db.transaction([STORE_ACTIVITIES, STORE_RECORDS], 'readwrite');
  await tx.objectStore(STORE_ACTIVITIES).delete(id);
  const idx = tx.objectStore(STORE_RECORDS).index('activityId');
  let cursor = await idx.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---------- Records ----------

export async function addRecord({ activityId, date, count = 1 }) {
  const db = await getDB();
  const existing = await listRecordsByActivity(activityId);
  if (existing.find(r => r.date === date)) {
    throw new Error(`Record already exists for ${date}`);
  }
  const id = await db.add(STORE_RECORDS, { activityId, date, count });
  return { id, activityId, date, count };
}

export async function listRecordsByActivity(activityId) {
  const db = await getDB();
  const records = await db.getAllFromIndex(STORE_RECORDS, 'activityId', activityId);
  records.sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return 0;
  });
  return records;
}

export async function updateRecord(id, patch) {
  const db = await getDB();
  const record = await db.get(STORE_RECORDS, id);
  if (!record) return null;
  Object.assign(record, patch);
  await db.put(STORE_RECORDS, record);
  return record;
}

export async function deleteRecord(id) {
  const db = await getDB();
  await db.delete(STORE_RECORDS, id);
}

// ---------- Events ----------

export async function addEvent({ sessionId, type, ts = Date.now() }) {
  if (!['up', 'pause', 'down', 'session_stopped'].includes(type)) {
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
  const sessionIdMap = new Map();
  for (const s of data.sessions) {
    const { id: oldId, ...rest } = s;
    const newId = await tx.objectStore(STORE_SESSIONS).add(rest);
    sessionIdMap.set(oldId, newId);
  }
  for (const e of data.events) {
    const { sessionId, ...rest } = e;
    const newSessionId = sessionIdMap.get(sessionId) ?? sessionId;
    await tx.objectStore(STORE_EVENTS).add({ sessionId: newSessionId, ...rest });
  }
  await tx.done;
}

export async function clearAll() {
  const db = await getDB();
  setCurrentSessionId(null);
  const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS, STORE_ACTIVITIES, STORE_RECORDS], 'readwrite');
  await tx.objectStore(STORE_SESSIONS).clear();
  await tx.objectStore(STORE_EVENTS).clear();
  await tx.objectStore(STORE_ACTIVITIES).clear();
  await tx.objectStore(STORE_RECORDS).clear();
  await tx.done;
}
