import { create } from 'zustand';
import { playerPosition } from '../components/game/playerTransform';
import { clearMoveTarget } from '../components/game/moveTarget';
import { activeColliders, rockColliders, FIELD_ENTRANCE_POINT } from '../components/game/worldColliders';
import { villageColliders } from '../components/game/Village';
import { getDungeonColliders, buildFloorMonsters, DUNGEON_SPAWN } from '../components/game/Dungeon';
import { useCombatStore } from './combatStore';
import type { MonsterInstanceSummary } from '../types/api';

export type AreaId = 'field' | 'dungeon';

// Where the player lands back in the field after leaving the dungeon — a few units further
// out from the cave mouth than the entrance trigger itself, so stepping out doesn't
// immediately re-trigger walking back in.
const FIELD_RETURN_POINT: [number, number] = [FIELD_ENTRANCE_POINT[0], FIELD_ENTRANCE_POINT[1] + 4];

function enterFloor(floor: number) {
  clearMoveTarget();
  activeColliders.list = getDungeonColliders(floor);
  // Dungeon goblins are aggressive (attack on sight) — field/village monsters are passive.
  useCombatStore.getState().loadMonsters(buildFloorMonsters(floor), true);
  playerPosition.set(DUNGEON_SPAWN[0], 0, DUNGEON_SPAWN[1]);
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
    enterFloor(1);
    set({ currentArea: 'dungeon', dungeonFloor: 1 });
  },

  descendFloor: () => {
    const floor = get().dungeonFloor + 1;
    enterFloor(floor);
    set({ dungeonFloor: floor });
  },

  ascendFloor: () => {
    const floor = Math.max(1, get().dungeonFloor - 1);
    enterFloor(floor);
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
