import { create } from 'zustand';
import { listClaimedDiscoveries } from '../api/characters';

const seenKey = (characterId: number) => `rpg.discoveries.seen.${characterId}`;

/** Ids this browser remembers a character having seen (reward-less discoveries live only here). */
export function readSeenIds(characterId: number): string[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(seenKey(characterId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(characterId: number, ids: Iterable<string>): void {
  try {
    localStorage.setItem(seenKey(characterId), JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the in-memory set still works for this page load.
  }
}

// Bumped by every load() and reset(): a load response only applies if nothing newer happened meanwhile.
let requestSeq = 0;

interface DiscoveryState {
  /** Reward discoveries this character already collected (server truth). */
  claimed: Set<string>;
  /** Everything this character has looked at: claimed plus reward-less ones remembered locally. */
  seen: Set<string>;
  loaded: boolean;
  load: (characterId: number) => Promise<void>;
  markSeen: (characterId: number, id: string) => void;
  markClaimed: (id: string) => void;
  reset: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  claimed: new Set(),
  seen: new Set(),
  loaded: false,
  load: async (characterId) => {
    const mySeq = ++requestSeq;
    let claimed: string[] = [];
    try {
      claimed = (await listClaimedDiscoveries()).claimed;
    } catch {
      // Offline or an old server: nothing known to be claimed; the server still guards every claim.
    }
    if (mySeq !== requestSeq) return; // reset() or a newer load() happened while this was in flight
    set({ claimed: new Set(claimed), seen: new Set([...readSeenIds(characterId), ...claimed]), loaded: true });
  },
  markSeen: (characterId, id) => {
    const seen = new Set(get().seen).add(id);
    writeSeen(characterId, seen);
    set({ seen });
  },
  markClaimed: (id) => set((s) => ({ claimed: new Set(s.claimed).add(id), seen: new Set(s.seen).add(id) })),
  reset: () => {
    requestSeq++;
    set({ claimed: new Set(), seen: new Set(), loaded: false });
  },
}));
