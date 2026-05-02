import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRouter } from './router.js';

describe('createRouter', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'view';
    document.body.appendChild(container);
    window.location.hash = '#/';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('throws if mount element not found', () => {
    expect(() => createRouter({}, { mount: '#nonexistent' })).toThrow(
      'Router mount not found: #nonexistent'
    );
  });

  it('accepts a DOM element as mount', () => {
    const router = createRouter({}, { mount: container });
    expect(router).toBeDefined();
    expect(typeof router.start).toBe('function');
    expect(typeof router.navigate).toBe('function');
    expect(typeof router.current).toBe('function');
  });

  describe('parsePath', () => {
    it('returns / for empty hash', () => {
      window.location.hash = '';
      const router = createRouter({}, { mount: container });
      expect(router.current()).toBe('/');
    });

    it('returns / for hash #/', () => {
      window.location.hash = '#/';
      const router = createRouter({}, { mount: container });
      expect(router.current()).toBe('/');
    });

    it('returns path without hash prefix', () => {
      window.location.hash = '#/sessions';
      const router = createRouter({}, { mount: container });
      expect(router.current()).toBe('/sessions');
    });

    it('returns full path with nested routes', () => {
      window.location.hash = '#/sessions/123';
      const router = createRouter({}, { mount: container });
      expect(router.current()).toBe('/sessions/123');
    });

    it('strips query string from path', () => {
      window.location.hash = '#/sessions?foo=bar';
      const router = createRouter({}, { mount: container });
      expect(router.current()).toBe('/sessions');
    });
  });

  describe('render', () => {
    it('calls correct handler for matched route', () => {
      const handler = vi.fn();
      const router = createRouter({ '/': handler }, { mount: container });
      router.start();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(container, { path: '/' });
    });

    it('calls handler with nested path', () => {
      const handler = vi.fn();
      const router = createRouter({ '/sessions': handler }, { mount: container });
      window.location.hash = '#/sessions';
      router.start();
      expect(handler).toHaveBeenCalledWith(container, { path: '/sessions' });
    });

    it('calls notFound handler for unmatched route', () => {
      const notFound = vi.fn();
      const router = createRouter({}, { mount: container, notFound });
      window.location.hash = '#/nonexistent';
      router.start();
      expect(notFound).toHaveBeenCalledOnce();
      expect(notFound).toHaveBeenCalledWith(container, { path: '/nonexistent' });
    });

    it('renders error message when no handler and no notFound', () => {
      const router = createRouter({}, { mount: container });
      window.location.hash = '#/nonexistent';
      router.start();
      expect(container.innerHTML).toContain('No route: /nonexistent');
      expect(container.innerHTML).toContain('error');
    });

    it('passes target element and path to handler', () => {
      const handler = vi.fn();
      const router = createRouter({ '/test': handler }, { mount: container });
      window.location.hash = '#/test';
      router.start();
      const [target, context] = handler.mock.calls[0];
      expect(target).toBe(container);
      expect(context).toEqual({ path: '/test' });
    });

    it('handles async handlers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const router = createRouter({ '/': handler }, { mount: container });
      router.start();
      await new Promise((r) => setTimeout(r, 50));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('navigate', () => {
    it('changes hash when navigating to different path', () => {
      const handler = vi.fn();
      const router = createRouter({ '/sessions': handler }, { mount: container });
      router.start();
      handler.mockClear();
      router.navigate('/sessions');
      expect(window.location.hash).toBe('#/sessions');
    });

    it('calls render directly when hash already matches', () => {
      const handler = vi.fn();
      const router = createRouter({ '/': handler }, { mount: container });
      router.start();
      expect(handler).toHaveBeenCalledOnce();
      const callCount = handler.mock.calls.length;
      router.navigate('/');
      expect(handler.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  describe('start', () => {
    it('adds hashchange listener', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const router = createRouter({}, { mount: container });
      router.start();
      expect(addEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });

    it('calls initial render on start', () => {
      const handler = vi.fn();
      const router = createRouter({ '/': handler }, { mount: container });
      router.start();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('cleanup', () => {
    it('calls previous cleanup before new render via navigate', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const handler1 = vi.fn().mockReturnValue(cleanup1);
      const handler2 = vi.fn().mockReturnValue(cleanup2);
      const router = createRouter(
        { '/a': handler1, '/b': handler2 },
        { mount: container }
      );
      // Start with /a
      window.location.hash = '#/a';
      router.start();
      expect(handler1).toHaveBeenCalledOnce();
      expect(cleanup1).not.toHaveBeenCalled();

      // Navigate to /b
      router.navigate('/b');
      await new Promise((r) => setTimeout(r, 100));

      // cleanup1 should have been called when leaving /a
      expect(cleanup1).toHaveBeenCalled();
      // handler2 should have been called when entering /b
      expect(handler2).toHaveBeenCalled();
    });

    it('ignores errors in cleanup function', async () => {
      const cleanup = vi.fn().mockImplementation(() => {
        throw new Error('cleanup error');
      });
      const handler1 = vi.fn().mockReturnValue(cleanup);
      const handler2 = vi.fn();
      const router = createRouter(
        { '/a': handler1, '/b': handler2 },
        { mount: container }
      );
      window.location.hash = '#/a';
      router.start();

      expect(() => {
        router.navigate('/b');
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 100));

      expect(cleanup).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('does not call cleanup if previous handler returned non-function', async () => {
      const handler1 = vi.fn().mockReturnValue('not a function');
      const handler2 = vi.fn();
      const router = createRouter(
        { '/a': handler1, '/b': handler2 },
        { mount: container }
      );
      window.location.hash = '#/a';
      router.start();
      router.navigate('/b');

      await new Promise((r) => setTimeout(r, 100));

      expect(handler2).toHaveBeenCalled();
    });

    it('clears innerHTML before calling new handler', () => {
      const handler = vi.fn();
      const router = createRouter({ '/': handler }, { mount: container });
      container.innerHTML = '<p>old content</p>';
      router.start();
      expect(container.innerHTML).toBe('');
    });
  });

  describe('notFound handler', () => {
    it('is called when no route matches', () => {
      const notFound = vi.fn();
      const router = createRouter({}, { mount: container, notFound });
      window.location.hash = '#/nonexistent';
      router.start();
      expect(notFound).toHaveBeenCalledOnce();
      expect(notFound).toHaveBeenCalledWith(container, { path: '/nonexistent' });
    });

    it('receives target and path like normal handlers', () => {
      const notFound = vi.fn();
      const router = createRouter(
        { '/exists': vi.fn() },
        { mount: container, notFound }
      );
      window.location.hash = '#/doesnotexist';
      router.start();
      const [target, context] = notFound.mock.calls[0];
      expect(target).toBe(container);
      expect(context).toEqual({ path: '/doesnotexist' });
    });
  });

  describe('current()', () => {
    it('returns current path from hash', () => {
      const router = createRouter({}, { mount: container });
      window.location.hash = '#/sessions';
      expect(router.current()).toBe('/sessions');
    });

    it('returns updated path after navigate', () => {
      const router = createRouter({}, { mount: container });
      router.navigate('/stats');
      expect(router.current()).toBe('/stats');
    });
  });
});
