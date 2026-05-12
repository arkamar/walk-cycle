import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock render functions
const mockRenderTracker = vi.fn();
const mockRenderSessions = vi.fn();
const mockRenderSessionDetail = vi.fn();
const mockRenderStats = vi.fn();
const mockRenderSettings = vi.fn();
const mockRegisterSW = vi.fn();
const mockRouterStart = vi.fn();
const mockNavigate = vi.fn();
const mockCurrent = vi.fn(() => '/');
const mockCreateRouter = vi.fn(() => ({ start: mockRouterStart, current: mockCurrent, navigate: mockNavigate }));

// Mock virtual:pwa-register
vi.mock('virtual:pwa-register', () => {
  return { registerSW: mockRegisterSW };
});

// Mock router.js
vi.mock('./router.js', () => {
  return { createRouter: mockCreateRouter };
});

const mockRenderActivities = vi.fn();
const mockRenderActivityDetail = vi.fn();

// Mock view modules - need to return the mock render functions
// The lazy() function calls import() and uses mod[name]
vi.mock('./views/tracker.js', () => {
  return { renderTracker: mockRenderTracker };
});

vi.mock('./views/sessions.js', () => {
  return { renderSessions: mockRenderSessions };
});

vi.mock('./views/sessionDetail.js', () => {
  return { renderSessionDetail: mockRenderSessionDetail };
});

vi.mock('./views/stats.js', () => {
  return { renderStats: mockRenderStats };
});

vi.mock('./views/settings.js', () => {
  return { renderSettings: mockRenderSettings };
});

vi.mock('./views/activities.js', () => {
  return { renderActivities: mockRenderActivities };
});

vi.mock('./views/activityDetail.js', () => {
  return { renderActivityDetail: mockRenderActivityDetail };
});

