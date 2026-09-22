import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import { useCombatStore } from './combatStore';
import { useUIStore } from './uiStore';
import { useWorldStore } from './worldStore';
import { playSound } from '../lib/sound';
import { playerPosition, playerStuck } from '../components/game/playerTransform';
import { clearMoveTarget } from '../components/game/moveTarget';
import {
  FIELD_EXTENT,
  VILLAGES,
  PLAYER_COLLISION_RADIUS,
  activeColliders,
  inVillageClearZone,
  inRiverZone,
  inDesertZone,
  inCaveClearZone,
} from '../components/game/worldColliders';
import { getFloorRooms, getDungeonColliders, getEntrySpawn } from '../components/game/Dungeon';
import { buildFieldMonsters } from '../components/game/FieldMonsters';
import type { CharacterClass, CharacterProfile, CharacterSummary, InventorySlot, ShopItem } from '../types/api';

// Shared by useHotbarSlot's teleport_target handling below — 'village' works from anywhere
// (leaves the dungeon first if needed, same as walking out through its exit would, so
// playerPosition reflects a real field position before picking the nearest village).
function nearestVillage(x: number, z: number) {
  return VILLAGES.reduce((closest, zone) => {
    const dist = Math.hypot(x - zone.center[0], z - zone.center[1]);
    return dist < closest.dist ? { zone, dist } : closest;
  }, { zone: VILLAGES[0], dist: Infinity }).zone;
}

const BLINK_ATTEMPTS = 60;
// Keeps the blink away from the field's very edge/center clutter, same margin style as
// scatterDecorations' own CLEAR_RADIUS.
const FIELD_BLINK_MARGIN = 6;

function collidesAt(x: number, z: number, colliders: { x: number; z: number; radius: number }[]): boolean {
  return colliders.some((c) => {
    const dx = x - c.x;
    const dz = z - c.z;
    const minDist = c.radius + PLAYER_COLLISION_RADIUS;
    return dx * dx + dz * dz < minDist * minDist;
  });
}

// A "순간이동 주문서" blink used to warp the player from the field to the dungeon entrance,
// crossing area types — this instead teleports to a random reachable spot within whichever
// area the player is already in: the field stays in the field, a dungeon floor stays on that
// same floor. Rejection-sampled against that area's real colliders (bounded attempts, same
// pattern FieldMonsters.ts uses) so it can't strand the player inside a wall/rock/river.
function randomBlinkPoint(): [number, number] {
  const world = useWorldStore.getState();
  if (world.currentArea === 'dungeon') {
    // Picks one of this floor's rooms (not the connecting corridors — a narrow hallway isn't
    // a great place to land) and rejection-samples a point inside it.
    const { all: roomList } = getFloorRooms(world.dungeonFloor);
    const colliders = getDungeonColliders(world.dungeonFloor);
    const margin = 1.5;
    for (let i = 0; i < BLINK_ATTEMPTS; i++) {
      const room = roomList[Math.floor(Math.random() * roomList.length)];
      const x = room.x1 + margin + Math.random() * (room.x2 - room.x1 - margin * 2);
      const z = room.z1 + margin + Math.random() * (room.z2 - room.z1 - margin * 2);
      if (!collidesAt(x, z, colliders)) return [x, z];
    }
    return getEntrySpawn(world.dungeonFloor);
  }

  const half = FIELD_EXTENT / 2 - FIELD_BLINK_MARGIN;
  for (let i = 0; i < BLINK_ATTEMPTS; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (inVillageClearZone(x, z) || inCaveClearZone(x, z) || inRiverZone(x, z) || inDesertZone(x)) continue;
    if (collidesAt(x, z, activeColliders.list)) continue;
    return [x, z];
  }
  return [playerPosition.x, playerPosition.z];
}

function teleportTo(target: 'village' | 'blink') {
  const world = useWorldStore.getState();
  if (target === 'village') {
    if (world.currentArea === 'dungeon') {
      world.exitDungeon(buildFieldMonsters());
    }
    const village = nearestVillage(playerPosition.x, playerPosition.z);
    playerPosition.set(village.center[0], 0, village.center[1]);
  } else {
    const [x, z] = randomBlinkPoint();
    playerPosition.set(x, 0, z);
  }
  clearMoveTarget();
}

