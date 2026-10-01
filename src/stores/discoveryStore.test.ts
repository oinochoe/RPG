import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  listClaimedDiscoveries: vi.fn(),
}));

import * as api from '../api/characters';
import { useDiscoveryStore } from './discoveryStore';

describe('useDiscoveryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscoveryStore.getState().reset();
    vi.mocked(api.listClaimedDiscoveries).mockReset();
  });

  it('loads the server-claimed ids and treats them as seen', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockResolvedValue({ claimed: ['a', 'b'] });
    await useDiscoveryStore.getState().load(7);
    const s = useDiscoveryStore.getState();
    expect(s.loaded).toBe(true);
    expect([...s.claimed].sort()).toEqual(['a', 'b']);
    expect(s.seen.has('a')).toBe(true);
  });

  it('remembers merely-seen (reward-less) discoveries per character in localStorage', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockResolvedValue({ claimed: [] });
    await useDiscoveryStore.getState().load(7);
    useDiscoveryStore.getState().markSeen(7, 'funny-sign');
    expect(useDiscoveryStore.getState().seen.has('funny-sign')).toBe(true);
    useDiscoveryStore.getState().reset();
    await useDiscoveryStore.getState().load(7); // same character remembers
    expect(useDiscoveryStore.getState().seen.has('funny-sign')).toBe(true);
    useDiscoveryStore.getState().reset();
    await useDiscoveryStore.getState().load(8); // another character does not
    expect(useDiscoveryStore.getState().seen.has('funny-sign')).toBe(false);
  });

  it('still loads when the server call fails (offline is fine: nothing claimed)', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockRejectedValue(new Error('network'));
    await expect(useDiscoveryStore.getState().load(7)).resolves.toBeUndefined();
    expect(useDiscoveryStore.getState().loaded).toBe(true);
  });

  it('survives localStorage throwing', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockResolvedValue({ claimed: [] });
    await useDiscoveryStore.getState().load(7);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => useDiscoveryStore.getState().markSeen(7, 'x')).not.toThrow();
    expect(useDiscoveryStore.getState().seen.has('x')).toBe(true);
    spy.mockRestore();
  });

  it('markClaimed adds to both claimed and seen', () => {
    useDiscoveryStore.getState().markClaimed('z');
    const s = useDiscoveryStore.getState();
    expect(s.claimed.has('z') && s.seen.has('z')).toBe(true);
  });
});
