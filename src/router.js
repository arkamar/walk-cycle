// Minimal hash-based router so the app works on any static host (incl. GH Pages).
//
// Usage:
//   const router = createRouter({
//     '/': renderTracker,
//     '/sessions': renderSessions,
//     '/stats': renderStats,
//   }, { mount: '#view', notFound: renderTracker });
//   router.start();

export function createRouter(routes, { mount = '#view', notFound } = {}) {
  const target = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!target) throw new Error(`Router mount not found: ${mount}`);

  let currentCleanup = null;

  function parsePath() {
    const hash = window.location.hash.slice(1) || '/';
    return hash.split('?')[0] || '/';
  }

  async function render() {
    const path = parsePath();
    const handler = routes[path] ?? notFound;
    if (!handler) {
      target.innerHTML = `<p class="error">No route: ${path}</p>`;
      return;
    }
    if (typeof currentCleanup === 'function') {
      try { currentCleanup(); } catch (_) { /* ignore */ }
      currentCleanup = null;
    }
    target.innerHTML = '';
    const result = await handler(target, { path });
    currentCleanup = typeof result === 'function' ? result : null;
    document.dispatchEvent(new CustomEvent('route:changed', { detail: { path } }));
  }

  function navigate(path) {
    if (window.location.hash === `#${path}`) {
      render();
    } else {
      window.location.hash = path;
    }
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    navigate,
    current: parsePath,
  };
}
