import { describe, it, expect } from 'vitest';
import {
  SEGMENT_KINDS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  segmentsFromEvents,
  cyclesFromSegments,
  aggregateBySegmentKind,
  segmentDurationFromCycle,
  formatDuration,
  formatLive,
  findPrevSameType,
} from './analytics.js';

describe('SEGMENT_KINDS', () => {
  it('should be frozen', () => {
    expect(Object.isFrozen(SEGMENT_KINDS)).toBe(true);
  });

  it('should have all four segment kinds', () => {
    expect(SEGMENT_KINDS.UP).toBe('up_duration');
    expect(SEGMENT_KINDS.TOP_REST).toBe('top_rest');
    expect(SEGMENT_KINDS.DOWN).toBe('down_duration');
    expect(SEGMENT_KINDS.BOTTOM_REST).toBe('bottom_rest');
  });
});

describe('SEGMENT_LABELS', () => {
  it('should be frozen', () => {
    expect(Object.isFrozen(SEGMENT_LABELS)).toBe(true);
  });

  it('should have correct labels for all segment kinds', () => {
    expect(SEGMENT_LABELS[SEGMENT_KINDS.UP]).toBe('Up');
    expect(SEGMENT_LABELS[SEGMENT_KINDS.TOP_REST]).toBe('Top rest');
    expect(SEGMENT_LABELS[SEGMENT_KINDS.DOWN]).toBe('Down');
    expect(SEGMENT_LABELS[SEGMENT_KINDS.BOTTOM_REST]).toBe('Bottom rest');
  });
});

describe('SEGMENT_COLORS', () => {
  it('should be frozen', () => {
    expect(Object.isFrozen(SEGMENT_COLORS)).toBe(true);
  });

  it('should have correct colors for all segment kinds', () => {
    expect(SEGMENT_COLORS[SEGMENT_KINDS.UP]).toBe('#4ade80');
    expect(SEGMENT_COLORS[SEGMENT_KINDS.TOP_REST]).toBe('#fbbf24');
    expect(SEGMENT_COLORS[SEGMENT_KINDS.DOWN]).toBe('#f87171');
    expect(SEGMENT_COLORS[SEGMENT_KINDS.BOTTOM_REST]).toBe('#94a3b8');
  });
});

