import { describe, expect, it } from 'vitest';
import { shouldFetchActiveProfile } from './bootstrapPolicy';

describe('shouldFetchActiveProfile', () => {
  it('fetches only when this tab holds a game session id', () => {
    expect(shouldFetchActiveProfile('abc')).toBe(true);
    expect(shouldFetchActiveProfile(null)).toBe(false);
  });
});
