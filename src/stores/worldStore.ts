import { create } from 'zustand';
import { playerPosition } from '../components/game/playerTransform';
import { clearMoveTarget } from '../components/game/moveTarget';
import { activeColliders, rockColliders, DUNGEON_ENTRANCES, type DungeonId } from '../components/game/worldColliders';
import { villageColliders } from '../components/game/Village';
import { getDungeonColliders, buildFloorMonsters, getEntrySpawn, getExitSpawn, DUNGEON_META } from '../components/game/Dungeon';
import { useCombatStore } from './combatStore';
import { useLootStore } from './lootStore';
import type { MonsterInstanceSummary } from '../types/api';

export type AreaId = 'field' | 'dungeon';
export type { DungeonId };

// Where the player lands back in the field after leaving a dungeon — a few units further out
// from that dungeon's own cave mouth than the entrance trigger itself, so stepping out
// doesn't immediately re-trigger walking back in.
function fieldReturnPoint(dungeonId: DungeonId): [number, number] {
  const { point } = DUNGEON_ENTRANCES[dungeonId];
  return [point[0], point[1] + 4];
}

// Only the floor's captain/lord aggros on sight — the regular goblins are passive like field
// monsters (retaliate once actually hit). All five spawn within a few units of each other and
// of the player's floor-entry point, so making every one of them aggressive meant walking in
// instantly pulled the whole room at once; this way the player can approach individual
// grunts without triggering a full-room swarm, while the elite is still a real threat to
// engage carelessly.
function isDungeonEscortAggressive(monster: MonsterInstanceSummary): boolean {
  return monster.name.includes('대장') || monster.name.includes('군주');
}

// spawnSide is which doorway the player just walked through to get here: 'south' for
// entering from the field or descending from a shallower floor (both arrive fresh at this
// floor's own entry door), 'north' for ascending from a deeper floor (arrives back at this
// floor's own exit door — the top of the same staircase they went down earlier).
function enterFloor(dungeonId: DungeonId, floor: number, spawnSide: 'south' | 'north') {
  clearMoveTarget();
  const maxFloor = DUNGEON_META[dungeonId].maxFloor;
  activeColliders.list = getDungeonColliders(floor, maxFloor);
  useCombatStore.getState().loadMonsters(buildFloorMonsters(dungeonId, floor), isDungeonEscortAggressive);
  // A drop left behind on the field (or a different floor/dungeon) has nothing to do with
  // this floor's own space — same "swap, don't carry over" reasoning as loadMonsters above.
  useLootStore.getState().clear();
  const spawn = spawnSide === 'south' ? getEntrySpawn(floor) : getExitSpawn(floor);
  playerPosition.set(spawn[0], 0, spawn[1]);
}

interface WorldState {
  currentArea: AreaId;
  currentDungeonId: DungeonId | null;
  dungeonFloor: number;
  enterDungeon: (dungeonId: DungeonId) => void;
  descendFloor: () => void;
  ascendFloor: () => void;
  exitDungeon: (fieldMonsters: MonsterInstanceSummary[]) => void;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  currentArea: 'field',
  currentDungeonId: null,
  dungeonFloor: 1,

  enterDungeon: (dungeonId) => {
    enterFloor(dungeonId, 1, 'south');
    set({ currentArea: 'dungeon', currentDungeonId: dungeonId, dungeonFloor: 1 });
  },

  descendFloor: () => {
    const dungeonId = get().currentDungeonId;
    if (!dungeonId) return;
    const floor = get().dungeonFloor + 1;
    enterFloor(dungeonId, floor, 'south');
    set({ dungeonFloor: floor });
  },

  ascendFloor: () => {
    const dungeonId = get().currentDungeonId;
    if (!dungeonId) return;
    const floor = Math.max(1, get().dungeonFloor - 1);
    enterFloor(dungeonId, floor, 'north');
    set({ dungeonFloor: floor });
  },

  // fieldMonsters re-seeds the field's roster fresh (see combatStore's loadMonsters) rather
  // than restoring exactly what was mid-fight when the player left — a deliberate
  // simplification given the field only ever has a couple of placeholder monsters right now.
  exitDungeon: (fieldMonsters) => {
    const dungeonId = get().currentDungeonId;
    clearMoveTarget();
    activeColliders.list = [...rockColliders, ...villageColliders];
    useCombatStore.getState().loadMonsters(fieldMonsters, false);
    useLootStore.getState().clear();
    const [x, z] = dungeonId ? fieldReturnPoint(dungeonId) : fieldReturnPoint('ruined_catacombs');
    playerPosition.set(x, 0, z);
    set({ currentArea: 'field', currentDungeonId: null, dungeonFloor: 1 });
  },
}));
