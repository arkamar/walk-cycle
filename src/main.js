import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { createRouter } from './router.js';

registerSW({ immediate: true });

// Lazy-load views so the initial bundle stays small (Chart.js, etc.).
const lazy = (loader, name) => async (target, ctx) => {
  try {
    const mod = await loader();
    const render = mod[name];
    if (!render) {
      throw new Error(`Missing export: ${name}`);
    }
    console.log('lazy loaded', name, 'for', ctx?.path);
    return render(target, ctx);
  } catch (err) {
    console.error('lazy load error:', err);
    target.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
};

const renderTracker = lazy(() => import('./views/tracker.js'), 'renderTracker');
const renderSessions = lazy(() => import('./views/sessions.js'), 'renderSessions');
const renderSessionDetail = lazy(() => import('./views/sessionDetail.js'), 'renderSessionDetail');
const renderStats = lazy(() => import('./views/stats.js'), 'renderStats');
const renderSettings = lazy(() => import('./views/settings.js'), 'renderSettings');

const TABS = [
  { path: '/', label: 'Track', icon: '⏱' },
  { path: '/sessions', label: 'Sessions', icon: '📋' },
  { path: '/stats', label: 'Stats', icon: '📈' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

const app = document.getElementById('app');
app.innerHTML = `
  <div class="view" id="view"></div>
  <nav class="tab-bar" id="tab-bar"></nav>
`;

const tabBar = document.getElementById('tab-bar');
for (const t of TABS) {
  const a = document.createElement('a');
  a.className = 'tab';
  a.href = `#${t.path}`;
  a.dataset.path = t.path;
  a.innerHTML = `<span class="tab-icon">${t.icon}</span><span>${t.label}</span>`;
  tabBar.appendChild(a);
}

document.addEventListener('route:changed', (e) => {
  const path = e.detail.path;
  // Detail routes still highlight their parent tab.
  const tabPath = path.startsWith('/sessions') ? '/sessions' : path;
  for (const a of tabBar.querySelectorAll('.tab')) {
    if (a.dataset.path === tabPath) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
});

const router = createRouter(
  {
    '/': renderTracker,
    '/sessions': renderSessions,
    '/stats': renderStats,
    '/settings': renderSettings,
  },
  {
    mount: '#view',
    notFound: (target, ctx) => {
      // Detail routes like /sessions/:id (also accept legacy /history/:id)
      const m = ctx.path.match(/^\/(?:sessions|history)\/(\d+)$/);
      if (m) return renderSessionDetail(target, { id: Number(m[1]) });
      // Legacy /history -> /sessions redirect.
      if (ctx.path === '/history') {
        window.location.hash = '/sessions';
        return;
      }
      return renderTracker(target, ctx);
    },
  }
);

router.start();
