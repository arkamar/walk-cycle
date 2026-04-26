import './style.css';
import { registerSW } from 'virtual:pwa-register';

// Auto-update service worker on new versions
registerSW({ immediate: true });

const app = document.getElementById('app');
app.innerHTML = `
  <main class="container">
    <h1>Walk Cycle</h1>
    <p>Scaffold ready. Tracker, history and stats coming next.</p>
  </main>
`;
