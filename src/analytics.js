// Derive segments and aggregate stats from event sequences.
//
// Segment kinds (between consecutive presses inside a session):
//   up_duration   : up    -> pause   (climbing)
//   top_rest      : pause -> down    (resting at top)
//   down_duration : down  -> pause   (descending)
//   bottom_rest   : pause -> up      (resting at bottom)
//
// A "cycle" is one full up + top_rest + down + bottom_rest sequence,
// though the bottom_rest of the last cycle may be missing if the session ended.

export const SEGMENT_KINDS = Object.freeze({
  UP: 'up_duration',
  TOP_REST: 'top_rest',
  DOWN: 'down_duration',
  BOTTOM_REST: 'bottom_rest',
});

export const SEGMENT_LABELS = Object.freeze({
  [SEGMENT_KINDS.UP]: 'Up',
  [SEGMENT_KINDS.TOP_REST]: 'Top rest',
  [SEGMENT_KINDS.DOWN]: 'Down',
  [SEGMENT_KINDS.BOTTOM_REST]: 'Bottom rest',
});

export const SEGMENT_COLORS = Object.freeze({
  [SEGMENT_KINDS.UP]: '#4ade80',
  [SEGMENT_KINDS.TOP_REST]: '#fbbf24',
  [SEGMENT_KINDS.DOWN]: '#f87171',
  [SEGMENT_KINDS.BOTTOM_REST]: '#94a3b8',
});

/**
 * Given a chronological list of events for a session, return an array of
 * segments: { kind, startTs, endTs, durationMs, sessionId, cycleIndex }.
 *
 * The transition table mirrors the state machine. Invalid pairs are skipped.
 */
export function segmentsFromEvents(events) {
  if (!events || events.length < 2) return [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const segments = [];
  let cycleIndex = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const kind = pairKind(prev.type, cur.type);
    if (!kind) continue;
    segments.push({
      kind,
      startTs: prev.ts,
      endTs: cur.ts,
      durationMs: cur.ts - prev.ts,
      sessionId: prev.sessionId ?? cur.sessionId,
      cycleIndex,
    });
    // Bottom rest closes a cycle (its end starts the next one).
    if (kind === SEGMENT_KINDS.BOTTOM_REST) cycleIndex++;
  }
  return segments;
}

function pairKind(a, b) {
  if (a === 'up' && b === 'pause') return SEGMENT_KINDS.UP;
  if (a === 'pause' && b === 'down') return SEGMENT_KINDS.TOP_REST;
  if (a === 'down' && b === 'pause') return SEGMENT_KINDS.DOWN;
  if (a === 'pause' && b === 'up') return SEGMENT_KINDS.BOTTOM_REST;
  return null;
}

/**
 * Group segments into completed cycles. A complete cycle has all four kinds
 * in order: up, top_rest, down, bottom_rest. Returns an array of:
 *   { index, startTs, endTs, totalMs, segments: { up, top_rest, down, bottom_rest } }
 */
/**
 * Returns an array of cycles from segments.
 * If includeIncomplete is true, also returns partial cycles.
 */
export function cyclesFromSegments(segments, includeIncomplete = true) {
  const cycles = [];
  let current = null;

  const open = (seg) => ({
    index: cycles.length,
    startTs: seg.startTs,
    endTs: null,
    totalMs: 0,
    segments: {},
  });

  for (const seg of segments) {
    if (seg.kind === SEGMENT_KINDS.UP) {
      current = open(seg);
      current.segments[SEGMENT_KINDS.UP] = seg;
    } else if (current) {
      current.segments[seg.kind] = seg;
      if (seg.kind === SEGMENT_KINDS.BOTTOM_REST) {
        current.endTs = seg.endTs;
        current.totalMs = current.endTs - current.startTs;
        cycles.push(current);
        current = null;
      }
    }
  }

  if (includeIncomplete && current) {
    const lastSeg = Object.values(current.segments).pop();
    current.endTs = lastSeg?.endTs || current.startTs;
    current.totalMs = current.endTs - current.startTs;
    cycles.push(current);
  }

  return cycles;
}

/**
 * Returns aggregate stats for an array of segments:
 *   { byKind: { kind: { count, totalMs, avgMs, minMs, maxMs } } }
 */
export function aggregateBySegmentKind(segments) {
  const byKind = {};
  for (const kind of Object.values(SEGMENT_KINDS)) {
    byKind[kind] = { count: 0, totalMs: 0, avgMs: 0, minMs: Infinity, maxMs: 0 };
  }
  for (const s of segments) {
    const acc = byKind[s.kind];
    if (!acc) continue;
    acc.count++;
    acc.totalMs += s.durationMs;
    acc.minMs = Math.min(acc.minMs, s.durationMs);
    acc.maxMs = Math.max(acc.maxMs, s.durationMs);
  }
  for (const k of Object.keys(byKind)) {
    const acc = byKind[k];
    acc.avgMs = acc.count ? acc.totalMs / acc.count : 0;
    if (acc.minMs === Infinity) acc.minMs = 0;
  }
  return { byKind };
}

/**
 * Find the duration of a segment kind from a specific cycle index.
 * Returns undefined if that cycle doesn't have the segment.
 */
export function segmentDurationFromCycle(cycles, cycleIndex, kind) {
  const cyc = cycles[cycleIndex];
  if (!cyc) return undefined;
  const seg = cyc.segments[kind];
  return seg?.durationMs;
}

/**
 * Format a duration in ms as a human-readable string.
 *   12345  -> "12.3s"
 *   72000  -> "1m 12s"
 *   3725000 -> "1h 2m 5s"
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  if (ms < 1000) return `${ms} ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) {
    return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${totalSec}s`;
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/**
 * Live duration formatter for the active timer (always mm:ss or h:mm:ss).
 */
export function formatLive(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  ms = ms % 1000;
  const pad = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}:${pad(ms)}`;
}

/**
 * Find the previous event of the same type in a list of events.
 * @param {number} idx - Current index
 * @param {string} type - Event type to match
 * @param {Array} events - Array of events
 * @returns {Object|null} Previous event or null
 */
export function findPrevSameType(idx, type, events) {
  for (let i = idx - 1; i >= 0; i--) {
    if (events[i].type === type && events[i].nextTs)
      return events[i];
  }
  return null;
}
