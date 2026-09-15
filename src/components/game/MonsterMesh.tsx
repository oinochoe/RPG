import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { NameTag } from './NameTag';
import { HealthBar } from './HealthBar';
import { playerPosition } from './playerTransform';
import { setAttackMoveTarget, setAttackTargetOnly } from './moveTarget';
import { useCombatStore, type MonsterCombatState } from '../../stores/combatStore';
import type { MonsterInstanceSummary } from '../../types/api';

interface DamagePopup {
  id: number;
  amount: number;
  createdAt: number;
}

export interface MonsterVariant {
  nameAccent: string;
  model: 'slime' | 'goblin';
  labelHeight: number;
}

const SLIME_VARIANT: MonsterVariant = {
  nameAccent: '#d38bf0',
  model: 'slime',
  labelHeight: 0.75,
};

export const GOBLIN_VARIANT: MonsterVariant = {
  nameAccent: '#e0a458',
  model: 'goblin',
  labelHeight: 0.85,
};

// How long the body keeps rendering (playing its Death clip) after currentHp hits 0, before
// respawn logic makes it disappear.
const DEATH_LINGER_MS = 650;
const ANIM_FADE_SEC = 0.12;

interface RiggedClips {
  idle: string;
  walk: string;
  attack: string;
  hit: string;
  death: string;
}

interface RiggedMonsterConfig {
  modelUrl: string;
  targetHeight: number;
  clips: RiggedClips;
  attackAnimMs: number;
  hitAnimMs: number;
  // Different Quaternius packs export their rig facing different local axes — this corrects
  // each model's mesh to face the group's local +Z (the direction facingRef points toward)
  // rather than assuming every model shares one convention.
  facingOffset: number;
}

const GOBLIN_CONFIG: RiggedMonsterConfig = {
  modelUrl: '/models/quaternius-goblin/Goblin.glb',
  targetHeight: 0.61,
  clips: {
    idle: 'EnemyArmature|EnemyArmature|EnemyArmature|Idle',
    walk: 'EnemyArmature|EnemyArmature|EnemyArmature|Walk',
    attack: 'EnemyArmature|EnemyArmature|EnemyArmature|Attack',
    hit: 'EnemyArmature|EnemyArmature|EnemyArmature|HitRecieve',
    death: 'EnemyArmature|EnemyArmature|EnemyArmature|Death',
  },
  attackAnimMs: 500,
  hitAnimMs: 260,
  facingOffset: Math.PI,
};

const SLIME_CONFIG: RiggedMonsterConfig = {
  modelUrl: '/models/quaternius-slime/Slime.glb',
  targetHeight: 0.53,
  clips: {
    idle: 'MonsterArmature|Idle',
    walk: 'MonsterArmature|Walk',
    attack: 'MonsterArmature|Bite_Front',
    hit: 'MonsterArmature|HitRecieve',
    death: 'MonsterArmature|Death',
  },
  attackAnimMs: 500,
  hitAnimMs: 375,
  facingOffset: 0,
};

const MONSTER_CONFIG: Record<MonsterVariant['model'], RiggedMonsterConfig> = {
  goblin: GOBLIN_CONFIG,
  slime: SLIME_CONFIG,
};

