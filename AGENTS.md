# Walk Cycle PWA

## Commands

```bash
npm run dev       # Dev server at localhost:5173 (SW disabled)
npm run build     # Production build to dist/
npm run preview   # Serve dist/ locally with SW enabled
```

## Key facts

- **Service worker**: Disabled in dev (`devOptions.enabled: false`), enabled in preview/production. Test PWA features with `npm run preview`.
- **No tests** in this repo
- **No lint/typecheck** configured
- **PWA manifest**: `base: './'` in vite.config.js — works on sub-paths (e.g., GitHub Pages)

## Architecture

- Vanilla JS + Vite (no framework)
- IndexedDB via `idb` package
- Chart.js loaded on-demand in Stats view
- Custom hash router in `src/router.js`
- 5-state FSM in `src/stateMachine.js`: idle → going_up → at_top → going_down → at_bottom → ...

## State recovery

App recovers state from IndexedDB on reload.
