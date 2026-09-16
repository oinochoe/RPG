import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { SHOP_NPCS, SHOP_INTERACT_RADIUS } from './Village';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

/**
 * Tracks which shop NPC (if any) the player is standing close enough to talk to — walk-
 * triggered proximity, same pattern as AreaTransitions.tsx, but only sets a flag rather
 * than acting immediately since talking to an NPC should be an intentional keypress
 * (Space, handled in CharacterMesh.tsx), not automatic like a floor transition.
 */
export function ShopProximity() {
  const currentArea = useWorldStore((s) => s.currentArea);

  useFrame(() => {
    // Shop NPCs only exist in the village (part of the field map) — skip the check
    // entirely in the dungeon rather than risk a coincidental coordinate overlap.
    if (currentArea === 'dungeon') {
      if (useUIStore.getState().nearShopKind !== null) useUIStore.getState().setNearShopKind(null);
      return;
    }

    const near = SHOP_NPCS.find(({ position: [x, z] }) => {
      const dx = playerPosition.x - x;
      const dz = playerPosition.z - z;
      return Math.hypot(dx, dz) < SHOP_INTERACT_RADIUS;
    });
    const kind = near?.kind ?? null;
    if (kind !== useUIStore.getState().nearShopKind) useUIStore.getState().setNearShopKind(kind);
  });

  return null;
}
