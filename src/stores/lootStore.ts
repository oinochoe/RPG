import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import { useCharacterStore } from './characterStore';
import { playSound } from '../lib/sound';

export type DropItemType = 'weapon' | 'armor' | 'consumable' | 'scroll';

export interface WorldDrop {
  id: number;
  itemTemplateId: number;
  itemName: string;
  itemType: DropItemType;
  position: [number, number, number];
  spawnedAt: number;
}

interface DropTableEntry {
  itemTemplateId: number;
  itemName: string;
  itemType: DropItemType;
  weight: number;
}

// Client-side only, same as combatStore's SKILLS_BY_CLASS/questStore's QUEST_DEFS — the
// monster_drop_templates table exists in the schema but was never populated (nothing reads
// it either), so this is the actual source of truth for what a kill can drop. Keyed by
// monster_template_id (see FieldMonsters.ts/Dungeon.tsx's own comments for that convention:
// 1=슬라임, 2=고블린, 3=스켈레톤, 4=가시선인장, 5=거인 군주, 6=오크, 7=구울, 8=버섯왕). Weights
// are relative, not percentages — rollDropEntry below divides by their sum (plus each table's
// own "nothing" weight) to get real probabilities, so they don't need to add up to 100.
const DROP_TABLE: Record<number, DropTableEntry[]> = {
  1: [
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 45 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 15 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 5 },
  ],
  2: [
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 2, itemName: '가죽 방패', itemType: 'armor', weight: 10 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 8 },
  ],
  3: [
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 25 },
    { itemTemplateId: 15, itemName: '순간이동 주문서', itemType: 'scroll', weight: 10 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 8 },
    { itemTemplateId: 48, itemName: '저주의 강화 주문서', itemType: 'scroll', weight: 3 },
  ],
  4: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 6 },
  ],
  5: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 50 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 14, itemName: '마을 귀환 주문서', itemType: 'scroll', weight: 20 },
    // 거인 군주 — the original dungeon's final boss AND 태고의 거인, the field's own world
    // boss (see FieldMonsters.ts's buildWorldBoss) both use this template, so both get a real
    // chance at the rarest scroll in the game.
    { itemTemplateId: 47, itemName: '축복의 강화 주문서', itemType: 'scroll', weight: 15 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 10 },
  ],
  // 오크 마을's field monster — a real weapon drop (강철 검) alongside the usual potions, since
  // orcs are tougher than anything in the original field short of the dungeon boss.
  6: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 9, itemName: '강철 검', itemType: 'weapon', weight: 8 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 8 },
    { itemTemplateId: 48, itemName: '저주의 강화 주문서', itemType: 'scroll', weight: 4 },
  ],
  // 구울 평원's field monster — the hardest of the 4 new zones, so its table leans toward the
  // upper-tier consumables and a real chance at the teleport scroll.
  7: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 15, itemName: '순간이동 주문서', itemType: 'scroll', weight: 12 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 10 },
    { itemTemplateId: 47, itemName: '축복의 강화 주문서', itemType: 'scroll', weight: 5 },
  ],
  // 요정의 숲's field monster (버섯왕/Mushroom King) — a magic-leaning table (mana potions plus
  // a rare staff) matching the zone's fae/forest theme, even though the monster itself is a
  // mushroom creature rather than a literal fairy.
  8: [
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 10, itemName: '대현자의 지팡이', itemType: 'weapon', weight: 5 },
    { itemTemplateId: 50, itemName: '일반 강화 주문서', itemType: 'scroll', weight: 8 },
  ],
};

// The remaining share of each table's total roll that means "no drop" — e.g. slime's 40
// against its own 60 (45+15) of real entries means a 40% chance of nothing, 45% health
// potion, 15% mana potion. The boss (5) always drops something.
const NOTHING_WEIGHT: Record<number, number> = { 1: 40, 2: 35, 3: 35, 4: 40, 5: 0, 6: 40, 7: 35, 8: 40 };

function rollDropEntry(monsterTemplateId: number): DropTableEntry | null {
  const entries = DROP_TABLE[monsterTemplateId];
  if (!entries) return null;
  const nothingWeight = NOTHING_WEIGHT[monsterTemplateId] ?? 0;
  const totalWeight = nothingWeight + entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  if (roll < nothingWeight) return null;
  roll -= nothingWeight;
  for (const entry of entries) {
    if (roll < entry.weight) return entry;
    roll -= entry.weight;
  }
  return null;
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
  /** No-op if the roll comes up empty — see DROP_TABLE/NOTHING_WEIGHT. Called once per kill
   * (see CharacterMesh's handleAttackResult) with that monster's own death position. */
  rollDrop: (monsterTemplateId: number, position: [number, number, number]) => void;
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

  rollDrop: (monsterTemplateId, position) => {
    const entry = rollDropEntry(monsterTemplateId);
    if (!entry) return;
    const { nextId, drops } = get();
    const drop: WorldDrop = {
      id: nextId,
      itemTemplateId: entry.itemTemplateId,
      itemName: entry.itemName,
      itemType: entry.itemType,
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
    const { items } = await charactersApi.lootItem(drop.itemTemplateId);
    useLootStore.getState().removeDrop(dropId);
    useCharacterStore.getState().receiveInventory(items);
    playSound('pickup', 0.5);
    return true;
  } catch {
    return false;
  }
}
