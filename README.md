# Walk Cycle

A small **Progressive Web App** for tracking repeated up-and-down walking
cycles. Tap **Up** when you start climbing, **Pause** when you reach the
top, **Down** when you start walking back, **Pause** again at the bottom,
and repeat. Every press is timestamped and the app derives per-segment
durations so you can see whether you're getting faster or slower over time.

- 100% local-first — data lives in IndexedDB on your device
- Works fully offline once installed
- Auto dark/light theme (follows the OS)
- Vanilla JS + Vite, no framework, ~5 KB initial bundle (Chart.js loaded
  on-demand for the Stats screen)

## Stack

| Concern        | Tool                            |
|----------------|---------------------------------|
| Build          | [Vite](https://vitejs.dev)      |
| PWA            | [vite-plugin-pwa](https://vite-pwa-org.netlify.app) (Workbox under the hood) |
| Storage        | [idb](https://github.com/jakearchibald/idb) → IndexedDB |
| Charts         | [Chart.js](https://chartjs.org) |
| Routing        | Tiny custom hash router         |

## Project layout

```
src/
├── main.js             # Entry, registers SW, sets up router & tab bar
├── style.css           # Theme variables (light/dark), layout
├── router.js           # Hash router with cleanup hooks
├── ui.js               # el(), toast(), date helpers
├── db.js               # IndexedDB wrapper (sessions, events, export/import)
├── stateMachine.js     # Strict 5-state walk-cycle FSM
├── analytics.js        # segmentsFromEvents, cyclesFromSegments, formatters
└── views/
    ├── tracker.js
    ├── history.js
    ├── historyDetail.js
    ├── stats.js
    └── settings.js
public/
└── icons/              # SVG source + PNG icons (192, 512, maskable, apple)
```

## Data model

- **Session** `{ id, startedAt, endedAt, note }`
- **Event**   `{ id, sessionId, ts, type: 'up' | 'pause' | 'down' }`

Segments are **derived** from consecutive events:

| Segment       | Pair          | Meaning              |
|---------------|---------------|----------------------|
| `up_duration` | up → pause    | climbing time        |
| `top_rest`    | pause → down  | rest at the top      |
| `down_duration` | down → pause | descending time     |
| `bottom_rest` | pause → up    | rest at the bottom   |

A complete cycle = up + top_rest + down + bottom_rest.

## State machine

```
idle ─up→ going_up ─pause→ at_top ─down→ going_down ─pause→ at_bottom ─up→ going_up …
```

The UI dims any button that isn't a valid next transition. State is
recovered from event history on app load, so you can close the app
mid-session and pick up where you left off.

A session that has been idle for more than 30 minutes is auto-closed at
the time of the last event when the app is reopened.

## Develop

```bash
npm install
npm run dev          # starts Vite on http://localhost:5173
npm run build        # production build → dist/
npm run preview      # serves the built dist/ for testing the SW locally
```

The service worker is **disabled in dev** to avoid stale caches; it is
enabled in `npm run preview` and any production build. Test PWA behaviour
(install prompt, offline mode, manifest) with `npm run preview`.

## Deploy

Any static host works. Quick options:

- **GitHub Pages** — push `dist/` to a `gh-pages` branch (or use a
  `Pages` workflow). The `vite.config.js` uses `base: './'` so it works
  on a sub-path.
- **Netlify / Vercel / Cloudflare Pages** — set build command
  `npm run build` and publish directory `dist`.

For a custom domain, make sure HTTPS is enabled — service workers require
a secure context.

## Backup

Open **Settings** to export a JSON snapshot of your sessions + events,
or to import a previous backup (merge or replace). All data stays on
your device unless you share that file.
