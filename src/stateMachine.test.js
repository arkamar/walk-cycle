import { describe, it, expect } from 'vitest';
import {
  STATES,
  EVENTS,
  nextState,
  allowedEvents,
  stateFromEvents,
  stateLabel,
  buttonStatesFor,
  sessionStatus,
  isResumable,
} from './stateMachine.js';

// ---------------------------------------------------------------------------
// Pure FSM
// ---------------------------------------------------------------------------

describe('nextState', () => {
  it('walks one full cycle: idle -> going_up -> at_top -> going_down -> at_bottom -> going_up', () => {
    expect(nextState(STATES.IDLE, EVENTS.UP)).toBe(STATES.GOING_UP);
    expect(nextState(STATES.GOING_UP, EVENTS.PAUSE)).toBe(STATES.AT_TOP);
    expect(nextState(STATES.AT_TOP, EVENTS.DOWN)).toBe(STATES.GOING_DOWN);
    expect(nextState(STATES.GOING_DOWN, EVENTS.PAUSE)).toBe(STATES.AT_BOTTOM);
    expect(nextState(STATES.AT_BOTTOM, EVENTS.UP)).toBe(STATES.GOING_UP);
  });

  it.each([
    [STATES.IDLE, EVENTS.PAUSE],
    [STATES.IDLE, EVENTS.DOWN],
    [STATES.GOING_UP, EVENTS.UP],
    [STATES.GOING_UP, EVENTS.DOWN],
    [STATES.AT_TOP, EVENTS.UP],
    [STATES.AT_TOP, EVENTS.PAUSE],
    [STATES.GOING_DOWN, EVENTS.UP],
    [STATES.GOING_DOWN, EVENTS.DOWN],
    [STATES.AT_BOTTOM, EVENTS.PAUSE],
    [STATES.AT_BOTTOM, EVENTS.DOWN],
  ])('returns null for invalid transition %s + %s', (state, event) => {
    expect(nextState(state, event)).toBeNull();
  });

  it('returns null for unknown state', () => {
    expect(nextState('bogus', EVENTS.UP)).toBeNull();
  });

  it('returns null for unknown event from a known state', () => {
    expect(nextState(STATES.IDLE, 'sideways')).toBeNull();
  });
});

describe('allowedEvents', () => {
  it.each([
    [STATES.IDLE, [EVENTS.UP]],
    [STATES.GOING_UP, [EVENTS.PAUSE]],
    [STATES.AT_TOP, [EVENTS.DOWN]],
    [STATES.GOING_DOWN, [EVENTS.PAUSE]],
    [STATES.AT_BOTTOM, [EVENTS.UP]],
  ])('%s allows exactly %j', (state, expected) => {
    expect(allowedEvents(state).sort()).toEqual(expected.sort());
  });

  it('returns [] for an unknown state', () => {
    expect(allowedEvents('bogus')).toEqual([]);
  });
});

describe('stateFromEvents', () => {
  const ts = (i) => ({ ts: 1000 + i });

  it('empty event list -> idle', () => {
    expect(stateFromEvents([])).toBe(STATES.IDLE);
  });

  it('reproduces a single full cycle ending at_bottom', () => {
    const events = [
      { type: EVENTS.UP, ...ts(1) },
      { type: EVENTS.PAUSE, ...ts(2) },
      { type: EVENTS.DOWN, ...ts(3) },
      { type: EVENTS.PAUSE, ...ts(4) },
    ];
    expect(stateFromEvents(events)).toBe(STATES.AT_BOTTOM);
  });

  it('reproduces two full cycles', () => {
    const events = [
      { type: EVENTS.UP }, { type: EVENTS.PAUSE },
      { type: EVENTS.DOWN }, { type: EVENTS.PAUSE },
      { type: EVENTS.UP }, { type: EVENTS.PAUSE },
      { type: EVENTS.DOWN }, { type: EVENTS.PAUSE },
    ];
    expect(stateFromEvents(events)).toBe(STATES.AT_BOTTOM);
  });

  it('lands on at_top after up,pause', () => {
    expect(
      stateFromEvents([{ type: EVENTS.UP }, { type: EVENTS.PAUSE }])
    ).toBe(STATES.AT_TOP);
  });

  it('silently ignores invalid events while computing state', () => {
    // up (->going_up), bogus (ignored), pause (->at_top)
    const events = [
      { type: EVENTS.UP },
      { type: EVENTS.DOWN }, // invalid from going_up
      { type: EVENTS.PAUSE },
    ];
    expect(stateFromEvents(events)).toBe(STATES.AT_TOP);
  });
});

describe('stateLabel', () => {
  it('returns Unknown for unrecognised states', () => {
    expect(stateLabel('bogus')).toBe('Unknown');
  });

  it('returns a human label for every defined state', () => {
    for (const s of Object.values(STATES)) {
      expect(stateLabel(s)).not.toBe('Unknown');
    }
  });
});

// ---------------------------------------------------------------------------
// sessionStatus / isResumable: lifecycle classification
// ---------------------------------------------------------------------------

