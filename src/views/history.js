import { el } from '../ui.js';

export function renderHistory(target) {
  target.appendChild(
    el('div', { class: 'card' }, [
      el('h2', {}, 'History'),
      el('p', { class: 'muted' }, 'Coming next.'),
    ])
  );
}