function sumEquippedBonus(items: InventorySlot[]): { attack: number; defense: number } {
  let attack = 0;
  let defense = 0;
  for (const item of items) {
    if (!item.is_equipped) continue;
    attack += item.attack_bonus;
    defense += item.defense_bonus;
  }
  return { attack, defense };
}

export const HOTBAR_SIZE = 6;

// A slot holds either a consumable (resolved against inventory at use-time by
// item_template_id, same as before) or the player's one class skill (no id needed — there's
// only ever one). Kept as a tagged union rather than reusing `number | null` with a sentinel,
// since a slot's behavior on press (consume an item vs. cast a skill) is genuinely different,
// not just a different id space.
export type HotbarAssignment = { kind: 'item'; itemTemplateId: number } | { kind: 'skill' };

interface CharacterState {
  characters: CharacterSummary[];
  activeCharacter: CharacterProfile | null;
  inventory: InventorySlot[];
  shop: ShopItem[];
  // Session-local only (not server-persisted, per design decision) — item_template_id per
  // slot, resolved against the current inventory at use-time so a slot survives a potion
  // stack running out and being rebought (a fresh inventory row gets a new row id, but the
  // same item_template_id).
  hotbar: (HotbarAssignment | null)[];
  // Slots currently mid-request — guards against a double-click (or any two overlapping
  // useHotbarSlot calls for the same slot) both reading the same pre-request inventory
  // snapshot and each independently deciding the item is available, which used to consume
  // two units of a stack from a single logical use.
  hotbarPending: boolean[];
  isLoading: boolean;
  fetchCharacters: () => Promise<void>;
  createCharacter: (name: string, characterClass: CharacterClass) => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
  fetchInventory: () => Promise<void>;
  equipItem: (inventoryId: number) => Promise<void>;
  unequipItem: (inventoryId: number) => Promise<void>;
  fetchShop: (kind: 'merchant' | 'blacksmith') => Promise<void>;
  buyItem: (itemTemplateId: number, price: number) => Promise<void>;
  sellItem: (inventoryId: number, price: number) => Promise<void>;
  setHotbarSlot: (slot: number, assignment: HotbarAssignment | null) => void;
  useHotbarSlot: (slot: number) => Promise<void>;
  // Free (no item/cooldown) escape hatch for getting wedged in world geometry — same
  // guaranteed-safe destination as the 마을 귀환 주문서 item's teleportTo('village'), just
  // triggerable directly (see SystemMenu's button) instead of needing one in inventory. Gated
  // by playerStuck (see CharacterMesh's stuck-detection heuristic) rather than always
  // available, since a free unconditional village return would just duplicate that item.
  unstuck: () => void;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  activeCharacter: null,
  inventory: [],
  shop: [],
  hotbar: Array(HOTBAR_SIZE).fill(null),
  hotbarPending: Array(HOTBAR_SIZE).fill(false),
  isLoading: false,

  fetchCharacters: async () => {
    set({ isLoading: true });
    const page = await charactersApi.listCharacters();
    set({ characters: page.items, isLoading: false });
  },

  createCharacter: async (name, characterClass) => {
    await charactersApi.createCharacter(name, characterClass);
    await get().fetchCharacters();
  },

  selectCharacter: async (characterId) => {
    await charactersApi.selectCharacter(characterId);
    const profile = await charactersApi.getActiveCharacterProfile();
    set({ activeCharacter: profile, inventory: profile.inventory, hotbar: Array(HOTBAR_SIZE).fill(null) });
    // Whatever panel (F1 menu, inventory, ...) was left open from a previous character's
    // session — or from clicking "캐릭터 선택" while one was open — shouldn't carry over into
    // the new one, since uiStore isn't reset by the route change itself.
    useUIStore.getState().closeAll();
  },

  deleteCharacter: async (characterId) => {
    await charactersApi.deleteCharacter(characterId);
    await get().fetchCharacters();
  },