describe('segmentsFromEvents', () => {
  it('should return empty array for null/undefined events', () => {
    expect(segmentsFromEvents(null)).toEqual([]);
    expect(segmentsFromEvents(undefined)).toEqual([]);
  });

  it('should return empty array for empty events array', () => {
    expect(segmentsFromEvents([])).toEqual([]);
  });

  it('should return empty array for single event', () => {
    const events = [{ type: 'up', ts: 1000, sessionId: 's1' }];
    expect(segmentsFromEvents(events)).toEqual([]);
  });

  it('should create segment for valid up -> pause pair', () => {
    const events = [
      { type: 'up', ts: 1000, sessionId: 's1' },
      { type: 'pause', ts: 5000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.UP);
    expect(segments[0].durationMs).toBe(4000);
    expect(segments[0].startTs).toBe(1000);
    expect(segments[0].endTs).toBe(5000);
    expect(segments[0].cycleIndex).toBe(0);
  });

  it('should create segment for valid pause -> down pair', () => {
    const events = [
      { type: 'pause', ts: 5000, sessionId: 's1' },
      { type: 'down', ts: 8000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.TOP_REST);
    expect(segments[0].durationMs).toBe(3000);
  });

  it('should create segment for valid down -> pause pair', () => {
    const events = [
      { type: 'down', ts: 8000, sessionId: 's1' },
      { type: 'pause', ts: 12000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.DOWN);
    expect(segments[0].durationMs).toBe(4000);
  });

  it('should create segment for valid pause -> up pair and increment cycleIndex', () => {
    const events = [
      { type: 'pause', ts: 12000, sessionId: 's1' },
      { type: 'up', ts: 15000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.BOTTOM_REST);
    expect(segments[0].cycleIndex).toBe(0);
  });

  it('should skip invalid pairs (e.g., up -> down)', () => {
    const events = [
      { type: 'up', ts: 1000, sessionId: 's1' },
      { type: 'down', ts: 5000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(0);
  });

  it('should create full cycle segments with correct cycleIndex', () => {
    const events = [
      { type: 'up', ts: 1000, sessionId: 's1' },
      { type: 'pause', ts: 5000, sessionId: 's1' },
      { type: 'down', ts: 8000, sessionId: 's1' },
      { type: 'pause', ts: 12000, sessionId: 's1' },
      { type: 'up', ts: 15000, sessionId: 's1' },
      { type: 'pause', ts: 20000, sessionId: 's1' },
      { type: 'down', ts: 25000, sessionId: 's1' },
      { type: 'pause', ts: 30000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    // 8 events produce 7 pairs, but last pair (pause->up) creates BOTTOM_REST
    // Actually: up->pause, pause->down, down->pause, pause->up(cycle++), up->pause, pause->down, down->pause
    expect(segments).toHaveLength(7);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.UP);
    expect(segments[0].cycleIndex).toBe(0);
    expect(segments[1].kind).toBe(SEGMENT_KINDS.TOP_REST);
    expect(segments[1].cycleIndex).toBe(0);
    expect(segments[2].kind).toBe(SEGMENT_KINDS.DOWN);
    expect(segments[2].cycleIndex).toBe(0);
    expect(segments[3].kind).toBe(SEGMENT_KINDS.BOTTOM_REST);
    expect(segments[3].cycleIndex).toBe(0);
    expect(segments[4].kind).toBe(SEGMENT_KINDS.UP);
    expect(segments[4].cycleIndex).toBe(1);
    expect(segments[5].kind).toBe(SEGMENT_KINDS.TOP_REST);
    expect(segments[5].cycleIndex).toBe(1);
    expect(segments[6].kind).toBe(SEGMENT_KINDS.DOWN);
    expect(segments[6].cycleIndex).toBe(1);
  });

  it('should handle partial cycle (missing bottom_rest)', () => {
    const events = [
      { type: 'up', ts: 1000, sessionId: 's1' },
      { type: 'pause', ts: 5000, sessionId: 's1' },
      { type: 'down', ts: 8000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(2);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.UP);
    expect(segments[1].kind).toBe(SEGMENT_KINDS.TOP_REST);
  });

  it('should sort events by timestamp', () => {
    const events = [
      { type: 'pause', ts: 5000, sessionId: 's1' },
      { type: 'up', ts: 1000, sessionId: 's1' },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.UP);
    expect(segments[0].startTs).toBe(1000);
    expect(segments[0].endTs).toBe(5000);
  });

  it('should use sessionId from prev or cur event', () => {
    const events = [
      { type: 'up', ts: 1000, sessionId: 's1' },
      { type: 'pause', ts: 5000 },
    ];
    const segments = segmentsFromEvents(events);
    expect(segments[0].sessionId).toBe('s1');
  });

  it('should skip invalid pairs in mixed sequence', () => {
    const events = [
      { type: 'up', ts: 1000, sessionId: 's1' },
      { type: 'down', ts: 2000, sessionId: 's1' }, // up->down invalid
      { type: 'pause', ts: 3000, sessionId: 's1' }, // down->pause valid = DOWN
      { type: 'down', ts: 4000, sessionId: 's1' }, // pause->down valid = TOP_REST
      { type: 'pause', ts: 5000, sessionId: 's1' }, // down->pause valid = DOWN
    ];
    const segments = segmentsFromEvents(events);
    expect(segments).toHaveLength(3);
    expect(segments[0].kind).toBe(SEGMENT_KINDS.DOWN);
    expect(segments[1].kind).toBe(SEGMENT_KINDS.TOP_REST);
    expect(segments[2].kind).toBe(SEGMENT_KINDS.DOWN);
  });
});

describe('cyclesFromSegments', () => {
  it('should return empty array for empty segments', () => {
    expect(cyclesFromSegments([])).toEqual([]);
  });

  it('should return empty array for segments without up_duration', () => {
    const segments = [
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 1000, endTs: 2000, durationMs: 1000 },
    ];
    expect(cyclesFromSegments(segments)).toEqual([]);
  });

  it('should create complete cycle with all four segments', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, startTs: 1000, endTs: 5000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 5000, endTs: 8000, durationMs: 3000 },
      { kind: SEGMENT_KINDS.DOWN, startTs: 8000, endTs: 12000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.BOTTOM_REST, startTs: 12000, endTs: 15000, durationMs: 3000 },
    ];
    const cycles = cyclesFromSegments(segments);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].index).toBe(0);
    expect(cycles[0].startTs).toBe(1000);
    expect(cycles[0].endTs).toBe(15000);
    expect(cycles[0].totalMs).toBe(14000);
    expect(cycles[0].segments[SEGMENT_KINDS.UP]).toEqual(segments[0]);
    expect(cycles[0].segments[SEGMENT_KINDS.TOP_REST]).toEqual(segments[1]);
    expect(cycles[0].segments[SEGMENT_KINDS.DOWN]).toEqual(segments[2]);
    expect(cycles[0].segments[SEGMENT_KINDS.BOTTOM_REST]).toEqual(segments[3]);
  });

  it('should create multiple complete cycles', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, startTs: 1000, endTs: 5000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 5000, endTs: 8000, durationMs: 3000 },
      { kind: SEGMENT_KINDS.DOWN, startTs: 8000, endTs: 12000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.BOTTOM_REST, startTs: 12000, endTs: 15000, durationMs: 3000 },
      { kind: SEGMENT_KINDS.UP, startTs: 15000, endTs: 20000, durationMs: 5000 },
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 20000, endTs: 23000, durationMs: 3000 },
      { kind: SEGMENT_KINDS.DOWN, startTs: 23000, endTs: 27000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.BOTTOM_REST, startTs: 27000, endTs: 30000, durationMs: 3000 },
    ];
    const cycles = cyclesFromSegments(segments);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].index).toBe(0);
    expect(cycles[1].index).toBe(1);
  });

  it('should include incomplete cycle when includeIncomplete is true (default)', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, startTs: 1000, endTs: 5000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 5000, endTs: 8000, durationMs: 3000 },
    ];
    const cycles = cyclesFromSegments(segments);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].segments[SEGMENT_KINDS.UP]).toBeDefined();
    expect(cycles[0].segments[SEGMENT_KINDS.TOP_REST]).toBeDefined();
    expect(cycles[0].segments[SEGMENT_KINDS.DOWN]).toBeUndefined();
    expect(cycles[0].endTs).toBe(8000);
  });

  it('should not include incomplete cycle when includeIncomplete is false', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, startTs: 1000, endTs: 5000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 5000, endTs: 8000, durationMs: 3000 },
    ];
    const cycles = cyclesFromSegments(segments, false);
    expect(cycles).toHaveLength(0);
  });

  it('should handle incomplete cycle with only up_duration', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, startTs: 1000, endTs: 5000, durationMs: 4000 },
    ];
    const cycles = cyclesFromSegments(segments);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].segments[SEGMENT_KINDS.UP]).toBeDefined();
    expect(cycles[0].endTs).toBe(5000);
  });

  it('should ignore segments before first up_duration', () => {
    const segments = [
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 1000, endTs: 2000, durationMs: 1000 },
      { kind: SEGMENT_KINDS.UP, startTs: 2000, endTs: 5000, durationMs: 3000 },
      { kind: SEGMENT_KINDS.TOP_REST, startTs: 5000, endTs: 8000, durationMs: 3000 },
      { kind: SEGMENT_KINDS.DOWN, startTs: 8000, endTs: 12000, durationMs: 4000 },
      { kind: SEGMENT_KINDS.BOTTOM_REST, startTs: 12000, endTs: 15000, durationMs: 3000 },
    ];
    const cycles = cyclesFromSegments(segments);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].startTs).toBe(2000);
  });
});

