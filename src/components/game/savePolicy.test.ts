import { describe, expect, it } from 'vitest';
import { shouldSavePosition } from './savePolicy';

describe('shouldSavePosition', () => {
  it('saves for a live session', () => {
    expect(shouldSavePosition({ replaced: false, sessionId: 'abc' })).toBe(true);
  });
  it('does not save once the session was replaced (the server would refuse it anyway)', () => {
    expect(shouldSavePosition({ replaced: true, sessionId: 'abc' })).toBe(false);
  });
  it('does not save without a session id (never entered through select)', () => {
    expect(shouldSavePosition({ replaced: false, sessionId: null })).toBe(false);
  });
});
