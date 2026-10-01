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

describe('useDiscoveryStore stale loads', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscoveryStore.getState().reset();
    vi.mocked(api.listClaimedDiscoveries).mockReset();
  });

  it('ignores a load that finishes after reset()', async () => {
    let resolve!: (v: { claimed: string[] }) => void;
    vi.mocked(api.listClaimedDiscoveries).mockReturnValue(new Promise((r) => (resolve = r)));
    const p = useDiscoveryStore.getState().load(7);
    useDiscoveryStore.getState().reset();
    resolve({ claimed: ['a'] });
    await p;
    const s = useDiscoveryStore.getState();
    expect(s.loaded).toBe(false);
    expect(s.claimed.size).toBe(0);
  });

  it('lets a newer load supersede an older one still in flight', async () => {
    let resolveOld!: (v: { claimed: string[] }) => void;
    vi.mocked(api.listClaimedDiscoveries)
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce({ claimed: ['new'] });
    const oldLoad = useDiscoveryStore.getState().load(7);
    await useDiscoveryStore.getState().load(8);
    resolveOld({ claimed: ['old'] });
    await oldLoad;
    const s = useDiscoveryStore.getState();
    expect([...s.claimed]).toEqual(['new']);
    expect(s.seen.has('old')).toBe(false);
  });
});
