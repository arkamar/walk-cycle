# Database Schema

**Type**: IndexedDB (via [`idb`](https://github.com/jakearchibald/idb) wrapper)
**Name**: `walk-cycle`
**Current version**: `2`

## Object stores

### `sessions`

| Field       | Type          | Nullable | Default         | Description |
|-------------|---------------| -------- | --------------- | ----------- |
| `id`        | `number`      | no       | autoIncrement   | Primary key |
| `startedAt` | `number`      | no       | `Date.now()`    | Millis since epoch when the session started |
| `endedAt`   | `number|null` | yes      | `null`          | Millis when the session was permanently finished |
| `stoppedAt` | `number|null` | yes      | `null`          | Millis when the user pressed "Stop" (reversible) |
| `note`      | `string`      | no       | `''`            | User-provided label for the session |

**Indexes**:

| Index name  | Key path    | Unique |
|-------------|-------------|--------|
| `startedAt` | `startedAt` | no     |

### `events`

| Field       | Type     | Nullable | Default         | Description |
|-------------| -------- | -------- | --------------- | ----------- |
| `id`        | `number` | no       | autoIncrement   | Primary key |
| `sessionId` | `number` | no       | —               | Foreign key → `sessions.id` (not enforced by IndexedDB) |
| `type`      | `string` | no       | —               | One of `'up'`, `'pause'`, `'down'` |
| `ts`        | `number` | no       | `Date.now()`    | Millis since epoch when the event was recorded |

**Indexes**:

| Index name  | Key path    | Unique |
| ----------  | ----------- | ------ |
| `sessionId` | `sessionId` | no |
| `ts`        | `ts`        | no |

## Session lifecycle states

The combination of `stoppedAt` and `endedAt` defines the session's state:

| `stoppedAt` | `endedAt` | Meaning |
| ----------- | --------- | ------- |
| `null`      | `null`    | **Active** — currently running; exactly one session at most can be in this state |
| `number`    | `null`    | **Stopped** — user pressed Stop; can be resumed |
| any         | `number`  | **Ended** — permanently finished; cannot be resumed |

## Invariants

1. **At most one active session** — `setCurrentSession(id)` enforces this atomically: it stops any other session with `stoppedAt === null && endedAt === null` by setting `stoppedAt = Date.now()`, then clears both fields on the target.
2. **Cascade delete** — `deleteSession(id)` removes the session and all events with matching `sessionId` in a single readwrite transaction spanning both stores.
3. **Current session** — `getCurrentSession()` returns the latest session (by `startedAt` desc) where `endedAt === null`. This includes stopped sessions, so a user can always find their most recent working session.

## Migration history

### v1 → v2

- Renamed `pausedAt` → `stoppedAt` on existing sessions (UI vocabulary change: the 4th button became "Stop" / "Resume").
- Added `stoppedAt: null` to sessions that never had `pausedAt` (ensures `getActiveSession()` predicate works correctly for all migrated records).

### v0 → v1 (initial)

- Created `sessions` store with `startedAt` index.
- Created `events` store with `sessionId` and `ts` indexes.

## API surface

All functions are `async` and return `Promise<T>`.

### Sessions

| Function | Args | Returns | Description |
| -------- | ---- | ------- | ----------- |
| `createSession` | `(startedAt?, note?)` | `Promise<number>` id | Creates a new session |
| `endSession` | `(id, endedAt?)` | `Promise<Session \| null>` | Marks session as permanently ended |
| `updateSession` | `(id, patch)` | `Promise<Session \| null>` | Applies arbitrary patch via `Object.assign` |
| `resumeSession` | `(id)` | `Promise<Session \| null>` | Clears `stoppedAt` |
| `stopSession` | `(id)` | `Promise<Session \| null>` | Sets `stoppedAt` to `Date.now()` |
| `getSession` | `(id)` | `Promise<Session \| undefined>` | Returns record or `undefined` |
| `getActiveSession` | `()` | `Promise<Session \| null>` | Latest session where `!endedAt && !stoppedAt` |
| `getLatestEndedSession` | `()` | `Promise<Session \| null>` | Latest session where `endedAt` is set |
| `getCurrentSession` | `()` | `Promise<Session \| null>` | Latest session where `!endedAt` |
| `getStoppedSession` | `()` | `Promise<Session \| null>` | Latest session where `stoppedAt && !endedAt` |
| `setCurrentSession` | `(id)` | `Promise<Session \| null>` | Makes `id` the single active session |
| `listSessions` | `({ limit }?)` | `Promise<Session[]>` | Newest-first, default limit 100 |
| `deleteSession` | `(id)` | `Promise<void>` | Removes session + cascade events |

### Events

| Function | Args | Returns | Description |
| -------- | ---- | ------- | ----------- |
| `addEvent` | `({ sessionId, type, ts? })` | `Promise<Event>` | Validates `type ∈ {up, pause, down}` |
| `deleteEvent` | `(id)` | `Promise<void>` | Removes a single event |
| `listEventsBySession` | `(sessionId)` | `Promise<Event[]>` | Filtered by session, sorted by `ts` asc |
| `listAllEvents` | `()` | `Promise<Event[]>` | All events, sorted by `ts` asc |

### Bulk operations

| Function | Args | Returns | Description |
| -------- | ---- | ------- | ----------- |
| `exportAll` | `()` | `Promise<ExportData>` | `{ version, exportedAt, sessions, events }` |
| `importAll` | `(data, { merge? }?)` | `Promise<void>` | Replace (default) or merge; re-keys IDs to avoid collisions |
| `clearAll` | `()` | `Promise<void>` | Empties both stores |

## Consumers

| Module | Functions used |
| ------ | -------------- |
| `views/tracker.js` | `createSession`, `endSession`, `addEvent`, `deleteEvent`, `getActiveSession`, `listEventsBySession`, `getLatestEndedSession`, `getStoppedSession`, `resumeSession`, `stopSession` |
| `views/sessions.js` | `listSessions`, `listEventsBySession`, `deleteSession`, `getActiveSession`, `setCurrentSession` |
| `views/sessionDetail.js` | `getSession`, `listEventsBySession`, `deleteSession`, `getActiveSession`, `setCurrentSession`, `stopSession`, `updateSession` |
| `views/settings.js` | `exportAll`, `importAll`, `clearAll` |
| `views/stats.js` | `listSessions`, `listEventsBySession`, `getCurrentSession` |
