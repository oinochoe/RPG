import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { FIELD_ENTRANCE_POINT, FIELD_ENTRANCE_RADIUS } from './worldColliders';
import {
  DUNGEON_EXIT_TRIGGER,
  DUNGEON_EXIT_RADIUS,
  DUNGEON_DESCEND_TRIGGER,
  DUNGEON_DESCEND_RADIUS,
  DUNGEON_MAX_FLOOR,
} from './Dungeon';
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
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);
  const enterDungeon = useWorldStore((s) => s.enterDungeon);
  const descendFloor = useWorldStore((s) => s.descendFloor);
  const ascendFloor = useWorldStore((s) => s.ascendFloor);
  const exitDungeon = useWorldStore((s) => s.exitDungeon);
  const cooldown = useRef(0);

  useFrame((_, delta) => {
    if (cooldown.current > 0) {
      cooldown.current -= delta;
      return;
    }

    if (currentArea === 'field') {
      const dx = playerPosition.x - FIELD_ENTRANCE_POINT[0];
      const dz = playerPosition.z - FIELD_ENTRANCE_POINT[1];
      if (Math.hypot(dx, dz) < FIELD_ENTRANCE_RADIUS) {
        enterDungeon();
        cooldown.current = TRANSITION_COOLDOWN_SEC;
      }
      return;
    }

    const dxSouth = playerPosition.x - DUNGEON_EXIT_TRIGGER[0];
    const dzSouth = playerPosition.z - DUNGEON_EXIT_TRIGGER[1];
    if (Math.hypot(dxSouth, dzSouth) < DUNGEON_EXIT_RADIUS) {
      if (dungeonFloor <= 1) {
        exitDungeon(fieldMonsters);
      } else {
        ascendFloor();
      }
      cooldown.current = TRANSITION_COOLDOWN_SEC;
      return;
    }

    if (dungeonFloor < DUNGEON_MAX_FLOOR) {
      const dxNorth = playerPosition.x - DUNGEON_DESCEND_TRIGGER[0];
      const dzNorth = playerPosition.z - DUNGEON_DESCEND_TRIGGER[1];
      if (Math.hypot(dxNorth, dzNorth) < DUNGEON_DESCEND_RADIUS) {
        descendFloor();
        cooldown.current = TRANSITION_COOLDOWN_SEC;
      }
    }
  });

  return null;
}
