import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { DUNGEON_ENTRANCES, type DungeonId } from './worldColliders';
import { getEntryTrigger, DUNGEON_EXIT_RADIUS, getExitTrigger, DUNGEON_DESCEND_RADIUS, DUNGEON_META } from './Dungeon';
import { useWorldStore } from '../../stores/worldStore';
import type { MonsterInstanceSummary } from '../../types/api';

const TRANSITION_COOLDOWN_SEC = 1;

/**
 * Walk-triggered area/floor transitions (no click/portal) — checks the player's distance to
 * whichever trigger point(s) are relevant to the current area/floor every frame, and hands
 * off to worldStore when they cross one.
 */
export function AreaTransitions({ fieldMonsters }: { fieldMonsters: MonsterInstanceSummary[] }) {
  const currentArea = useWorldStore((s) => s.currentArea);
  const currentDungeonId = useWorldStore((s) => s.currentDungeonId);
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);
  const enterDungeon = useWorldStore((s) => s.enterDungeon);
  const descendFloor = useWorldStore((s) => s.descendFloor);
  const ascendFloor = useWorldStore((s) => s.ascendFloor);
  const exitDungeon = useWorldStore((s) => s.exitDungeon);
  const cooldown = useRef(0);
  const maxFloor = currentDungeonId ? DUNGEON_META[currentDungeonId].maxFloor : 1;
  // Each floor's entry/exit points now depend on its own shape (see Dungeon.tsx's FLOOR_PLANS)
  // rather than being fixed constants, so these are recomputed whenever the floor changes.
  const entryTrigger = useMemo(() => getEntryTrigger(dungeonFloor), [dungeonFloor]);
  const exitTrigger = useMemo(() => getExitTrigger(dungeonFloor, maxFloor), [dungeonFloor, maxFloor]);

  useFrame((_, delta) => {
    if (cooldown.current > 0) {
      cooldown.current -= delta;
      return;
    }

    if (currentArea === 'field') {
      for (const id of Object.keys(DUNGEON_ENTRANCES) as DungeonId[]) {
        const { point, radius } = DUNGEON_ENTRANCES[id];
        const dx = playerPosition.x - point[0];
        const dz = playerPosition.z - point[1];
        if (Math.hypot(dx, dz) < radius) {
          enterDungeon(id);
          cooldown.current = TRANSITION_COOLDOWN_SEC;
          return;
        }
      }
      return;
    }

    const dxSouth = playerPosition.x - entryTrigger[0];
    const dzSouth = playerPosition.z - entryTrigger[1];
    if (Math.hypot(dxSouth, dzSouth) < DUNGEON_EXIT_RADIUS) {
      if (dungeonFloor <= 1) {
        exitDungeon(fieldMonsters);
      } else {
        ascendFloor();
      }
      cooldown.current = TRANSITION_COOLDOWN_SEC;
      return;
    }

    if (exitTrigger) {
      const dxNorth = playerPosition.x - exitTrigger[0];
      const dzNorth = playerPosition.z - exitTrigger[1];
      if (Math.hypot(dxNorth, dzNorth) < DUNGEON_DESCEND_RADIUS) {
        descendFloor();
        cooldown.current = TRANSITION_COOLDOWN_SEC;
      }
    }
  });

  return null;
}
