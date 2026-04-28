import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { formatDuration, SEGMENT_KINDS, SEGMENT_LABELS, SEGMENT_COLORS } from './analytics.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

export function buildCycleDatasets(cycles) {
  const labels = cycles.map((_, i) => `#${i + 1}`);
  const datasets = [];
  
  for (const k of Object.values(SEGMENT_KINDS)) {
    const data = cycles.map(c => {
      const ms = c.segments[k]?.durationMs ?? null;
      return ms == null ? null : ms / 1000;
    });
    if (data.some(d => d !== null)) {
      datasets.push({
        label: SEGMENT_LABELS[k],
        data,
        borderColor: SEGMENT_COLORS[k],
        backgroundColor: SEGMENT_COLORS[k],
        tension: 0.25,
        spanGaps: true,
        pointRadius: 2,
      });
    }
  }
  
  return { labels, datasets };
}

export function createTrendChart(canvas, labels, datasets) {
  const ctx = canvas.getContext('2d');
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const fg = isDark ? '#ddd' : '#333';
  const muted = isDark ? '#888' : '#666';
  const grid = isDark ? '#333' : '#eee';
  
  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: fg, boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${formatDuration(ctx.parsed.y * 1000)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: muted, maxTicksLimit: 10 },
          grid: { color: grid },
        },
        y: {
          ticks: {
            color: muted,
            callback: (v) => formatDuration(v * 1000),
          },
          grid: { color: grid },
          title: { display: true, text: 'Duration', color: muted },
        },
      },
    },
  });
  
  return chart;
}