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
  bodyColor: string;
  emissiveColor: string;
  nameAccent: string;
  model?: 'slime' | 'goblin';
  labelHeight?: number;
}

const SLIME_VARIANT: MonsterVariant = {
  bodyColor: '#8b3fae',
  emissiveColor: '#4a1868',
  nameAccent: '#d38bf0',
  model: 'slime',
  labelHeight: 1.05,
};

export const GOBLIN_VARIANT: MonsterVariant = {
  bodyColor: '#5a7a3a',
  emissiveColor: '#8a2a1a',
  nameAccent: '#e0a458',
  model: 'goblin',
  labelHeight: 1.85,
};

// How long the body keeps rendering (playing its Death clip) after currentHp hits 0, before
// respawn logic makes it disappear — only meaningful for the goblin's rigged death animation;
// the slime has no death clip so it just vanishes.
const DEATH_LINGER_MS = 650;

const GOBLIN_MODEL = '/models/quaternius-goblin/Goblin.glb';
const GOBLIN_TARGET_HEIGHT = 1.3;
const GOBLIN_CLIP = {
  idle: 'EnemyArmature|EnemyArmature|EnemyArmature|Idle',
  attack: 'EnemyArmature|EnemyArmature|EnemyArmature|Attack',
  hit: 'EnemyArmature|EnemyArmature|EnemyArmature|HitRecieve',
  death: 'EnemyArmature|EnemyArmature|EnemyArmature|Death',
};
const GOBLIN_ATTACK_ANIM_MS = 500;
const GOBLIN_HIT_ANIM_MS = 260;
const GOBLIN_ANIM_FADE_SEC = 0.12;

function SlimeBody({ variant }: { variant: MonsterVariant }) {
  const bodyRef = useRef<THREE.Mesh>(null);
  const seed = useRef(Math.random() * 10);

  useFrame(({ clock }) => {
    if (!bodyRef.current) return;
    const t = clock.elapsedTime * 2.4 + seed.current;
    const squash = 1 + Math.sin(t) * 0.08;
    bodyRef.current.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    bodyRef.current.position.y = 0.42 * squash - 0.05;
  });

  return (
    <>
      <mesh ref={bodyRef} castShadow>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshStandardMaterial
          color={variant.bodyColor}
          emissive={variant.emissiveColor}
          emissiveIntensity={0.35}
          roughness={0.25}
          metalness={0.1}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[-0.16, 0.5, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#150017" />
      </mesh>
      <mesh position={[0.16, 0.5, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#150017" />
      </mesh>
    </>
  );
}

function GoblinBody({ combat }: { combat: MonsterCombatState }) {
  const modelGroupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(GOBLIN_MODEL);
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, scene);
  const currentAction = useRef<string | null>(null);
  const prevHitAt = useRef(combat.lastHitAt);
  const prevAttackAt = useRef(combat.lastAttackAt);
  const oneShotUntil = useRef(0);
  const deathPlayed = useRef(false);

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
    const s = size.y > 0 ? GOBLIN_TARGET_HEIGHT / size.y : 1;
    modelGroupRef.current.scale.setScalar(s);
  }, [scene]);

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
    next.fadeIn(GOBLIN_ANIM_FADE_SEC).play();
    if (prevName) actions[prevName]?.fadeOut(GOBLIN_ANIM_FADE_SEC);
    currentAction.current = name;
  }

  useFrame(() => {
    if (!combat.alive) {
      if (!deathPlayed.current) {
        playAction(GOBLIN_CLIP.death, false);
        deathPlayed.current = true;
      }
      return;
    }

    const now = performance.now();
    if (combat.lastAttackAt !== prevAttackAt.current) {
      prevAttackAt.current = combat.lastAttackAt;
      playAction(GOBLIN_CLIP.attack, false);
      oneShotUntil.current = now + GOBLIN_ATTACK_ANIM_MS;
      return;
    }
    if (combat.lastHitAt !== prevHitAt.current) {
      prevHitAt.current = combat.lastHitAt;
      playAction(GOBLIN_CLIP.hit, false);
      oneShotUntil.current = now + GOBLIN_HIT_ANIM_MS;
      return;
    }
    if (now >= oneShotUntil.current) {
      playAction(GOBLIN_CLIP.idle, true);
    }
  });

  return (
    <group ref={modelGroupRef} rotation={[0, Math.PI, 0]}>
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

  const labelHeight = variant.labelHeight ?? 1.05;

  return (
    <group position={basePosition} rotation={[0, facingRef.current, 0]} scale={scale}>
      {!dying && (
        <mesh visible={false} onClick={handleClick}>
          <cylinderGeometry args={[0.55, 0.55, labelHeight, 8]} />
          <meshBasicMaterial />
        </mesh>
      )}
      {variant.model === 'goblin' ? <GoblinBody combat={combat} /> : <SlimeBody variant={variant} />}
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

useGLTF.preload(GOBLIN_MODEL);