  fetchInventory: async () => {
    const { items } = await charactersApi.getInventory();
    set({ inventory: items });
  },

  equipItem: async (inventoryId) => {
    const before = sumEquippedBonus(get().inventory);
    const { items } = await charactersApi.equipItem(inventoryId);
    const after = sumEquippedBonus(items);
    set({ inventory: items });
    useCombatStore.getState().applyEquipmentDelta(after.attack - before.attack, after.defense - before.defense);
  },

  unequipItem: async (inventoryId) => {
    const before = sumEquippedBonus(get().inventory);
    const { items } = await charactersApi.unequipItem(inventoryId);
    const after = sumEquippedBonus(items);
    set({ inventory: items });
    useCombatStore.getState().applyEquipmentDelta(after.attack - before.attack, after.defense - before.defense);
  },

  fetchShop: async (kind) => {
    const { items } = await charactersApi.getShop(kind);
    set({ shop: items });
  },

  // price is passed in by the caller (already known from the ShopItem/InventorySlot the
  // button was rendered from) rather than looked up here — the server doesn't touch gold
  // at all (see characters.ts's shop routes), so this is purely a local wallet update.
  buyItem: async (itemTemplateId, price) => {
    const { items } = await charactersApi.buyItem(itemTemplateId);
    set({ inventory: items });
    useCombatStore.getState().adjustGold(-price);
  },

  sellItem: async (inventoryId, price) => {
    const before = sumEquippedBonus(get().inventory);
    const { items } = await charactersApi.sellItem(inventoryId);
    const after = sumEquippedBonus(items);
    set({ inventory: items });
    useCombatStore.getState().applyEquipmentDelta(after.attack - before.attack, after.defense - before.defense);
    useCombatStore.getState().adjustGold(price);
  },

  setHotbarSlot: (slot, assignment) => {
    set((s) => {
      const hotbar = [...s.hotbar];
      // A given assignment only ever lives in one slot at a time — assigning it to a new
      // slot clears any other slot that already held the same thing. Without this, the same
      // consumable (or the one skill) could end up in two slots at once (e.g. clicking two
      // different "등록" buttons for it), and since InventoryPanel/SkillTab's assignedSlot
      // lookup is a findIndex (first match only), only one of the two buttons would ever show
      // as active even though both slots actually held it.
      if (assignment !== null) {
        for (let i = 0; i < hotbar.length; i++) {
          const existing = hotbar[i];
          if (!existing) continue;
          const sameItem = assignment.kind === 'item' && existing.kind === 'item' && existing.itemTemplateId === assignment.itemTemplateId;
          const sameSkill = assignment.kind === 'skill' && existing.kind === 'skill';
          if (sameItem || sameSkill) hotbar[i] = null;
        }
      }
      hotbar[slot] = assignment;
      return { hotbar };
    });
  },

  useHotbarSlot: async (slot) => {
    if (get().hotbarPending[slot]) return;
    const assignment = get().hotbar[slot];
    if (assignment === null || assignment.kind !== 'item') return;
    const itemTemplateId = assignment.itemTemplateId;
    const row = get().inventory.find((item) => item.item_template_id === itemTemplateId && item.quantity > 0);
    if (!row) return;

    set((s) => {
      const hotbarPending = [...s.hotbarPending];
      hotbarPending[slot] = true;
      return { hotbarPending };
    });
    try {
      const { items } = await charactersApi.useItem(row.id);
      set({ inventory: items });
      useCombatStore.getState().heal(row.heal_hp);
      useCombatStore.getState().restoreMp(row.restore_mp);
      if (row.teleport_target) {
        teleportTo(row.teleport_target);
        playSound('cast', 0.5);
      } else {
        playSound('potion', 0.5);
      }
    } finally {
      set((s) => {
        const hotbarPending = [...s.hotbarPending];
        hotbarPending[slot] = false;
        return { hotbarPending };
      });
    }
  },

  unstuck: () => {
    if (!playerStuck.value) return;
    teleportTo('village');
    playerStuck.value = false;
    playSound('cast', 0.5);
  },
}));
