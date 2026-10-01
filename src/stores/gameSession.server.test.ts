import { describe, expect, it } from 'vitest';
import { GAME_SESSION_HEADER, checkGameSession } from '../../supabase/functions/api/gameSession';

const ACTIVE = { game_session_id: 'aaaaaaaa-0000-0000-0000-000000000001' };

describe('checkGameSession', () => {
  it('accepts a request that carries the active character\'s session id', () => {
    expect(checkGameSession('aaaaaaaa-0000-0000-0000-000000000001', ACTIVE)).toBe('ok');
  });

  it('rejects a request with no session header', () => {
    expect(checkGameSession(undefined, ACTIVE)).toBe('missing');
    expect(checkGameSession('', ACTIVE)).toBe('missing');
  });

  it('rejects a request carrying a different (older) session id', () => {
    expect(checkGameSession('bbbbbbbb-0000-0000-0000-000000000002', ACTIVE)).toBe('mismatch');
  });

  it('rejects when the active character has no session at all (never entered through select)', () => {
    expect(checkGameSession('aaaaaaaa-0000-0000-0000-000000000001', { game_session_id: null })).toBe('mismatch');
  });

  it('reports a missing active character separately, even when a header is present', () => {
    expect(checkGameSession('aaaaaaaa-0000-0000-0000-000000000001', null)).toBe('no_active_character');
    expect(checkGameSession(undefined, undefined)).toBe('no_active_character');
  });

  it('compares exactly: no trimming, no case folding that could let a wrong id through', () => {
    expect(checkGameSession(' aaaaaaaa-0000-0000-0000-000000000001', ACTIVE)).toBe('mismatch');
  });

  it('exposes the header name the client and the CORS allow-list must share', () => {
    expect(GAME_SESSION_HEADER).toBe('x-game-session');
  });
});
