import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { playerPosition } from './playerTransform';
import { VILLAGE_CENTER } from './Village';
import { useCombatStore, POISON_TICK_MS } from '../../stores/combatStore';
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

// One-shot VFX for each boss skill pattern that actually lands on the player (poison/slow/
// knockback — rage is a monster self-buff, see MonsterMesh's own aura for that one instead).
// drei's Sparkles (already a project dependency via @react-three/drei, no new asset download
// needed — see this component's own doc comment) reads as a believable burst even though it's
// built for continuous use, the same "borrow a library primitive instead of sourcing a real
// VFX sprite sheet" call this project already made for Bloom/Vignette post-processing.
const SKILL_VFX_MS = 800;
const SKILL_VFX_CONFIG: Record<'poison' | 'slow' | 'knockback', { color: string; count: number; scale: number; speed: number }> = {
  poison: { color: '#a8d94a', count: 30, scale: 1.2, speed: 0.4 },
  slow: { color: '#e6a8d0', count: 26, scale: 1.1, speed: 0.3 },
  knockback: { color: '#9a8f7a', count: 22, scale: 1.6, speed: 0.6 },
};

interface SkillBurst {
  id: number;
  kind: 'poison' | 'slow' | 'knockback';
}

/** A safe respawn point inside the village — dying anywhere (field or dungeon) sends the
 * player back here rather than leaving them to be immediately re-aggroed on the spot. */
const RESPAWN_POINT: [number, number] = [VILLAGE_CENTER[0], VILLAGE_CENTER[1] + 2];

// Monster movement (chase/wander) is ticked on its own slower cadence rather than every
// frame — smooth enough at these walking speeds, and cuts the re-render churn from N
// monsters' positions changing 60 times a second down to 10.
const MOVEMENT_TICK_SEC = 0.1;
// 구울 군주's poison DOT (see combatStore's tickPoison) — cadence imported from combatStore's
// own POISON_TICK_MS rather than a second, separately-maintained constant.
const POISON_TICK_SEC = POISON_TICK_MS / 1000;

/**
 * Runs the monster-vs-player side of combat (monsters standing near the player periodically
 * hit back — see combatStore.monsterAttackTick) and handles death/respawn, plus floating
 * "-N" / "+N Gold" popups above the player's head so both are visible without staring at the
 * HUD bars.
 */
export function PlayerCombatEffects({ fieldMonsters }: { fieldMonsters: MonsterInstanceSummary[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const [popups, setPopups] = useState<FloatPopup[]>([]);
  const [bursts, setBursts] = useState<SkillBurst[]>([]);
  const prevHpRef = useRef(useCombatStore.getState().player.currentHp);
  const prevGoldRef = useRef(useCombatStore.getState().player.gold);
  const movementAccumRef = useRef(0);
  const poisonAccumRef = useRef(0);

  function pushPopup(text: string, color: string) {
    const popup: FloatPopup = { id: Date.now() + Math.random(), text, color };
    setPopups((prev) => [...prev, popup]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== popup.id));
    }, 700);
  }

  function pushSkillBurst(kind: SkillBurst['kind']) {
    const burst: SkillBurst = { id: Date.now() + Math.random(), kind };
    setBursts((prev) => [...prev, burst]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, SKILL_VFX_MS);
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

    poisonAccumRef.current += delta;
    if (poisonAccumRef.current >= POISON_TICK_SEC) {
      poisonAccumRef.current = 0;
      useCombatStore.getState().tickPoison();
    }

    const { died, knockback, skillEffect } = useCombatStore.getState().monsterAttackTick(playerPosition.x, playerPosition.z);
    if (knockback && !died) {
      playSound('hitHeavy', 0.55);
      const resolved = resolveMovement(playerPosition.x, playerPosition.z, knockback.dx, knockback.dz, PLAYER_COLLISION_RADIUS);
      playerPosition.set(resolved.x, 0, resolved.z);
    }
    // Rage has no burst here — it's a monster self-buff with no impact on the player, see
    // MonsterMesh's own persistent aura for that one instead.
    if (skillEffect && skillEffect !== 'rage' && !died) {
      pushSkillBurst(skillEffect);
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
      {bursts.map((burst) => {
        const config = SKILL_VFX_CONFIG[burst.kind];
        return (
          <Sparkles
            key={burst.id}
            position={[0, 1, 0]}
            color={config.color}
            count={config.count}
            scale={config.scale}
            speed={config.speed}
            size={4}
            noise={0.4}
          />
        );
      })}
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
