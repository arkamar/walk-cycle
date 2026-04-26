import { el } from '../ui.js';

export function renderHistoryDetail(target, { id }) {
  target.appendChild(
    el('div', { class: 'card' }, [
      el('h2', {}, `Session #${id}`),
      el('p', { class: 'muted' }, 'Coming next.'),
    ])
  );
}