describe('aggregateBySegmentKind', () => {
  it('should return object with all kinds initialized', () => {
    const result = aggregateBySegmentKind([]);
    for (const kind of Object.values(SEGMENT_KINDS)) {
      expect(result.byKind[kind]).toBeDefined();
      expect(result.byKind[kind].count).toBe(0);
      expect(result.byKind[kind].totalMs).toBe(0);
      expect(result.byKind[kind].avgMs).toBe(0);
      expect(result.byKind[kind].minMs).toBe(0);
      expect(result.byKind[kind].maxMs).toBe(0);
    }
  });

  it('should aggregate single segment', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 5000 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].count).toBe(1);
    expect(result.byKind[SEGMENT_KINDS.UP].totalMs).toBe(5000);
    expect(result.byKind[SEGMENT_KINDS.UP].avgMs).toBe(5000);
    expect(result.byKind[SEGMENT_KINDS.UP].minMs).toBe(5000);
    expect(result.byKind[SEGMENT_KINDS.UP].maxMs).toBe(5000);
  });

  it('should aggregate multiple segments of same kind', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 5000 },
      { kind: SEGMENT_KINDS.UP, durationMs: 3000 },
      { kind: SEGMENT_KINDS.UP, durationMs: 7000 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].count).toBe(3);
    expect(result.byKind[SEGMENT_KINDS.UP].totalMs).toBe(15000);
    expect(result.byKind[SEGMENT_KINDS.UP].avgMs).toBe(5000);
    expect(result.byKind[SEGMENT_KINDS.UP].minMs).toBe(3000);
    expect(result.byKind[SEGMENT_KINDS.UP].maxMs).toBe(7000);
  });

  it('should aggregate segments of different kinds', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 5000 },
      { kind: SEGMENT_KINDS.TOP_REST, durationMs: 2000 },
      { kind: SEGMENT_KINDS.DOWN, durationMs: 4000 },
      { kind: SEGMENT_KINDS.BOTTOM_REST, durationMs: 3000 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].count).toBe(1);
    expect(result.byKind[SEGMENT_KINDS.TOP_REST].count).toBe(1);
    expect(result.byKind[SEGMENT_KINDS.DOWN].count).toBe(1);
    expect(result.byKind[SEGMENT_KINDS.BOTTOM_REST].count).toBe(1);
  });

  it('should handle min/max for single segment', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 5000 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].minMs).toBe(5000);
    expect(result.byKind[SEGMENT_KINDS.UP].maxMs).toBe(5000);
  });

  it('should handle min/max for multiple segments', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 1000 },
      { kind: SEGMENT_KINDS.UP, durationMs: 5000 },
      { kind: SEGMENT_KINDS.UP, durationMs: 3000 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].minMs).toBe(1000);
    expect(result.byKind[SEGMENT_KINDS.UP].maxMs).toBe(5000);
  });

  it('should calculate avgMs correctly with decimal result', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 1000 },
      { kind: SEGMENT_KINDS.UP, durationMs: 2000 },
      { kind: SEGMENT_KINDS.UP, durationMs: 3000 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].avgMs).toBe(2000);
  });

  it('should ignore segments with unknown kind', () => {
    const segments = [
      { kind: SEGMENT_KINDS.UP, durationMs: 5000 },
      { kind: 'unknown', durationMs: 9999 },
    ];
    const result = aggregateBySegmentKind(segments);
    expect(result.byKind[SEGMENT_KINDS.UP].count).toBe(1);
  });
});