describe('main.js', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up DOM - need to match what main.js expects
    document.body.innerHTML = '';
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should register service worker with immediate: true', async () => {
    await import('./main.js');
    expect(mockRegisterSW).toHaveBeenCalledWith({ immediate: true });
  });

  it('should create tab bar with correct tabs', async () => {
    await import('./main.js');

    const tabBar = document.getElementById('tab-bar');
    expect(tabBar).toBeTruthy();

    const tabs = tabBar.querySelectorAll('.tab');
    expect(tabs.length).toBe(5);

    // Check Track tab
    expect(tabs[0].dataset.path).toBe('/');
    expect(tabs[0].href).toContain('#/');
    expect(tabs[0].innerHTML).toContain('Track');
    expect(tabs[0].innerHTML).toContain('⏱');

    // Check Sessions tab
    expect(tabs[1].dataset.path).toBe('/sessions');
    expect(tabs[1].innerHTML).toContain('Sessions');
    expect(tabs[1].innerHTML).toContain('📋');

    // Check Activities tab
    expect(tabs[2].dataset.path).toBe('/activities');
    expect(tabs[2].innerHTML).toContain('Activities');
    expect(tabs[2].innerHTML).toContain('⚡');

    // Check Stats tab
    expect(tabs[3].dataset.path).toBe('/stats');
    expect(tabs[3].innerHTML).toContain('Stats');
    expect(tabs[3].innerHTML).toContain('📈');

    // Check Settings tab
    expect(tabs[4].dataset.path).toBe('/settings');
    expect(tabs[4].innerHTML).toContain('Settings');
    expect(tabs[4].innerHTML).toContain('⚙️');
  });

  it('should create router with correct routes', async () => {
    await import('./main.js');

    expect(mockCreateRouter).toHaveBeenCalledOnce();

    const [routes, options] = mockCreateRouter.mock.calls[0];

    // Check routes object
    expect(typeof routes['/']).toBe('function');
    expect(typeof routes['/sessions']).toBe('function');
    expect(typeof routes['/activities']).toBe('function');
    expect(typeof routes['/stats']).toBe('function');
    expect(typeof routes['/settings']).toBe('function');

    // Check options
    expect(options.mount).toBe('#view');
    expect(typeof options.notFound).toBe('function');
  });

  it('should start router', async () => {
    await import('./main.js');
    expect(mockRouterStart).toHaveBeenCalledOnce();
  });

  it('should update aria-current on route:changed', async () => {
    await import('./main.js');

    const tabBar = document.getElementById('tab-bar');
    const tabs = tabBar.querySelectorAll('.tab');

    // Use document.dispatchEvent with proper CustomEvent for jsdom
    const dispatchRouteChanged = (path) => {
      const event = new CustomEvent('route:changed', { detail: { path } });
      document.dispatchEvent(event);
    };

    // Simulate route:changed to /
    dispatchRouteChanged('/');
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(tabs[1].hasAttribute('aria-current')).toBe(false);

    // Simulate route:changed to /sessions
    dispatchRouteChanged('/sessions');
    expect(tabs[1].getAttribute('aria-current')).toBe('page');
    expect(tabs[0].hasAttribute('aria-current')).toBe(false);

    // Simulate route:changed to /sessions/123 (detail route)
    dispatchRouteChanged('/sessions/123');
    expect(tabs[1].getAttribute('aria-current')).toBe('page');

    // Simulate route:changed to /activities
    dispatchRouteChanged('/activities');
    expect(tabs[2].getAttribute('aria-current')).toBe('page');
    expect(tabs[1].hasAttribute('aria-current')).toBe(false);

    // Simulate route:changed to /activities/1 (detail route)
    dispatchRouteChanged('/activities/1');
    expect(tabs[2].getAttribute('aria-current')).toBe('page');

    // Simulate route:changed to /stats
    dispatchRouteChanged('/stats');
    expect(tabs[3].getAttribute('aria-current')).toBe('page');

    // Simulate route:changed to /settings
    dispatchRouteChanged('/settings');
    expect(tabs[4].getAttribute('aria-current')).toBe('page');
  });

  it('should handle legacy /history route in notFound', async () => {
    await import('./main.js');

    const [, options] = mockCreateRouter.mock.calls[0];

    // Mock window.location.hash setter
    let hashValue = '';
    const originalLocation = { ...window.location };
    Object.defineProperty(window, 'location', {
      value: {
        get hash() { return hashValue; },
        set hash(val) { hashValue = val; },
      },
      writable: true,
      configurable: true,
    });

    const mockTarget = document.createElement('div');
    options.notFound(mockTarget, { path: '/history' });

    // main.js sets window.location.hash directly
    expect(hashValue).toBe('/sessions');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('should handle legacy /history/:id route in notFound', async () => {
    await import('./main.js');

    const [, options] = mockCreateRouter.mock.calls[0];
    const mockTarget = document.createElement('div');

    // The lazy() function returns an async function that calls the render
    // We need to await the result since lazy() is async
    await options.notFound(mockTarget, { path: '/history/123' });

    expect(mockRenderSessionDetail).toHaveBeenCalledWith(mockTarget, { id: 123 });
  });

  it('should handle /activities/:id route in notFound', async () => {
    await import('./main.js');

    const [, options] = mockCreateRouter.mock.calls[0];
    const mockTarget = document.createElement('div');

    await options.notFound(mockTarget, { path: '/activities/42' });

    expect(mockRenderActivityDetail).toHaveBeenCalledWith(mockTarget, { id: 42 });
  });

  describe('swipe navigation', () => {
    function fire(name, props) {
      const ev = new Event(name, { bubbles: true, cancelable: true });
      Object.assign(ev, props);
      document.body.dispatchEvent(ev);
    }

    beforeEach(() => {
      mockNavigate.mockClear();
      mockCurrent.mockReturnValue('/');
    });

    it('swipes left from /sessions to /activities', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/sessions');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 80, clientY: 100 }] });
      expect(mockNavigate).toHaveBeenCalledWith('/activities');
    });

    it('swipes right from /sessions to /', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/sessions');
      fire('touchstart', { touches: [{ clientX: 80, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 200, clientY: 100 }] });
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('swipes left from /activities to /stats', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/activities');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 80, clientY: 100 }] });
      expect(mockNavigate).toHaveBeenCalledWith('/stats');
    });

    it('swipes left from /stats to /settings', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/stats');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 80, clientY: 100 }] });
      expect(mockNavigate).toHaveBeenCalledWith('/settings');
    });

    it('does not swipe past the last tab', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/settings');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 80, clientY: 100 }] });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not swipe past the first tab', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/');
      fire('touchstart', { touches: [{ clientX: 80, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 200, clientY: 100 }] });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not swipe with insufficient distance', async () => {
      await import('./main.js');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 180, clientY: 100 }] });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not swipe with vertical movement', async () => {
      await import('./main.js');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 100, clientY: 200 }] });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not swipe with two fingers', async () => {
      await import('./main.js');
      const ev = new Event('touchstart', { bubbles: true, cancelable: true });
      ev.touches = [{}, {}];
      document.body.dispatchEvent(ev);
      const ev2 = new Event('touchend', { bubbles: true, cancelable: true });
      ev2.changedTouches = [{ clientX: 80, clientY: 100 }];
      document.body.dispatchEvent(ev2);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not swipe when touch starts on canvas', async () => {
      await import('./main.js');
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
      const ev = new Event('touchstart', { bubbles: true, cancelable: true });
      ev.touches = [{ clientX: 200, clientY: 100 }];
      canvas.dispatchEvent(ev);
      const ev2 = new Event('touchend', { bubbles: true, cancelable: true });
      ev2.changedTouches = [{ clientX: 80, clientY: 100 }];
      document.body.dispatchEvent(ev2);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('swipes from activity detail route', async () => {
      await import('./main.js');
      mockCurrent.mockReturnValue('/activities/123');
      fire('touchstart', { touches: [{ clientX: 200, clientY: 100 }] });
      fire('touchend', { changedTouches: [{ clientX: 80, clientY: 100 }] });
      expect(mockNavigate).toHaveBeenCalledWith('/stats');
    });
  });

  it('should handle /sessions/:id route in notFound', async () => {
    await import('./main.js');

    const [, options] = mockCreateRouter.mock.calls[0];
    const mockTarget = document.createElement('div');

    await options.notFound(mockTarget, { path: '/sessions/456' });

    expect(mockRenderSessionDetail).toHaveBeenCalledWith(mockTarget, { id: 456 });
  });

  it('should fallback to renderTracker for unknown routes in notFound', async () => {
    await import('./main.js');

    const [, options] = mockCreateRouter.mock.calls[0];
    const mockTarget = document.createElement('div');

    await options.notFound(mockTarget, { path: '/unknown' });

    expect(mockRenderTracker).toHaveBeenCalledWith(mockTarget, { path: '/unknown' });
  });

  it('should create app structure with view and tab-bar', async () => {
    await import('./main.js');

    const app = document.getElementById('app');
    expect(app.innerHTML).toContain('id="view"');
    expect(app.innerHTML).toContain('id="tab-bar"');
  });

  describe('lazy()', () => {
    it('renders successfully when loader returns module with expected export', async () => {
      const { lazy } = await import('./main.js');
      const render = vi.fn();
      const loader = vi.fn().mockResolvedValue({ myFn: render });
      const target = document.createElement('div');
      await lazy(loader, 'myFn')(target, { path: '/' });
      expect(loader).toHaveBeenCalledOnce();
      expect(render).toHaveBeenCalledWith(target, { path: '/' });
    });

    it('throws and shows error when module lacks expected export', async () => {
      const { lazy } = await import('./main.js');
      const loader = vi.fn().mockResolvedValue({});
      const target = document.createElement('div');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await lazy(loader, 'missingFn')(target, { path: '/' });
      expect(consoleSpy).toHaveBeenCalled();
      expect(target.innerHTML).toContain('Error');
      expect(target.innerHTML).toContain('Missing export: missingFn');
      consoleSpy.mockRestore();
    });

    it('catches loader rejection and shows error in target', async () => {
      const { lazy } = await import('./main.js');
      const loader = vi.fn().mockRejectedValue(new Error('Network error'));
      const target = document.createElement('div');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await lazy(loader, 'anything')(target, { path: '/' });
      expect(consoleSpy).toHaveBeenCalled();
      expect(target.innerHTML).toContain('Error');
      expect(target.innerHTML).toContain('Network error');
      consoleSpy.mockRestore();
    });
  });
});
