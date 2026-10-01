import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSessionStore } from './gameSessionStore';

describe('useGameSessionStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useGameSessionStore.getState().reset();
  });

  it('keeps the session id in memory and in sessionStorage, and clears both on reset', () => {
    useGameSessionStore.getState().setSessionId('abc');
    expect(useGameSessionStore.getState().sessionId).toBe('abc');
    expect(sessionStorage.getItem('rpg.game-session')).toBe('abc');
    useGameSessionStore.getState().reset();
    expect(useGameSessionStore.getState().sessionId).toBeNull();
    expect(sessionStorage.getItem('rpg.game-session')).toBeNull();
  });

  it('marks the session replaced exactly once and stays replaced until reset', () => {
    useGameSessionStore.getState().markReplaced();
    useGameSessionStore.getState().markReplaced();
    expect(useGameSessionStore.getState().replaced).toBe(true);
    useGameSessionStore.getState().reset();
    expect(useGameSessionStore.getState().replaced).toBe(false);
  });

  it('still works in memory when sessionStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => useGameSessionStore.getState().setSessionId('xyz')).not.toThrow();
    expect(useGameSessionStore.getState().sessionId).toBe('xyz');
    spy.mockRestore();
  });
});
