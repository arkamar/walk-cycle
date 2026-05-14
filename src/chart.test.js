import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SEGMENT_KINDS, SEGMENT_LABELS, SEGMENT_COLORS } from './analytics.js';

// Mock chart.js module
const mockChartInstance = {
  destroy: vi.fn(),
  update: vi.fn(),
  data: null,
  options: null,
};

class MockChart {
  constructor(ctx, config) {
    mockChartInstance.data = config.data;
    mockChartInstance.options = config.options;
    mockChartInstance.config = config;
    return mockChartInstance;
  }
}

// Add register method to Chart mock
MockChart.register = vi.fn();

vi.mock('chart.js', () => ({
  Chart: MockChart,
  LineController: {},
  LineElement: {},
  PointElement: {},
  LinearScale: {},
  CategoryScale: {},
  Tooltip: {},
  Legend: {},
}));

// Import after mocking
const { buildCycleDatasets, createTrendChart, createChartEmptyEl } = await import('./chart.js');

describe('chart.js', () => {
  let mockCanvas;
  let mockContext;
  let mockMatchMedia;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      canvas: {},
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
    };

    mockMatchMedia = vi.fn(() => ({ matches: false }));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createChartEmptyEl', () => {
    it('should return a div with chart-empty class and "No data yet" text', () => {
      const el = createChartEmptyEl();
      expect(el.tagName).toBe('DIV');
      expect(el.classList.contains('chart-empty')).toBe(true);
      expect(el.classList.contains('muted')).toBe(true);
      expect(el.textContent).toBe('No data yet');
    });
  });

  describe('buildCycleDatasets', () => {
    it('should return empty labels and datasets for empty cycles array', () => {
      const result = buildCycleDatasets([]);

      expect(result.labels).toEqual([]);
      expect(result.datasets).toEqual([]);
    });

    it('should create correct labels for cycles', () => {
      const cycles = [
        { segments: {} },
        { segments: {} },
        { segments: {} },
      ];

      const result = buildCycleDatasets(cycles);

      expect(result.labels).toEqual(['#1', '#2', '#3']);
    });

    it('should include dataset for segment kind with valid data', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 5000 },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);

      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].label).toBe(SEGMENT_LABELS[SEGMENT_KINDS.UP]);
      expect(result.datasets[0].data).toEqual([5]); // 5000ms = 5s
      expect(result.datasets[0].borderColor).toBe(SEGMENT_COLORS[SEGMENT_KINDS.UP]);
      expect(result.datasets[0].backgroundColor).toBe(SEGMENT_COLORS[SEGMENT_KINDS.UP]);
    });

    it('should convert durationMs to seconds', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 12345 },
            [SEGMENT_KINDS.TOP_REST]: { durationMs: 6789 },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);

      const upDataset = result.datasets.find(d => d.label === SEGMENT_LABELS[SEGMENT_KINDS.UP]);
      const restDataset = result.datasets.find(d => d.label === SEGMENT_LABELS[SEGMENT_KINDS.TOP_REST]);

      expect(upDataset.data).toEqual([12.345]);
      expect(restDataset.data).toEqual([6.789]);
    });

    it('should handle multiple cycles with mixed segment data', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 5000 },
            [SEGMENT_KINDS.TOP_REST]: { durationMs: 2000 },
          },
        },
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 6000 },
            [SEGMENT_KINDS.DOWN]: { durationMs: 4000 },
          },
        },
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 5500 },
            [SEGMENT_KINDS.TOP_REST]: { durationMs: 1800 },
            [SEGMENT_KINDS.DOWN]: { durationMs: 4500 },
            [SEGMENT_KINDS.BOTTOM_REST]: { durationMs: 3000 },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);

      expect(result.labels).toEqual(['#1', '#2', '#3']);

      const upDataset = result.datasets.find(d => d.label === 'Up');
      const topRestDataset = result.datasets.find(d => d.label === 'Top rest');
      const downDataset = result.datasets.find(d => d.label === 'Down');
      const bottomRestDataset = result.datasets.find(d => d.label === 'Bottom rest');

      expect(upDataset.data).toEqual([5, 6, 5.5]);
      expect(topRestDataset.data).toEqual([2, null, 1.8]);
      expect(downDataset.data).toEqual([null, 4, 4.5]);
      expect(bottomRestDataset.data).toEqual([null, null, 3]);
    });

    it('should only include datasets that have at least one non-null value', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 5000 },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);

      const datasetLabels = result.datasets.map(d => d.label);
      expect(datasetLabels).toContain('Up');
      expect(datasetLabels).not.toContain('Top rest');
      expect(datasetLabels).not.toContain('Down');
      expect(datasetLabels).not.toContain('Bottom rest');
    });

    it('should handle null durationMs values', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: null },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);

      // UP dataset should not be included since all values are null
      const datasetLabels = result.datasets.map(d => d.label);
      expect(datasetLabels).not.toContain('Up');
    });

    it('should handle missing segment object', () => {
      const cycles = [
        {
          segments: {},
        },
      ];

      const result = buildCycleDatasets(cycles);

      expect(result.datasets).toEqual([]);
    });

    it('should handle segment with undefined durationMs', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: undefined },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);

      const datasetLabels = result.datasets.map(d => d.label);
      expect(datasetLabels).not.toContain('Up');
    });

    it('should set correct dataset properties', () => {
      const cycles = [
        {
          segments: {
            [SEGMENT_KINDS.UP]: { durationMs: 5000 },
          },
        },
      ];

      const result = buildCycleDatasets(cycles);
      const dataset = result.datasets[0];

      expect(dataset.tension).toBe(0.25);
      expect(dataset.spanGaps).toBe(true);
      expect(dataset.pointRadius).toBe(2);
    });
  });

  describe('createTrendChart', () => {
    it('should get 2d context from canvas', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    });

    it('should create Chart with correct type and data', () => {
      const labels = ['#1', '#2'];
      const datasets = [
        {
          label: 'Up',
          data: [5, 6],
        },
      ];

      createTrendChart(mockCanvas, labels, datasets);

      expect(mockChartInstance.data).toEqual({ labels, datasets });
    });

    it('should use light mode colors by default', () => {
      mockMatchMedia.mockReturnValue({ matches: false });

      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.plugins.legend.labels.color).toBe('#333');
      expect(options.scales.x.ticks.color).toBe('#666');
      expect(options.scales.x.grid.color).toBe('#eee');
      expect(options.scales.y.ticks.color).toBe('#666');
      expect(options.scales.y.grid.color).toBe('#eee');
    });

    it('should use dark mode colors when prefers-color-scheme is dark', () => {
      mockMatchMedia.mockReturnValue({ matches: true });

      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.plugins.legend.labels.color).toBe('#ddd');
      expect(options.scales.x.ticks.color).toBe('#888');
      expect(options.scales.x.grid.color).toBe('#333');
      expect(options.scales.y.ticks.color).toBe('#888');
      expect(options.scales.y.grid.color).toBe('#333');
    });

    it('should configure chart with responsive and animation settings', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.responsive).toBe(true);
      expect(options.maintainAspectRatio).toBe(false);
      expect(options.animation).toBe(false);
    });

    it('should configure legend at bottom position', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.plugins.legend.position).toBe('bottom');
      expect(options.plugins.legend.labels.boxWidth).toBe(12);
      expect(options.plugins.legend.labels.font.size).toBe(11);
    });

    it('should configure tooltip with formatDuration callback', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.plugins.tooltip.callbacks.label).toBeDefined();

      // Test the tooltip callback
      const callback = options.plugins.tooltip.callbacks.label;
      const mockCtx = {
        dataset: { label: 'Up' },
        parsed: { y: 5 }, // 5 seconds
      };
      const result = callback(mockCtx);
      expect(result).toBe(' Up: 5.0s');
    });

    it('should configure y-axis with formatDuration tick callback', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      const callback = options.scales.y.ticks.callback;
      expect(callback).toBeDefined();

      // Test the tick callback
      expect(callback(5)).toBe('5.0s');
      expect(callback(60)).toBe('1m 0s');
    });

    it('should configure x-axis with maxTicksLimit', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.scales.x.ticks.maxTicksLimit).toBe(10);
    });

    it('should set y-axis title', () => {
      const labels = ['#1'];
      const datasets = [];

      createTrendChart(mockCanvas, labels, datasets);

      const options = mockChartInstance.options;
      expect(options.scales.y.title.display).toBe(true);
      expect(options.scales.y.title.text).toBe('Duration');
    });

    it('should return the chart instance', () => {
      const labels = ['#1'];
      const datasets = [];

      const chart = createTrendChart(mockCanvas, labels, datasets);

      expect(chart).toBe(mockChartInstance);
    });
  });
});
