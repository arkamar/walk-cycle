import { el } from '../ui.js';

export function renderTracker(target) {
  target.appendChild(
    el('div', { class: 'card' }, [
      el('h2', {}, 'Tracker'),
      el('p', { class: 'muted' }, 'Coming next.'),
    ])
  );
}
