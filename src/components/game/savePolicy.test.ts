import { describe, expect, it } from 'vitest';
import { shouldSavePosition } from './savePolicy';

describe('shouldSavePosition', () => {
  it('saves for a live session', () => {
    expect(shouldSavePosition({ replaced: false, sessionId: 'abc' })).toBe(true);
  });
  it('does not save once the session was replaced (the server would refuse it anyway)', () => {
    expect(shouldSavePosition({ replaced: true, sessionId: 'abc' })).toBe(false);
  });
  it('still saves without a session id (new frontend on the old function)', () => {
    expect(shouldSavePosition({ replaced: false, sessionId: null })).toBe(true);
  });
});