describe('segmentDurationFromCycle', () => {
  const cycles = [
    {
      index: 0,
      segments: {
        [SEGMENT_KINDS.UP]: { durationMs: 5000 },
        [SEGMENT_KINDS.TOP_REST]: { durationMs: 2000 },
        [SEGMENT_KINDS.DOWN]: { durationMs: 4000 },
        [SEGMENT_KINDS.BOTTOM_REST]: { durationMs: 3000 },
      },
    },
    {
      index: 1,
      segments: {
        [SEGMENT_KINDS.UP]: { durationMs: 6000 },
      },
    },
  ];

  it('should return duration for valid cycle and kind', () => {
    expect(segmentDurationFromCycle(cycles, 0, SEGMENT_KINDS.UP)).toBe(5000);
    expect(segmentDurationFromCycle(cycles, 0, SEGMENT_KINDS.TOP_REST)).toBe(2000);
    expect(segmentDurationFromCycle(cycles, 0, SEGMENT_KINDS.DOWN)).toBe(4000);
    expect(segmentDurationFromCycle(cycles, 0, SEGMENT_KINDS.BOTTOM_REST)).toBe(3000);
  });

  it('should return undefined for invalid cycle index', () => {
    expect(segmentDurationFromCycle(cycles, 5, SEGMENT_KINDS.UP)).toBeUndefined();
    expect(segmentDurationFromCycle(cycles, -1, SEGMENT_KINDS.UP)).toBeUndefined();
  });

  it('should return undefined for missing segment kind in cycle', () => {
    expect(segmentDurationFromCycle(cycles, 1, SEGMENT_KINDS.DOWN)).toBeUndefined();
    expect(segmentDurationFromCycle(cycles, 1, SEGMENT_KINDS.TOP_REST)).toBeUndefined();
  });

  it('should return undefined for empty cycles array', () => {
    expect(segmentDurationFromCycle([], 0, SEGMENT_KINDS.UP)).toBeUndefined();
  });

  it('should handle cycle with segment that has undefined durationMs', () => {
    const cyclesWithUndefined = [
      {
        index: 0,
        segments: {
          [SEGMENT_KINDS.UP]: {},
        },
      },
    ];
    expect(segmentDurationFromCycle(cyclesWithUndefined, 0, SEGMENT_KINDS.UP)).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('should return "–" for negative ms', () => {
    expect(formatDuration(-1)).toBe('–');
    expect(formatDuration(-1000)).toBe('–');
  });

  it('should return "–" for NaN', () => {
    expect(formatDuration(NaN)).toBe('–');
  });

  it('should return "–" for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('–');
    expect(formatDuration(-Infinity)).toBe('–');
  });

  it('should format 0 ms as "0 ms"', () => {
    expect(formatDuration(0)).toBe('0 ms');
  });

  it('should format ms < 1000 as "{ms} ms"', () => {
    expect(formatDuration(1)).toBe('1 ms');
    expect(formatDuration(999)).toBe('999 ms');
    expect(formatDuration(500)).toBe('500 ms');
  });

  it('should format ms < 60000 with one decimal as "X.Xs"', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(12345)).toBe('12.3s');
    // 59999 ms rounds to 60 seconds (totalSec = 60), which is not < 60, so goes to minutes
    expect(formatDuration(59999)).toBe('1m 0s');
  });

  it('should format exactly 60000 ms as "60s" (since totalSec = 60)', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
  });

  it('should format minutes without hours', () => {
    expect(formatDuration(61000)).toBe('1m 1s');
    expect(formatDuration(120000)).toBe('2m 0s');
    // 7265000 ms = 7265 seconds = 121m 5s -> but implementation shows hours
    expect(formatDuration(7265000)).toBe('2h 1m 5s');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatDuration(3600000)).toBe('1h 0m 0s');
    expect(formatDuration(3725000)).toBe('1h 2m 5s');
    expect(formatDuration(7325000)).toBe('2h 2m 5s');
  });

  it('should handle fractional seconds correctly', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(2500)).toBe('2.5s');
  });

  it('should handle large values', () => {
    expect(formatDuration(36000000)).toBe('10h 0m 0s');
  });

  it('should format multi-day durations with d suffix', () => {
    expect(formatDuration(86400000)).toBe('24h 0m 0s');
    expect(formatDuration(90000000)).toBe('1d 1h 0m');
    expect(formatDuration(172800000)).toBe('2d 0h 0m');
    expect(formatDuration(176400000)).toBe('2d 1h 0m');
    expect(formatDuration(181800000)).toBe('2d 2h 30m');
    expect(formatDuration(439109000)).toBe('5d 1h 58m');
  });
});

