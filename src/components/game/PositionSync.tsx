import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { updateCharacterPosition } from '../../api/characters';

const SAVE_INTERVAL_SEC = 15;

/**
 * Periodically persists the player's world position back to the backend so a later login
 * resumes roughly where they left off, instead of always spawning at the character's
 * creation-time position. authStore.logout() does the same save on explicit logout to cover
 * the common case without waiting for the next tick.
 */
export function PositionSync({ mapId }: { mapId: number }) {
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < SAVE_INTERVAL_SEC) return;
    elapsed.current = 0;
    updateCharacterPosition({
      position_x: Math.round(playerPosition.x),
      position_y: Math.round(playerPosition.y),
      position_z: Math.round(playerPosition.z),
      current_map_id: mapId,
    }).catch(() => {
      // Best-effort — a missed periodic save just means a slightly stale resume position
      // next login, not worth surfacing to the player.
    });
  });

  return null;
}
