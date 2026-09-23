import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { playerPosition } from './playerTransform';
import { VILLAGE_CENTER } from './Village';
import { useCombatStore } from '../../stores/combatStore';
import { useWorldStore } from '../../stores/worldStore';
import { formatGold } from './itemLabels';
import { playSound } from '../../lib/sound';
import { resolveMovement, PLAYER_COLLISION_RADIUS } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

interface FloatPopup {
  id: number;
  text: string;
  color: string;
}

/** A safe respawn point inside the village — dying anywhere (field or dungeon) sends the
 * player back here rather than leaving them to be immediately re-aggroed on the spot. */
const RESPAWN_POINT: [number, number] = [VILLAGE_CENTER[0], VILLAGE_CENTER[1] + 2];

// Monster movement (chase/wander) is ticked on its own slower cadence rather than every
// frame — smooth enough at these walking speeds, and cuts the re-render churn from N
// monsters' positions changing 60 times a second down to 10.
const MOVEMENT_TICK_SEC = 0.1;

/**
 * Runs the monster-vs-player side of combat (monsters standing near the player periodically
 * hit back — see combatStore.monsterAttackTick) and handles death/respawn, plus floating
 * "-N" / "+N Gold" popups above the player's head so both are visible without staring at the
 * HUD bars.
 */
export function PlayerCombatEffects({ fieldMonsters }: { fieldMonsters: MonsterInstanceSummary[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const [popups, setPopups] = useState<FloatPopup[]>([]);
  const prevHpRef = useRef(useCombatStore.getState().player.currentHp);
  const prevGoldRef = useRef(useCombatStore.getState().player.gold);
  const movementAccumRef = useRef(0);

  function pushPopup(text: string, color: string) {
    const popup: FloatPopup = { id: Date.now() + Math.random(), text, color };
    setPopups((prev) => [...prev, popup]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== popup.id));
    }, 700);
  }

  useEffect(
    () =>
      useCombatStore.subscribe((state) => {
        const hp = state.player.currentHp;
        if (hp < prevHpRef.current) {
          pushPopup(`-${prevHpRef.current - hp}`, '#ff5a5a');
        }
        prevHpRef.current = hp;

        const gold = state.player.gold;
        if (gold > prevGoldRef.current) {
          pushPopup(`+${formatGold(gold - prevGoldRef.current)}G`, '#ffd54a');
        }
        prevGoldRef.current = gold;
      }),
    [],
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.position.set(playerPosition.x, 0, playerPosition.z);
    }

    movementAccumRef.current += delta;
    if (movementAccumRef.current >= MOVEMENT_TICK_SEC) {
      const step = movementAccumRef.current;
      movementAccumRef.current = 0;
      useCombatStore.getState().tickMonsterMovement(playerPosition.x, playerPosition.z, step);
    }

    const { died, knockback } = useCombatStore.getState().monsterAttackTick(playerPosition.x, playerPosition.z);
    if (knockback && !died) {
      playSound('hitHeavy', 0.55);
      const resolved = resolveMovement(playerPosition.x, playerPosition.z, knockback.dx, knockback.dz, PLAYER_COLLISION_RADIUS);
      playerPosition.set(resolved.x, 0, resolved.z);
    }
    if (died) {
      if (useWorldStore.getState().currentArea === 'dungeon') {
        useWorldStore.getState().exitDungeon(fieldMonsters);
      }
      playerPosition.set(RESPAWN_POINT[0], 0, RESPAWN_POINT[1]);
      useCombatStore.getState().respawnPlayer();
    }
  });

  return (
    <group ref={groupRef}>
      {popups.map((popup) => (
        <Html key={popup.id} position={[0, 2.1, 0]} center>
          <div
            style={{
              color: popup.color,
              fontWeight: 700,
              fontSize: 15,
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
              animation: 'rpg-dmg-float 700ms ease-out forwards',
            }}
          >
            {popup.text}
          </div>
        </Html>
      ))}
    </group>
  );
}