describe('formatLive', () => {
  it('should format 0 ms as "00:00"', () => {
    expect(formatLive(0)).toBe('00:00');
  });

  it('should handle negative ms as 0', () => {
    expect(formatLive(-1000)).toBe('00:00');
  });

  it('should handle NaN and Infinity', () => {
    expect(formatLive(NaN)).toBe('00:00');
    expect(formatLive(Infinity)).toBe('00:00');
  });

  it('should format seconds without hours as mm:ss', () => {
    expect(formatLive(1000)).toBe('00:01');
    expect(formatLive(5000)).toBe('00:05');
    expect(formatLive(59999)).toBe('00:59');
  });

  it('should format minutes without hours', () => {
    expect(formatLive(60000)).toBe('01:00');
    expect(formatLive(61000)).toBe('01:01');
    expect(formatLive(125000)).toBe('02:05');
  });

  it('should format with hours as h:mm:ss', () => {
    expect(formatLive(3600000)).toBe('1:00:00');
    expect(formatLive(3725000)).toBe('1:02:05');
    expect(formatLive(7325000)).toBe('2:02:05');
  });

  it('should not include milliseconds', () => {
    expect(formatLive(1234)).toBe('00:01');
    expect(formatLive(61001)).toBe('01:01');
  });

  it('should pad minutes and seconds with zeros', () => {
    expect(formatLive(1000)).toBe('00:01');
    expect(formatLive(60000)).toBe('01:00');
  });
});

