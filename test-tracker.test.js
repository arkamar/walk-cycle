import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STATES, EVENTS, nextState, allowedEvents, stateFromEvents } from '../src/stateMachine.js';

describe('State Machine', () => {
  describe('nextState', () => {
    it('idle + up -> going_up', () => {
      expect(nextState(STATES.IDLE, EVENTS.UP)).toBe(STATES.GOING_UP);
    });

    it('going_up + pause -> at_top', () => {
      expect(nextState(STATES.GOING_UP, EVENTS.PAUSE)).toBe(STATES.AT_TOP);
    });

    it('at_top + down -> going_down', () => {
      expect(nextState(STATES.AT_TOP, EVENTS.DOWN)).toBe(STATES.GOING_DOWN);
    });

    it('going_down + pause -> at_bottom', () => {
      expect(nextState(STATES.GOING_DOWN, EVENTS.PAUSE)).toBe(STATES.AT_BOTTOM);
    });

    it('at_bottom + up -> going_up', () => {
      expect(nextState(STATES.AT_BOTTOM, EVENTS.UP)).toBe(STATES.GOING_UP);
    });

    it('invalid transitions return null', () => {
      expect(nextState(STATES.IDLE, EVENTS.PAUSE)).toBeNull();
      expect(nextState(STATES.IDLE, EVENTS.DOWN)).toBeNull();
      expect(nextState(STATES.GOING_UP, EVENTS.UP)).toBeNull();
      expect(nextState(STATES.GOING_UP, EVENTS.DOWN)).toBeNull();
    });
  });

  describe('allowedEvents', () => {
    it('idle allows up', () => {
      expect(allowedEvents(STATES.IDLE)).toContain(EVENTS.UP);
    });

    it('going_up allows pause and down (direct)', () => {
      const allowed = allowedEvents(STATES.GOING_UP);
      expect(allowed).toContain(EVENTS.PAUSE);
      expect(allowed).toContain(EVENTS.DOWN);
    });

    it('at_top allows down', () => {
      expect(allowedEvents(STATES.AT_TOP)).toContain(EVENTS.DOWN);
    });

    it('going_down allows pause and up (direct)', () => {
      const allowed = allowedEvents(STATES.GOING_DOWN);
      expect(allowed).toContain(EVENTS.PAUSE);
      expect(allowed).toContain(EVENTS.UP);
    });

    it('at_bottom allows up', () => {
      expect(allowedEvents(STATES.AT_BOTTOM)).toContain(EVENTS.UP);
    });
  });

  describe('stateFromEvents', () => {
    it('empty events -> idle', () => {
      expect(stateFromEvents([])).toBe(STATES.IDLE);
    });

    it('up -> going_up', () => {
      expect(stateFromEvents([{ type: EVENTS.UP, ts: 1000 }])).toBe(STATES.GOING_UP);
    });

    it('up,pause -> at_top', () => {
      expect(stateFromEvents([
        { type: EVENTS.UP, ts: 1000 },
        { type: EVENTS.PAUSE, ts: 2000 }
      ])).toBe(STATES.AT_TOP);
    });

    it('up,pause,down -> going_down', () => {
      expect(stateFromEvents([
        { type: EVENTS.UP, ts: 1000 },
        { type: EVENTS.PAUSE, ts: 2000 },
        { type: EVENTS.DOWN, ts: 3000 }
      ])).toBe(STATES.GOING_DOWN);
    });

    it('up,pause,down,pause -> at_bottom', () => {
      expect(stateFromEvents([
        { type: EVENTS.UP, ts: 1000 },
        { type: EVENTS.PAUSE, ts: 2000 },
        { type: EVENTS.DOWN, ts: 3000 },
        { type: EVENTS.PAUSE, ts: 4000 }
      ])).toBe(STATES.AT_BOTTOM);
    });
  });
});

describe('Tracker Button Logic', () => {
  describe('getButtonStates - no session', () => {
    it('should allow up button', () => {
      const session = null;
      const state = STATES.IDLE;
      const hasExistingEvents = false;
      
      const allowed = getAllowedButtons(session, state, hasExistingEvents);
      
      expect(allowed).toContain('up');
      expect(allowed).not.toContain('pause');
      expect(allowed).not.toContain('down');
    });
  });

  describe('getButtonStates - active session with paused session also existing', () => {
    it('should prefer active session', () => {
      const session = { id: 1, pausedAt: null }; // active
      const state = STATES.GOING_UP;
      const hasExistingEvents = true;
      
      const allowed = getAllowedButtons(session, state, hasExistingEvents);
      
      // Should use active session's allowed events
      expect(allowed).toContain('pause');
      expect(allowed).toContain('down');
    });
  });

  describe('getButtonStates - paused session', () => {
    it('should show resume button', () => {
      const session = { id: 1, pausedAt: Date.now() }; // paused
      const state = STATES.AT_TOP;
      const hasExistingEvents = true;
      
      const stopButtonState = getStopButtonState(session);
      
      expect(stopButtonState.label).toBe('Resume');
      expect(stopButtonState.disabled).toBe(false);
    });
  });

  describe('getButtonStates - no active/paused session but events exist', () => {
    it('should show stopped button as enabled to resume', () => {
      const session = null;
      const state = STATES.AT_TOP;
      const hasExistingEvents = true;
      
      const stopButtonState = getStopButtonState(null);
      
      // When there's no current session but there's a paused session
      // the stop button should show Resume
      expect(stopButtonState.label).toBe('Resume');
    });
  });

  function getAllowedButtons(session, state, hasEvents) {
    if (!session && hasEvents) {
      // When paused, allow continuing
      if (state === STATES.AT_TOP) return ['down'];
      if (state === STATES.AT_BOTTOM) return ['up'];
      return [];
    }
    if (!session && !hasEvents) return ['up'];
    
    const allowed = [...allowedEvents(state)];
    // Add direct transitions
    if (state === STATES.AT_TOP) allowed.push('down');
    if (state === STATES.AT_BOTTOM) allowed.push('up');
    return allowed;
  }

  function getStopButtonState(session) {
    if (session && session.pausedAt) {
      return { label: 'Resume', disabled: false };
    }
    if (session && !session.pausedAt) {
      return { label: 'Pause', disabled: false };
    }
    return { label: 'Stop', disabled: true };
  }
});