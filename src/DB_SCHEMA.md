# Database Schema

**Type**: IndexedDB (via [`idb`](https://github.com/jakearchibald/idb) wrapper)
**Name**: `walk-cycle`
**Current version**: `3`

## Object stores

### `sessions`

| Field       | Type          | Nullable | Default         | Description |
|-------------|---------------| -------- | --------------- | ----------- |
| `id`        | `number`      | no       | autoIncrement   | Primary key |
| `createdAt` | `number`      | no       | `Date.now()`    | Millis since epoch when the session started |
| `isStopped` | `boolean`     | no       | `false`         | `true` if the user pressed "Stop" (reversible) |
| `note`      | `string`      | no       | `''`            | User-provided label for the session |

**Indexes**:

| Index name  | Key path    | Unique |
|-------------|-------------|--------|
| `createdAt` | `createdAt` | no     |

### `events`

| Field       | Type     | Nullable | Default         | Description |
|-------------| -------- | -------- | --------------- | ----------- |
| `id`        | `number` | no       | autoIncrement   | Primary key |
| `sessionId` | `number` | no       | —               | Foreign key → `sessions.id` (not enforced by IndexedDB) |
| `type`      | `string` | no       | —               | One of `'up'`, `'pause'`, `'down'`, `'session_stopped'` |
| `ts`        | `number` | no       | `Date.now()`    | Millis since epoch when the event was recorded |

**Indexes**:

| Index name  | Key path    | Unique |
| ----------  | ----------- | ------ |
| `sessionId` | `sessionId` | no |
| `ts`        | `ts`        | no |
| `type`      | `type`      | no |

## Session lifecycle states

The `isStopped` boolean defines the session's state:

| `isStopped` | Meaning |
| ----------- | ------- |
| `false`     | **Active** — currently running; exactly one session at most can be in this state |
| `true`      | **Stopped** — user pressed Stop; can be resumed (a `session_stopped` event exists in the events store) |

There is no separate "ended" state — sessions are never permanently finished; they are either active or stopped.

## Invariants

1. **At most one active session** — `setCurrentSession(id)` enforces this via localStorage: it writes the active session ID to `localStorage('walk-cycle-current-session-id')` and dispatches a `current-session-changed` event.
2. **Stop/resume is event-driven** — `stopSession(id)` sets `isStopped = true` and appends a `session_stopped` event. `resumeSession(id)` deletes the most recent `session_stopped` event for that session and sets `isStopped = false`.
3. **Cascade delete** — `deleteSession(id)` removes the session and all events with matching `sessionId` in a single readwrite transaction spanning both stores.
4. **Current session** — `getCurrentSession()` reads the ID from localStorage and fetches that session from IndexedDB. `getActiveSession()` returns the latest session (by `createdAt` desc) where `isStopped === false`.

## Migration history

### v2 → v3

- Renamed `startedAt` → `createdAt` on sessions and the corresponding index.
- Removed `stoppedAt` and `endedAt` fields from sessions.
- Added `isStopped: boolean` field to sessions (`true` if a `session_stopped` event exists).
- For sessions that had `stoppedAt` set, a `session_stopped` event is created with `ts = stoppedAt`, and `isStopped` is set to `true`.
- Session lifecycle is now fully event-driven: stopping a session creates a `session_stopped` event; resuming deletes it.

### v1 → v2

- Renamed `pausedAt` → `stoppedAt` on existing sessions (UI vocabulary change: the 4th button became "Stop" / "Resume").
- Added `stoppedAt: null` to sessions that never had `pausedAt` (ensures `getActiveSession()` predicate works correctly for all migrated records).

### v0 → v1 (initial)

- Created `sessions` store with `createdAt` index.
- Created `events` store with `sessionId`, `ts`, and `type` indexes.

## API surface

All functions are `async` and return `Promise<T>`.

### Sessions

| Function | Args | Returns | Description |
| -------- | ---- | ------- | ----------- |
| `createSession` | `(createdAt?, note?)` | `Promise<number>` id | Creates a new session, sets it as current |
| `updateSession` | `(id, patch)` | `Promise<Session \| null>` | Applies arbitrary patch via `Object.assign` |
| `resumeSession` | `(id)` | `Promise<Session \| null>` | Deletes the `session_stopped` event and sets `isStopped = false` |
| `stopSession` | `(id)` | `Promise<Session \| null>` | Adds a `session_stopped` event and sets `isStopped = true` |
| `getSession` | `(id)` | `Promise<Session \| undefined>` | Returns record or `undefined` |
| `getActiveSession` | `()` | `Promise<Session \| null>` | Latest session where `isStopped === false` |
| `getStoppedSession` | `()` | `Promise<Session \| null>` | Latest session where `isStopped === true` |
| `getCurrentSession` | `()` | `Promise<Session \| null>` | Reads current session ID from localStorage, returns that session |
| `setCurrentSession` | `(id)` | `Promise<Session \| null>` | Sets `id` as the current session in localStorage |
| `listSessions` | `({ limit }?)` | `Promise<Session[]>` | Newest-first, default limit 100 |
| `deleteSession` | `(id)` | `Promise<void>` | Removes session + cascade events |

### Events

| Function | Args | Returns | Description |
| -------- | ---- | ------- | ----------- |
| `addEvent` | `({ sessionId, type, ts? })` | `Promise<Event>` | Validates `type ∈ {up, pause, down, session_stopped}` |
| `deleteEvent` | `(id)` | `Promise<void>` | Removes a single event |
| `listEventsBySession` | `(sessionId)` | `Promise<Event[]>` | Filtered by session, sorted by `ts` asc |
| `listAllEvents` | `()` | `Promise<Event[]>` | All events, sorted by `ts` asc |

### Bulk operations

| Function | Args | Returns | Description |
| -------- | ---- | ------- | ----------- |
| `exportAll` | `()` | `Promise<ExportData>` | `{ version, exportedAt, sessions, events }` |
| `importAll` | `(data, { merge? }?)` | `Promise<void>` | Replace (default) or merge; re-keys IDs to avoid collisions |
| `clearAll` | `()` | `Promise<void>` | Empties both stores and clears current session from localStorage |

## Consumers

| Module | Functions used |
| ------ | -------------- |
| `views/tracker.js` | `createSession`, `addEvent`, `deleteEvent`, `getActiveSession`, `listEventsBySession`, `getStoppedSession`, `resumeSession`, `stopSession` |
| `views/sessions.js` | `listSessions`, `listEventsBySession`, `deleteSession`, `getActiveSession`, `setCurrentSession` |
| `views/sessionDetail.js` | `getSession`, `listEventsBySession`, `deleteSession`, `getActiveSession`, `setCurrentSession`, `stopSession`, `updateSession` |
| `views/settings.js` | `exportAll`, `importAll`, `clearAll` |
| `views/stats.js` | `listSessions`, `listEventsBySession`, `getCurrentSession` |