function RiggedMonsterBody({ combat, config }: { combat: MonsterCombatState; config: RiggedMonsterConfig }) {
  const modelGroupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(config.modelUrl);
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, scene);
  const currentAction = useRef<string | null>(null);
  const prevHitAt = useRef(combat.lastHitAt);
  const prevAttackAt = useRef(combat.lastAttackAt);
  const oneShotUntil = useRef(0);
  const deathPlayed = useRef(false);
  const prevPos = useRef(combat.position);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
  }, [scene]);

  useEffect(() => {
    if (!modelGroupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = size.y > 0 ? config.targetHeight / size.y : 1;
    modelGroupRef.current.scale.setScalar(s);
  }, [scene, config.targetHeight]);

  function playAction(name: string, loop: boolean) {
    if (currentAction.current === name) return;
    const next = actions[name];
    if (!next) return;
    const prevName = currentAction.current;
    next.reset();
    if (!loop) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    next.fadeIn(ANIM_FADE_SEC).play();
    if (prevName) actions[prevName]?.fadeOut(ANIM_FADE_SEC);
    currentAction.current = name;
  }

  useFrame(() => {
    if (!combat.alive) {
      if (!deathPlayed.current) {
        playAction(config.clips.death, false);
        deathPlayed.current = true;
      }
      return;
    }

    const now = performance.now();
    if (combat.lastAttackAt !== prevAttackAt.current) {
      prevAttackAt.current = combat.lastAttackAt;
      playAction(config.clips.attack, false);
      oneShotUntil.current = now + config.attackAnimMs;
      return;
    }
    if (combat.lastHitAt !== prevHitAt.current) {
      prevHitAt.current = combat.lastHitAt;
      playAction(config.clips.hit, false);
      oneShotUntil.current = now + config.hitAnimMs;
      return;
    }
    if (now < oneShotUntil.current) return;

    const [px, , pz] = prevPos.current;
    const [cx, , cz] = combat.position;
    const moved = Math.hypot(cx - px, cz - pz) > 0.001;
    prevPos.current = combat.position;
    playAction(moved ? config.clips.walk : config.clips.idle, true);
  });

  return (
    <group ref={modelGroupRef} rotation={[0, config.facingOffset, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export function MonsterMesh({
  monster,
  variant = SLIME_VARIANT,
  scale = 1,
}: {
  monster: MonsterInstanceSummary;
  variant?: MonsterVariant;
  scale?: number;
}) {
  const combat = useCombatStore((s) => s.monsters[monster.instance_id]);
  const attackRange = useCombatStore((s) => s.player.attackRange);
  const prevHpRef = useRef(combat?.currentHp ?? monster.current_hp);
  const [popups, setPopups] = useState<DamagePopup[]>([]);
  const [dying, setDying] = useState(false);
  const wasAliveRef = useRef(true);
  const facingRef = useRef(0);
  const prevPosRef = useRef<[number, number, number]>([
    monster.position_x,
    monster.position_y,
    monster.position_z,
  ]);
  const basePosition: [number, number, number] = combat?.position ?? [
    monster.position_x,
    monster.position_y,
    monster.position_z,
  ];

  useEffect(() => {
    const [px, , pz] = prevPosRef.current;
    const dx = basePosition[0] - px;
    const dz = basePosition[2] - pz;
    if (Math.hypot(dx, dz) > 0.01) {
      // Moving — face the direction of travel.
      facingRef.current = Math.atan2(dx, dz);
    } else if (combat && (combat.aggressive || combat.lastHitAt !== null)) {
      // Stopped while engaged (close enough to attack) — face the player instead of
      // freezing at whatever heading it happened to approach from.
      const fdx = playerPosition.x - basePosition[0];
      const fdz = playerPosition.z - basePosition[2];
      if (Math.hypot(fdx, fdz) > 0.01) {
        facingRef.current = Math.atan2(fdx, fdz);
      }
    }
    prevPosRef.current = basePosition;
  }, [basePosition[0], basePosition[2], combat?.lastAttackAt, combat?.lastHitAt]);

  useEffect(() => {
    if (!combat) return;
    if (combat.currentHp < prevHpRef.current) {
      const amount = prevHpRef.current - combat.currentHp;
      const popup: DamagePopup = { id: Date.now() + Math.random(), amount, createdAt: performance.now() };
      setPopups((prev) => [...prev, popup]);
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== popup.id));
      }, 700);
    }
    prevHpRef.current = combat.currentHp;
  }, [combat?.currentHp]);

  useEffect(() => {
    if (!combat) return;
    if (wasAliveRef.current && !combat.alive) {
      setDying(true);
      const timer = window.setTimeout(() => setDying(false), DEATH_LINGER_MS);
      wasAliveRef.current = combat.alive;
      return () => window.clearTimeout(timer);
    }
    wasAliveRef.current = combat.alive;
  }, [combat?.alive]);

  if (!combat) return null;
  if (!combat.alive && !dying) return null;

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const dx = playerPosition.x - basePosition[0];
    const dz = playerPosition.z - basePosition[2];
    const dist = Math.hypot(dx, dz) || 1;
    const standoff = attackRange * 0.85;
    if (dist <= attackRange) {
      // Already in range (common for ranged classes) — attack in place instead of
      // walking to a standoff point, which could otherwise mean stepping backward.
      setAttackTargetOnly(monster.instance_id);
      return;
    }
    const standX = basePosition[0] + (dx / dist) * standoff;
    const standZ = basePosition[2] + (dz / dist) * standoff;
    setAttackMoveTarget(standX, standZ, monster.instance_id);
  }

  const labelHeight = variant.labelHeight;

  return (
    <group position={basePosition} rotation={[0, facingRef.current, 0]} scale={scale}>
      {!dying && (
        <mesh visible={false} onClick={handleClick}>
          <cylinderGeometry args={[0.55, 0.55, labelHeight, 8]} />
          <meshBasicMaterial />
        </mesh>
      )}
      <RiggedMonsterBody combat={combat} config={MONSTER_CONFIG[variant.model]} />
      {!dying && (
        <>
          <NameTag
            position={[0, labelHeight, 0]}
            label={`${monster.name} Lv.${monster.level}`}
            accent={variant.nameAccent}
          />
          <HealthBar position={[0, labelHeight - 0.15, 0]} ratio={combat.currentHp / combat.maxHp} color="#e0538a" />
        </>
      )}
      {popups.map((popup) => (
        <Html key={popup.id} position={[0, labelHeight + 0.25, 0]} center>
          <div
            style={{
              color: '#ffd54a',
              fontWeight: 700,
              fontSize: 15,
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
              animation: 'rpg-dmg-float 700ms ease-out forwards',
            }}
          >
            -{popup.amount}
          </div>
        </Html>
      ))}
    </group>
  );
}

Object.values(MONSTER_CONFIG).forEach((config) => useGLTF.preload(config.modelUrl));
