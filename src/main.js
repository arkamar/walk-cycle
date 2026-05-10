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
const renderActivities = lazy(() => import('./views/activities.js'), 'renderActivities');
const renderActivityDetail = lazy(() => import('./views/activityDetail.js'), 'renderActivityDetail');

const TABS = [
  { path: '/', label: 'Track', icon: '⏱' },
  { path: '/sessions', label: 'Sessions', icon: '📋' },
  { path: '/activities', label: 'Activities', icon: '⚡' },
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
  const tabPath = path.startsWith('/sessions') ? '/sessions'
    : path.startsWith('/activities') ? '/activities'
    : path;
  for (const a of tabBar.querySelectorAll('.tab')) {
    if (a.dataset.path === tabPath) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
});

// Swipe left/right to switch tabs on mobile.
let swipeStartX = 0;
let swipeStartY = 0;

document.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) { swipeStartX = 0; return; }
  if (e.target.closest('canvas, input, textarea, select, .tab-bar')) { swipeStartX = 0; return; }
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (!swipeStartX) return;
  const deltaX = e.changedTouches[0].clientX - swipeStartX;
  const deltaY = e.changedTouches[0].clientY - swipeStartY;
  swipeStartX = 0;

  if (Math.abs(deltaX) < 50) return;
  if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

  const tabs = TABS.map(t => t.path);
  let base = router.current();
  if (base.startsWith('/sessions')) base = '/sessions';
  else if (base.startsWith('/activities')) base = '/activities';

  let idx = tabs.indexOf(base);
  if (idx === -1) return;

  if (deltaX < 0) {
    if (idx >= tabs.length - 1) return;
    idx++;
  } else {
    if (idx <= 0) return;
    idx--;
  }

  router.navigate(tabs[idx]);
}, { passive: true });

const router = createRouter(
  {
    '/': renderTracker,
    '/sessions': renderSessions,
    '/activities': renderActivities,
    '/stats': renderStats,
    '/settings': renderSettings,
  },
  {
    mount: '#view',
    notFound: (target, ctx) => {
      // Detail routes like /activities/:id
      const mActivity = ctx.path.match(/^\/activities\/(\d+)$/);
      if (mActivity) return renderActivityDetail(target, { id: Number(mActivity[1]) });
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
