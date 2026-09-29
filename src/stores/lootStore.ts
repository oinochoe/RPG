import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import { useCharacterStore } from './characterStore';
import { playSound } from '../lib/sound';
import { ApiError } from '../types/api';

export type DropItemType = 'weapon' | 'armor' | 'consumable' | 'scroll' | 'misc';

// Drops are decided by the SERVER now: when it validates a kill report it rolls the drop table
// (supabase/functions/api/drops.ts) and hands back a single-use ticket. The client only draws what
// it was given at the monster's death position and later presents the ticket to pick it up.
export interface WorldDrop {
  id: number;
  // The server's ticket (pending_drops.id) — what pickupDrop sends to actually claim the item.
  serverDropId: string;
  itemTemplateId: number;
  itemName: string;
  itemType: DropItemType;
  position: [number, number, number];
  spawnedAt: number;
}

// A dense field/dungeon fight shouldn't let drops pile up forever — oldest gets evicted once
// over this, same "cap it and stop worrying" choice as MAX_DROPS-shaped limits elsewhere in
// this project (e.g. FIELD_MONSTER_COUNT).
const MAX_DROPS = 24;
// Despawns an unpicked-up drop after 90s — see ItemDropMesh's own useFrame check, which is
// what actually calls removeDrop; this constant just needs to be shared so both sides agree.
export const DROP_TTL_MS = 90_000;

interface LootState {
  drops: WorldDrop[];
  nextId: number;
  /** Draws a drop the server issued (see killReporter) at the given world position. */
  spawnDrop: (drop: {
    serverDropId: string;
    itemTemplateId: number;
    itemName: string;
    itemType: DropItemType;
    position: [number, number, number];
  }) => void;
  /** Called on a successful pickup (see CharacterMesh's F4 handler) or by ItemDropMesh once
   * a drop's TTL expires. */
  removeDrop: (dropId: number) => void;
  /** Called on every area transition (see worldStore's enterFloor/exitDungeon) so a drop
   * from the field doesn't linger into a dungeon floor's scene, or vice versa. */
  clear: () => void;
}

export const useLootStore = create<LootState>((set, get) => ({
  drops: [],
  nextId: 1,

  spawnDrop: ({ serverDropId, itemTemplateId, itemName, itemType, position }) => {
    const { nextId, drops } = get();
    const drop: WorldDrop = {
      id: nextId,
      serverDropId,
      itemTemplateId,
      itemName,
      itemType,
      // Small random offset so a drop never sits exactly on the monster's own respawn point.
      position: [position[0] + (Math.random() - 0.5) * 0.6, position[1], position[2] + (Math.random() - 0.5) * 0.6],
      spawnedAt: performance.now(),
    };
    const next = [...drops, drop];
    if (next.length > MAX_DROPS) next.shift();
    set({ drops: next, nextId: nextId + 1 });
  },

  removeDrop: (dropId) => set((s) => ({ drops: s.drops.filter((d) => d.id !== dropId) })),

  clear: () => set({ drops: [] }),
}));

// How close the player has to be to pick up a drop directly (F5, or clicking one already in
// range) — shared with LootProximity.tsx's own scan and ItemDropMesh's click handler so both
// agree on the same range.
export const PICKUP_RADIUS = 1.8;

// Shared by CharacterMesh's F5 handler and ItemDropMesh's click handler (via the walk-then-
// pickup path) so there's exactly one place that does the actual grant — server call, then
// only remove-from-world/update-inventory/play-sound once that's confirmed, so a failed
// request leaves the drop in place instead of silently losing the item (same trust boundary
// as this project's other client-authoritative economy calls; see the server route comment).
export async function pickupDrop(dropId: number): Promise<boolean> {
  const drop = useLootStore.getState().drops.find((d) => d.id === dropId);
  if (!drop) return false;
  try {
    const { items } = await charactersApi.lootItem(drop.serverDropId);
    useLootStore.getState().removeDrop(dropId);
    useCharacterStore.getState().receiveInventory(items);
    playSound('pickup', 0.5);
    return true;
  } catch (err) {
    // The ticket is gone for good (already claimed, or expired server-side) — stop showing it.
    if (err instanceof ApiError && err.reason === 'drop_not_found') useLootStore.getState().removeDrop(dropId);
    return false;
  }
}
