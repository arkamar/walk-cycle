import { el } from '../ui.js';

export function renderSettings(target) {
  target.appendChild(
    el('div', { class: 'card' }, [
      el('h2', {}, 'Settings'),
      el('p', { class: 'muted' }, 'Coming next.'),
    ])
  );
}
