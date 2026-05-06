import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { el, toast, formatTime, formatDateTime, formatDate } from './ui.js';

describe('el()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates element with correct tag', () => {
    expect(el('div').tagName).toBe('DIV');
    expect(el('span').tagName).toBe('SPAN');
  });

  it('applies class via class attribute', () => {
    expect(el('div', { class: 'foo bar' }).className).toBe('foo bar');
  });

    it('applies class via className attribute', () => {
    expect(el('div', { className: 'baz' }).className).toBe('baz');
  });

  it('skips null/undefined attribute values (line 6)', () => {
    const node = el('div', { id: null, 'data-val': undefined, className: 'test' });
    expect(node.id).toBe('');
    expect(node.dataset.val).toBeUndefined();
    expect(node.className).toBe('test');
  });

  it('applies id attribute', () => {
    const node = el('div', { id: 'test-id' });
    expect(node.id).toBe('test-id');
  });

  it('sets textContent', () => {
    expect(el('div', { textContent: 'hello' }).textContent).toBe('hello');
  });

  it('applies style object', () => {
    const node = el('div', { style: { color: 'red', fontSize: '16px' } });
    expect(node.style.color).toBe('red');
    expect(node.style.fontSize).toBe('16px');
  });

  it('applies dataset object', () => {
    const node = el('div', { dataset: { foo: 'bar' } });
    expect(node.dataset.foo).toBe('bar');
  });

  it('adds event listeners for on* attributes', () => {
    const handler = vi.fn();
    const node = el('button', { onclick: handler });
    node.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('sets innerHTML via html attribute', () => {
    const node = el('div', { html: '<span>test</span>' });
    expect(node.innerHTML).toBe('<span>test</span>');
  });

  it('handles arbitrary attributes', () => {
    const node = el('input', { type: 'text', placeholder: 'Enter' });
    expect(node.type).toBe('text');
    expect(node.placeholder).toBe('Enter');
  });

  describe('children handling', () => {
    it('handles string children', () => {
      expect(el('div', {}, 'hello').textContent).toBe('hello');
    });

    it('handles Node children', () => {
      const child = document.createElement('span');
      expect(el('div', {}, child).firstChild).toBe(child);
    });

    it('handles array of children', () => {
      const [c1, c2] = [el('span'), el('p')];
      const node = el('div', {}, [c1, c2]);
      expect(node.childNodes.length).toBe(2);
    });

    it('handles nested arrays', () => {
      const [c1, c2] = [el('span'), el('p')];
      const node = el('div', {}, [[c1, c2]]);
      expect(node.childNodes.length).toBe(2);
    });

    it('ignores null/undefined children', () => {
      const node = el('div', {}, [null, undefined, 'valid']);
      expect(node.childNodes.length).toBe(1);
      expect(node.textContent).toBe('valid');
    });
  });
});

describe('toast()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates toast element on first call', () => {
    expect(document.querySelector('.toast')).toBeNull();
    toast('test');
    const t = document.querySelector('.toast');
    expect(t).not.toBeNull();
    expect(t.classList.contains('toast')).toBe(true);
    expect(t.parentNode).toBe(document.body);
  });

  it('shows toast with show class', () => {
    toast('test');
    expect(document.querySelector('.toast').classList.contains('show')).toBe(true);
  });

  it('hides after timeout', () => {
    toast('test', 1000);
    const t = document.querySelector('.toast');
    expect(t.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(t.classList.contains('show')).toBe(false);
  });

  it('updates message text', () => {
    toast('first');
    const t = document.querySelector('.toast');
    expect(t.textContent).toBe('first');
    toast('second');
    expect(t.textContent).toBe('second');
  });

  it('clears previous timer on new toast', () => {
    toast('first', 2000);
    const t = document.querySelector('.toast');
    vi.advanceTimersByTime(1000);
    toast('second', 3000);
    // First timer would have fired by now if not cleared
    vi.advanceTimersByTime(1500);
    expect(t.classList.contains('show')).toBe(true);
    // Second timer fires
    vi.advanceTimersByTime(1500);
    expect(t.classList.contains('show')).toBe(false);
  });
});

describe('formatTime()', () => {
  it('formats Date object', () => {
    const d = new Date(2026, 4, 2, 14, 30, 45);
    const expected = d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    expect(formatTime(d)).toBe(expected);
  });

  it('formats timestamp number', () => {
    const d = new Date(2026, 4, 2, 14, 30, 45);
    const expected = d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    expect(formatTime(d.getTime())).toBe(expected);
  });

  it('formats various times', () => {
    const d1 = new Date(2026, 0, 1, 9, 0, 0);
    const d2 = new Date(2026, 11, 31, 23, 59, 59);
    expect(formatTime(d1)).toBe(d1.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    expect(formatTime(d2)).toBe(d2.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  });
});

describe('formatDateTime()', () => {
  it('formats Date object', () => {
    const d = new Date(2026, 4, 2, 14, 30);
    const expected = d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    expect(formatDateTime(d)).toBe(expected);
  });

  it('formats timestamp number', () => {
    const d = new Date(2026, 4, 2, 14, 30);
    const expected = d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    expect(formatDateTime(d.getTime())).toBe(expected);
  });

  it('returns locale date+time string', () => {
    const d = new Date(2026, 4, 2, 14, 30);
    const result = formatDateTime(d);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatDate()', () => {
  it('formats Date object', () => {
    const d = new Date(2026, 4, 2);
    const expected = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    expect(formatDate(d)).toBe(expected);
  });

  it('formats timestamp number', () => {
    const d = new Date(2026, 4, 2);
    const expected = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    expect(formatDate(d.getTime())).toBe(expected);
  });

  it('returns locale date string', () => {
    const d = new Date(2026, 4, 2);
    const result = formatDate(d);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