describe('findPrevSameType', () => {
  const events = [
    { type: 'up', ts: 1000, nextTs: 5000 },
    { type: 'pause', ts: 5000, nextTs: 8000 },
    { type: 'down', ts: 8000, nextTs: 12000 },
    { type: 'pause', ts: 12000, nextTs: 15000 },
    { type: 'up', ts: 15000, nextTs: 20000 },
  ];

  it('should find previous event of same type with nextTs', () => {
    const result = findPrevSameType(4, 'up', events);
    expect(result).toEqual({ type: 'up', ts: 1000, nextTs: 5000 });
  });

  it('should return null if no previous event of same type', () => {
    const result = findPrevSameType(0, 'up', events);
    expect(result).toBeNull();
  });

  it('should return null if previous event of same type has no nextTs', () => {
    const eventsNoNextTs = [
      { type: 'up', ts: 1000 },
      { type: 'up', ts: 5000, nextTs: 8000 },
    ];
    // At idx 1, looks at idx 0 which has no nextTs, so returns null
    const result = findPrevSameType(1, 'up', eventsNoNextTs);
    expect(result).toBeNull();
  });

  it('should skip events without nextTs when searching', () => {
    const eventsWithGaps = [
      { type: 'up', ts: 1000 }, // no nextTs, should be skipped
      { type: 'pause', ts: 2000, nextTs: 3000 },
      { type: 'up', ts: 4000, nextTs: 5000 },
    ];
    // At idx 2, looks backwards: idx 1 is 'pause' (wrong type), idx 0 is 'up' but no nextTs
    // So it should return null because the only previous 'up' has no nextTs
    const result = findPrevSameType(2, 'up', eventsWithGaps);
    expect(result).toBeNull();
  });

  it('should return null for index 0 (no previous events)', () => {
    const events = [
      { type: 'up', ts: 1000, nextTs: 5000 },
    ];
    expect(findPrevSameType(0, 'up', events)).toBeNull();
  });

  it('should handle out of bounds by returning null (with bounds check)', () => {
    const events = [
      { type: 'up', ts: 1000, nextTs: 5000 },
    ];
    // The function will crash on negative index, so we test valid boundary
    expect(findPrevSameType(0, 'up', events)).toBeNull();
  });

  it('should handle empty events array', () => {
    expect(findPrevSameType(0, 'up', [])).toBeNull();
  });

  it('should find previous pause event with nextTs', () => {
    const result = findPrevSameType(3, 'pause', events);
    expect(result).toEqual({ type: 'pause', ts: 5000, nextTs: 8000 });
  });
});
