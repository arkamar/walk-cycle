import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveSession,
  getLatestEndedSession,
  getCurrentSession,
  getStoppedSession,
  createSession,
  endSession,
  stopSession,
  resumeSession,
  setCurrentSession,
  listSessions,
} from './db.js';

describe('db session queries', () => {
  beforeEach(async () => {
    const { clearAll } = await import('./db.js');
    await clearAll();
  });

  describe('getActiveSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getActiveSession()).toBeNull();
    });

    it('returns session with neither endedAt nor stoppedAt', async () => {
      const id = await createSession(Date.now(), 'active');
      const session = await getActiveSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.endedAt).toBeNull();
      expect(session.stoppedAt).toBeNull();
    });

    it('returns null when only ended sessions exist', async () => {
      const id = await createSession(Date.now(), 'ended');
      await endSession(id);
      expect(await getActiveSession()).toBeNull();
    });

    it('returns null when only stopped sessions exist', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      expect(await getActiveSession()).toBeNull();
    });

    it('returns the latest active session', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      await createSession(Date.now(), 'second');
      await endSession(id1);
      const active = await getActiveSession();
      expect(active.note).toBe('second');
    });
  });

  describe('getLatestEndedSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getLatestEndedSession()).toBeNull();
    });

    it('returns null when no ended sessions exist', async () => {
      await createSession(Date.now(), 'active');
      expect(await getLatestEndedSession()).toBeNull();
    });

    it('returns the latest ended session', async () => {
      const id1 = await createSession(Date.now() - 2000, 'first');
      const id2 = await createSession(Date.now() - 1000, 'second');
      await endSession(id1);
      await endSession(id2);
      const latest = await getLatestEndedSession();
      expect(latest.note).toBe('second');
    });
  });

  describe('getCurrentSession', () => {
    it('returns null when all sessions are ended', async () => {
      const id = await createSession(Date.now(), 'ended');
      await endSession(id);
      expect(await getCurrentSession()).toBeNull();
    });

    it('returns session with endedAt null (including stopped)', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      const session = await getCurrentSession();
      expect(session).not.toBeNull();
      expect(session.id).toBe(id);
      expect(session.stoppedAt).not.toBeNull();
    });

    it('prefers active over stopped when both exist', async () => {
      const stoppedId = await createSession(Date.now() - 1000, 'stopped');
      await stopSession(stoppedId);
      await createSession(Date.now(), 'active');
      const current = await getCurrentSession();
      expect(current.note).toBe('active');
    });
  });

  describe('getStoppedSession', () => {
    it('returns null when no sessions exist', async () => {
      expect(await getStoppedSession()).toBeNull();
    });

    it('returns null when only active sessions exist', async () => {
      await createSession(Date.now(), 'active');
      expect(await getStoppedSession()).toBeNull();
    });

    it('returns null when only ended sessions exist', async () => {
      const id = await createSession(Date.now(), 'ended');
      await endSession(id);
      expect(await getStoppedSession()).toBeNull();
    });

    it('returns the stopped session that is not ended', async () => {
      const id = await createSession(Date.now(), 'stopped');
      await stopSession(id);
      const stopped = await getStoppedSession();
      expect(stopped).not.toBeNull();
      expect(stopped.id).toBe(id);
      expect(stopped.endedAt).toBeNull();
      expect(stopped.stoppedAt).not.toBeNull();
    });
  });

  describe('setCurrentSession', () => {
    it('makes target the active session', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      const id2 = await createSession(Date.now(), 'second');
      await stopSession(id1);

      await setCurrentSession(id2);

      const current = await getActiveSession();
      expect(current.id).toBe(id2);
      expect(current.stoppedAt).toBeNull();
      expect(current.endedAt).toBeNull();
    });

    it('stops any other active session', async () => {
      const id1 = await createSession(Date.now() - 1000, 'first');
      const id2 = await createSession(Date.now(), 'second');

      await setCurrentSession(id1);

      const s2 = await import('./db.js').then(m => m.getSession(id2));
      expect(s2.stoppedAt).not.toBeNull();
    });

    it('returns null for non-existent session', async () => {
      expect(await setCurrentSession(9999)).toBeNull();
    });
  });
});
