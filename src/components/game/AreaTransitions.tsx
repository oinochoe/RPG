import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { FIELD_ENTRANCE_POINT, FIELD_ENTRANCE_RADIUS } from './worldColliders';
import { DUNGEON_EXIT_TRIGGER, DUNGEON_EXIT_RADIUS } from './Dungeon';
import { useWorldStore } from '../../stores/worldStore';
import type { MonsterInstanceSummary } from '../../types/api';

const TRANSITION_COOLDOWN_SEC = 1;

/**
 * Walk-triggered area transitions (no click/portal) — checks the player's distance to
 * whichever trigger point is relevant to the current area every frame, and hands off to
 * worldStore when they cross it.
 */
export function AreaTransitions({ fieldMonsters }: { fieldMonsters: MonsterInstanceSummary[] }) {
  const currentArea = useWorldStore((s) => s.currentArea);
  const enterDungeon = useWorldStore((s) => s.enterDungeon);
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
    } else {
      const dx = playerPosition.x - DUNGEON_EXIT_TRIGGER[0];
      const dz = playerPosition.z - DUNGEON_EXIT_TRIGGER[1];
      if (Math.hypot(dx, dz) < DUNGEON_EXIT_RADIUS) {
        exitDungeon(fieldMonsters);
        cooldown.current = TRANSITION_COOLDOWN_SEC;
      }
    }
  });

  return null;
}
