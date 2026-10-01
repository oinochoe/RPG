import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { playerPosition } from './playerTransform';
import { DISCOVERIES } from './discoveries';
import { buildGrid, nearestInRange } from './discoveryLogic';
import { zoneAt } from './discoveryZones';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import { useCombatStore } from '../../stores/combatStore';

/** Tracks which discovery (if any) the player is standing close enough to inspect. Only sets a flag; Space/the touch
 * action button/clicking decide whether to open it (see interactions.ts). Off in the dungeon. */
export function DiscoveryProximity() {
  const currentArea = useWorldStore((s) => s.currentArea);
  const grid = useMemo(() => buildGrid(DISCOVERIES), []);

  useFrame(() => {
    const ui = useUIStore.getState();
    if (currentArea === 'dungeon') {
      if (ui.nearDiscoveryId !== null) ui.setNearDiscoveryId(null);
      return;
    }
    const ctx = { level: useCombatStore.getState().player.level, seen: useDiscoveryStore.getState().seen, zoneAt };
    // Seen ones are skipped so they don't hog the action button / Space; clicking their prop still re-reads them.
    const near = nearestInRange(grid, playerPosition.x, playerPosition.z, ctx, { skipSeen: true });
    const id = near?.id ?? null;
    if (id !== ui.nearDiscoveryId) ui.setNearDiscoveryId(id);
  });

  return null;
}
