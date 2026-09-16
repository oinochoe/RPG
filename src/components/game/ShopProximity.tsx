import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { SHOP_NPC_POSITIONS, SHOP_INTERACT_RADIUS } from './Village';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

/**
 * Tracks whether the player is standing close enough to a village shop NPC to open the
 * shop with E (see GamePage's keydown handler) — walk-triggered proximity, same pattern as
 * AreaTransitions.tsx, but only sets a flag rather than acting immediately since opening a
 * shop should be an intentional keypress, not automatic like a floor transition.
 */
export function ShopProximity() {
  const currentArea = useWorldStore((s) => s.currentArea);

  useFrame(() => {
    // Shop NPCs only exist in the village (part of the field map) — skip the check
    // entirely in the dungeon rather than risk a coincidental coordinate overlap.
    if (currentArea === 'dungeon') {
      if (useUIStore.getState().isNearShop) useUIStore.getState().setNearShop(false);
      return;
    }

    const near = SHOP_NPC_POSITIONS.some(([x, z]) => {
      const dx = playerPosition.x - x;
      const dz = playerPosition.z - z;
      return Math.hypot(dx, dz) < SHOP_INTERACT_RADIUS;
    });
    if (near !== useUIStore.getState().isNearShop) useUIStore.getState().setNearShop(near);
  });

  return null;
}
