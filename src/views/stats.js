import { el } from '../ui.js';

export function renderStats(target) {
  target.appendChild(
    el('div', { class: 'card' }, [
      el('h2', {}, 'Stats'),
      el('p', { class: 'muted' }, 'Coming next.'),
    ])
  );
}
