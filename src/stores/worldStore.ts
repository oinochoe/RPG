import { create } from 'zustand';
import { playerPosition } from '../components/game/playerTransform';
import { clearMoveTarget } from '../components/game/moveTarget';
import { activeColliders, rockColliders, FIELD_ENTRANCE_POINT } from '../components/game/worldColliders';
import { villageColliders } from '../components/game/Village';
import { getDungeonColliders, buildFloorMonsters, getEntrySpawn, getExitSpawn } from '../components/game/Dungeon';
import { useCombatStore } from './combatStore';
import type { MonsterInstanceSummary } from '../types/api';

export type AreaId = 'field' | 'dungeon';

// Where the player lands back in the field after leaving the dungeon — a few units further
// out from the cave mouth than the entrance trigger itself, so stepping out doesn't
// immediately re-trigger walking back in.
const FIELD_RETURN_POINT: [number, number] = [FIELD_ENTRANCE_POINT[0], FIELD_ENTRANCE_POINT[1] + 4];

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
function enterFloor(floor: number, spawnSide: 'south' | 'north') {
  clearMoveTarget();
  activeColliders.list = getDungeonColliders(floor);
  useCombatStore.getState().loadMonsters(buildFloorMonsters(floor), isDungeonEscortAggressive);
  const spawn = spawnSide === 'south' ? getEntrySpawn(floor) : getExitSpawn(floor);
  playerPosition.set(spawn[0], 0, spawn[1]);
}

interface WorldState {
  currentArea: AreaId;
  dungeonFloor: number;
  enterDungeon: () => void;
  descendFloor: () => void;
  ascendFloor: () => void;
  exitDungeon: (fieldMonsters: MonsterInstanceSummary[]) => void;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  currentArea: 'field',
  dungeonFloor: 1,

  enterDungeon: () => {
    enterFloor(1, 'south');
    set({ currentArea: 'dungeon', dungeonFloor: 1 });
  },

  descendFloor: () => {
    const floor = get().dungeonFloor + 1;
    enterFloor(floor, 'south');
    set({ dungeonFloor: floor });
  },

  ascendFloor: () => {
    const floor = Math.max(1, get().dungeonFloor - 1);
    enterFloor(floor, 'north');
    set({ dungeonFloor: floor });
  },

  // fieldMonsters re-seeds the field's roster fresh (see combatStore's loadMonsters) rather
  // than restoring exactly what was mid-fight when the player left — a deliberate
  // simplification given the field only ever has a couple of placeholder monsters right now.
  exitDungeon: (fieldMonsters) => {
    clearMoveTarget();
    activeColliders.list = [...rockColliders, ...villageColliders];
    useCombatStore.getState().loadMonsters(fieldMonsters, false);
    playerPosition.set(FIELD_RETURN_POINT[0], 0, FIELD_RETURN_POINT[1]);
    set({ currentArea: 'field', dungeonFloor: 1 });
  },
}));