describe('sessionStatus', () => {
  it('returns "none" for null/undefined', () => {
    expect(sessionStatus(null)).toBe('none');
    expect(sessionStatus(undefined)).toBe('none');
  });

  it('returns "active" for a fresh running session', () => {
    expect(sessionStatus({ id: 1, startedAt: 0 })).toBe('active');
  });

  it('returns "active" when stoppedAt and endedAt are explicitly null', () => {
    expect(
      sessionStatus({ id: 1, startedAt: 0, stoppedAt: null, endedAt: null })
    ).toBe('active');
  });

  it('returns "stopped" when only stoppedAt is set', () => {
    expect(
      sessionStatus({ id: 1, startedAt: 0, stoppedAt: 5000, endedAt: null })
    ).toBe('stopped');
  });

  it('returns "ended" when endedAt is set, regardless of stoppedAt', () => {
    expect(sessionStatus({ id: 1, endedAt: 9000 })).toBe('ended');
    expect(
      sessionStatus({ id: 1, stoppedAt: 5000, endedAt: 9000 })
    ).toBe('ended');
  });
});

describe('isResumable', () => {
  it('only stopped sessions are resumable', () => {
    expect(isResumable(null)).toBe(false);
    expect(isResumable({ id: 1 })).toBe(false); // active
    expect(isResumable({ id: 1, stoppedAt: 5000 })).toBe(true);
    expect(isResumable({ id: 1, endedAt: 9000 })).toBe(false);
    expect(
      isResumable({ id: 1, stoppedAt: 5000, endedAt: 9000 })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buttonStatesFor: the tracker-button mental model
// ---------------------------------------------------------------------------

describe('buttonStatesFor', () => {
  // helpers
  const noSession = () => ({ session: null, events: [] });
  const running = (events = []) => ({
    session: { id: 1, startedAt: 0, stoppedAt: null },
    events,
  });
  const stopped = (events = []) => ({
    session: { id: 1, startedAt: 0, stoppedAt: 5000 },
    events,
  });
  const orphanEvents = (events) => ({ session: null, events });

  describe('no session, no events (initial state)', () => {
    it('only Up is enabled; Stop is disabled', () => {
      const r = buttonStatesFor(noSession());
      expect(r.up.enabled).toBe(true);
      expect(r.pause.enabled).toBe(false);
      expect(r.down.enabled).toBe(false);
      expect(r.stop).toEqual({ enabled: false, label: 'Stop' });
    });
  });

  describe('running session, FSM-driven button availability', () => {
    it('GOING_UP: pause + down enabled, up disabled, Stop active', () => {
      const r = buttonStatesFor(running([{ type: EVENTS.UP }]));
      expect(r.up.enabled).toBe(false);
      expect(r.pause.enabled).toBe(true);
      expect(r.down.enabled).toBe(true);
      expect(r.stop).toEqual({ enabled: true, label: 'Stop' });
    });

    it('AT_TOP: only down enabled, Stop active', () => {
      const r = buttonStatesFor(
        running([{ type: EVENTS.UP }, { type: EVENTS.PAUSE }])
      );
      expect(r.up.enabled).toBe(false);
      expect(r.pause.enabled).toBe(false);
      expect(r.down.enabled).toBe(true);
      expect(r.stop).toEqual({ enabled: true, label: 'Stop' });
    });

    it('GOING_DOWN: pause + up enabled, down disabled', () => {
      const r = buttonStatesFor(
        running([
          { type: EVENTS.UP },
          { type: EVENTS.PAUSE },
          { type: EVENTS.DOWN },
        ])
      );
      expect(r.up.enabled).toBe(true);
      expect(r.pause.enabled).toBe(true);
      expect(r.down.enabled).toBe(false);
      expect(r.stop).toEqual({ enabled: true, label: 'Stop' });
    });

    it('AT_BOTTOM: only up enabled', () => {
      const r = buttonStatesFor(
        running([
          { type: EVENTS.UP },
          { type: EVENTS.PAUSE },
          { type: EVENTS.DOWN },
          { type: EVENTS.PAUSE },
        ])
      );
      expect(r.up.enabled).toBe(true);
      expect(r.pause.enabled).toBe(false);
      expect(r.down.enabled).toBe(false);
      expect(r.stop).toEqual({ enabled: true, label: 'Stop' });
    });
  });

  describe('stopped session', () => {
    it('shows Resume; cycle buttons frozen except Up (= new session)', () => {
      const r = buttonStatesFor(
        stopped([
          { type: EVENTS.UP },
          { type: EVENTS.PAUSE },
        ])
      );
      expect(r.stop).toEqual({ enabled: true, label: 'Resume' });
      expect(r.up.enabled).toBe(true);
      expect(r.pause.enabled).toBe(false);
      expect(r.down.enabled).toBe(false);
    });
  });

  describe('orphan events (no session, but events exist locally)', () => {
    it('treated like stopped: Resume + Up enabled', () => {
      const r = buttonStatesFor(
        orphanEvents([
          { type: EVENTS.UP },
          { type: EVENTS.PAUSE },
          { type: EVENTS.DOWN },
          { type: EVENTS.PAUSE },
        ])
      );
      expect(r.stop).toEqual({ enabled: true, label: 'Resume' });
      expect(r.up.enabled).toBe(true);
      expect(r.pause.enabled).toBe(false);
      expect(r.down.enabled).toBe(false);
    });
  });

  describe('defensive', () => {
    it('handles missing input', () => {
      const r = buttonStatesFor();
      expect(r.up.enabled).toBe(true);
      expect(r.stop).toEqual({ enabled: false, label: 'Stop' });
    });

    it('treats null events as []', () => {
      const r = buttonStatesFor({ session: null, events: null });
      expect(r.up.enabled).toBe(true);
      expect(r.stop.enabled).toBe(false);
    });
  });
});
