# Walk Cycle PWA

## Commands

```bash
npm run dev        # Dev server at localhost:5173 (SW disabled)
npm run build      # Production build to dist/
npm run preview    # Serve dist/ locally with SW enabled
npm test           # Run Vitest once
npm run test:watch # Vitest in watch mode
npm run lint       # Run ESLint
npm run lint:fix   # Run ESLint with auto-fix
```

## Key facts

- Run `npm test` and `npm run lint` after every change to catch regressions.

- **Service worker**: Disabled in dev (`devOptions.enabled: false`), enabled in preview/production. Test PWA features with `npm run preview`.
- **Tests**: Vitest `npm run test` / `npm run test:watch`. Test files live alongside source as `*.test.js` (e.g., `src/stateMachine.test.js`).
- **Lint**: ESLint with recommended rules, `npm run lint` / `npm run lint:fix`
- **PWA manifest**: `base: './'` in vite.config.js — works on sub-paths (e.g., GitHub Pages)

## Architecture

- Vanilla JS + Vite (no framework)
- IndexedDB via `idb` package; 4 stores (sessions, events, activities, records)
- Chart.js loaded on-demand in Stats view; motivation chart in activity detail uses raw `<canvas>`
- Custom hash router in `src/router.js` — 5 tabs: Track, Sessions, Activities, Stats, Settings
- 5-state FSM in `src/stateMachine.js`: idle → going_up → at_top → going_down → at_bottom → ...
- Shared rendering helpers in `src/sessionLog.js` (log entry rendering, `enrichNextTs`) and `src/chart.js` (Chart.js trend chart factory).
- Tracker button rules live in `buttonStatesFor()` in `src/stateMachine.js` (pure, unit-tested).
- Activity detail view with stats grid (3 equal columns), per-record inline editing (date, count, note), written checkbox, cumulative sums, motivation chart with day/week toggle and drag-to-zoom.

## Vocabulary

Three distinct concepts to keep separate:

- **`pause` event** — the FSM event that records the rest between `up` and `down` (going_up + pause → at_top, going_down + pause → at_bottom). Part of every cycle.
- **Stop / Resume** — session-level. `session.stoppedAt` (DB field) marks a session as stopped; `resumeSession()` clears it. The 4th tracker button is labeled "Stop" while running and "Resume" while stopped (Resume is essentially an undo, for misclicks). Pressing **Up** while stopped starts a *new* session.
- **Current session** — the single session that has neither `stoppedAt` nor `endedAt` set. `getActiveSession()` returns it; the tracker view renders it. The DB invariant is that at most one such session exists at any time.

`setCurrentSession(id)` marks a session as the current one (shown in the tracker). It writes the ID to localStorage and dispatches a `current-session-changed` event. The Sessions list/detail "Set as current" buttons call this directly — they do NOT stop other active sessions; multiple active sessions may exist.

## State recovery

App recovers state from IndexedDB on reload. Sessions stored before
DB v2 had a `pausedAt` field; the v1→v2 migration in `src/db.js` rewrites
those records to `stoppedAt`.
