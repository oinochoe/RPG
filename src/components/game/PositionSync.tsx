import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { updateCharacterPosition } from '../../api/characters';
import { shouldSavePosition } from './savePolicy';
import { useGameSessionStore } from '../../stores/gameSessionStore';

const SAVE_INTERVAL_SEC = 15;

/**
 * Periodically persists the player's world position back to the backend so a later login
 * resumes roughly where they left off, instead of always spawning at the character's
 * creation-time position. authStore.logout() does the same save on explicit logout to cover
 * the common case without waiting for the next tick. Closing or hiding the tab saves too
 * (keepalive, so the request survives the page going away).
 */
export function PositionSync({ mapId }: { mapId: number }) {
  const elapsed = useRef(0);

  function save(keepalive: boolean) {
    const { replaced, sessionId } = useGameSessionStore.getState();
    if (!shouldSavePosition({ replaced, sessionId })) return;
    updateCharacterPosition(
      {
        position_x: Math.round(playerPosition.x),
        position_y: Math.round(playerPosition.y),
        position_z: Math.round(playerPosition.z),
        current_map_id: mapId,
      },
      { keepalive },
    ).catch(() => {
      // Best-effort — a missed save just means a slightly stale resume position
      // next login, not worth surfacing to the player.
    });
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < SAVE_INTERVAL_SEC) return;
    elapsed.current = 0;
    saveRef.current(false);
  });

  useEffect(() => {
    const onPageHide = () => saveRef.current(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveRef.current(true);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
