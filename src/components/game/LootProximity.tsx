import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { useLootStore } from '../../stores/lootStore';
import { useUIStore } from '../../stores/uiStore';

const PICKUP_RADIUS = 1.8;

/** Tracks the nearest world item drop within pickup range (if any) — same per-frame-scan
 * shape as ShopProximity/QuestProximity, just against lootStore's dynamic drop list instead
 * of a fixed NPC list, and picking the closest one rather than any match. */
export function LootProximity() {
  useFrame(() => {
    const drops = useLootStore.getState().drops;
    let nearestId: number | null = null;
    let nearestDist = PICKUP_RADIUS;
    for (const drop of drops) {
      const dx = playerPosition.x - drop.position[0];
      const dz = playerPosition.z - drop.position[2];
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = drop.id;
      }
    }
    if (nearestId !== useUIStore.getState().nearDropId) useUIStore.getState().setNearDropId(nearestId);
  });

  return null;
}
