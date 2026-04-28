# Walk Cycle PWA

## Commands

```bash
npm run dev        # Dev server at localhost:5173 (SW disabled)
npm run build      # Production build to dist/
npm run preview    # Serve dist/ locally with SW enabled
npm test           # Run Vitest once
npm run test:watch # Vitest in watch mode
```

## Key facts

- **Service worker**: Disabled in dev (`devOptions.enabled: false`), enabled in preview/production. Test PWA features with `npm run preview`.
- **Tests**: Vitest `npm run test` / `npm run test:watch`. Test files live alongside source as `*.test.js` (e.g., `src/stateMachine.test.js`).
- **No lint/typecheck** configured
- **PWA manifest**: `base: './'` in vite.config.js — works on sub-paths (e.g., GitHub Pages)

## Architecture

- Vanilla JS + Vite (no framework)
- IndexedDB via `idb` package
- Chart.js loaded on-demand in Stats view
- Custom hash router in `src/router.js`
- 5-state FSM in `src/stateMachine.js`: idle → going_up → at_top → going_down → at_bottom → ...
- Tracker button rules live in `buttonStatesFor()` in `src/stateMachine.js` (pure, unit-tested).

## Vocabulary

Three distinct concepts to keep separate:

- **`pause` event** — the FSM event that records the rest between `up` and `down` (going_up + pause → at_top, going_down + pause → at_bottom). Part of every cycle.
- **Stop / Resume** — session-level. `session.stoppedAt` (DB field) marks a session as stopped; `resumeSession()` clears it. The 4th tracker button is labeled "Stop" while running and "Resume" while stopped (Resume is essentially an undo, for misclicks). Pressing **Up** while stopped starts a *new* session.
- **Current session** — the single session that has neither `stoppedAt` nor `endedAt` set. `getActiveSession()` returns it; the tracker view renders it. The DB invariant (enforced by `setCurrentSession()`) is that at most one such session exists at any time.

`setCurrentSession(id)` is the atomic primitive used by the History list/detail "Resume" / "Set as current" buttons: in a single transaction it stops any other active session and clears `stoppedAt`/`endedAt` on the target.

## State recovery

App recovers state from IndexedDB on reload. Sessions stored before
DB v2 had a `pausedAt` field; the v1→v2 migration in `src/db.js` rewrites
those records to `stoppedAt`.
