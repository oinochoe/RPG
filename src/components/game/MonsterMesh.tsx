import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { NameTag } from './NameTag';
import { HealthBar } from './HealthBar';
import { playerPosition } from './playerTransform';
import { setAttackMoveTarget, setAttackTargetOnly, setSkillMoveTarget, clearMoveTarget } from './moveTarget';
import { useCombatStore, type MonsterCombatState } from '../../stores/combatStore';
import type { MonsterInstanceSummary } from '../../types/api';

interface DamagePopup {
  id: number;
  amount: number;
  createdAt: number;
}

export interface MonsterVariant {
  nameAccent: string;
  model: 'slime' | 'goblin' | 'skeleton';
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

export const SKELETON_VARIANT: MonsterVariant = {
  nameAccent: '#c9d6e3',
  model: 'skeleton',
  labelHeight: 1.0,
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
  // Was Math.PI, which combined with the outer atan2(dx,dz) facing rotation in MonsterMesh
  // (same-axis Y rotations add) made the goblin face exactly opposite of the direction it was
  // walking/attacking toward — most visible during its attack swing.
  facingOffset: 0,
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

const MONSTER_CONFIG: Record<'goblin' | 'slime', RiggedMonsterConfig> = {
  goblin: GOBLIN_CONFIG,
  slime: SLIME_CONFIG,
};

// Skeleton characters (KayKit - Character Pack: Skeletons) share the same rig/bone-naming
// convention as the player's own KayKit Adventurers models, and — like the player — have no
// baked "attack" clip: only Idle_A/Walking_A/Hit_A/Death_A come from the shared rig files
// below. Attack is a manual arm-bone override (see beginSwing/swingEase in CharacterMesh.tsx,
// duplicated here rather than shared — it's a small, self-contained technique and importing
// across those two files would couple the player's and monsters' render code for no benefit).
const SKELETON_RIG_GENERAL = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_General.glb';
const SKELETON_RIG_MOVEMENT = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb';
const SKELETON_MODEL_URL = '/models/kaykit-skeleton/characters/gltf/Skeleton_Minion.glb';
const SKELETON_WEAPON_URL = '/models/kaykit-skeleton/assets/gltf/Skeleton_Blade.gltf';
const SKELETON_TARGET_HEIGHT = 0.85;
const SKELETON_ATTACK_DURATION_MS = 300;
const SKELETON_HIT_ANIM_MS = 260;
const SWING_AXIS = new THREE.Vector3(1, 0, 0);
const WOUND_UP_ANGLE = -2.0;
const IMPACT_ANGLE = 1.0;
const STRIKE_END = 0.4;

/** Eased progress (0..1) through the swing: ease-in through the strike, smoothstep recovery.
 * Identical to CharacterMesh.tsx's swingEase — see the note above SKELETON_RIG_GENERAL. */
function swingEase(t: number): { phase: 'strike' | 'recovery'; localT: number } {
  if (t < STRIKE_END) {
    const localT = t / STRIKE_END;
    return { phase: 'strike', localT: localT * localT };
  }
  const localT = (t - STRIKE_END) / (1 - STRIKE_END);
  return { phase: 'recovery', localT: localT * localT * (3 - 2 * localT) };
}

function RiggedSkeletonMonsterBody({ combat, tint }: { combat: MonsterCombatState; tint?: THREE.ColorRepresentation }) {
  const modelGroupRef = useRef<THREE.Group>(null);
  const characterGltf = useGLTF(SKELETON_MODEL_URL);
  const weaponGltf = useGLTF(SKELETON_WEAPON_URL);
  const generalGltf = useGLTF(SKELETON_RIG_GENERAL);
  const movementGltf = useGLTF(SKELETON_RIG_MOVEMENT);

  const scene = useMemo(() => cloneSkeleton(characterGltf.scene), [characterGltf.scene]);
  const weaponScene = useMemo(() => cloneSkeleton(weaponGltf.scene), [weaponGltf.scene]);
  const clips = useMemo(
    () => [...generalGltf.animations, ...movementGltf.animations],
    [generalGltf.animations, movementGltf.animations],
  );
  const { actions } = useAnimations(clips, scene);
  const currentAction = useRef<string | null>(null);

  const swingBoneRef = useRef<THREE.Object3D | null>(null);
  const restQuat = useRef(new THREE.Quaternion());
  const windUpQuat = useRef(new THREE.Quaternion());
  const impactQuat = useRef(new THREE.Quaternion());
  const attackAnimUntil = useRef(0);

  const prevHitAt = useRef(combat.lastHitAt);
  const prevAttackAt = useRef(combat.lastAttackAt);
  const oneShotUntil = useRef(0);
  const deathPlayed = useRef(false);
  const prevPos = useRef(combat.position);

  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      if (!tint) return;
      const wasArray = Array.isArray(mesh.material);
      const cloned = (wasArray ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material]).map(
        (m) => (m as THREE.MeshStandardMaterial).clone(),
      );
      for (const m of cloned) {
        (m as THREE.MeshStandardMaterial).color?.multiply(new THREE.Color(tint));
      }
      mesh.material = wasArray ? cloned : cloned[0];
    });
    // Same bone-name convention as the player's CHARACTER_MODEL/WEAPON_MODEL attachment in
    // CharacterMesh.tsx (GLTFLoader strips the dots from "handslot.r"/"upperarm.r").
    const hand = scene.getObjectByName('handslotr');
    hand?.add(weaponScene);
    swingBoneRef.current = scene.getObjectByName('upperarmr') ?? null;
    if (swingBoneRef.current) restQuat.current.copy(swingBoneRef.current.quaternion);
    return () => {
      hand?.remove(weaponScene);
    };
  }, [scene, weaponScene, tint]);

  useEffect(() => {
    if (!modelGroupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = size.y > 0 ? SKELETON_TARGET_HEIGHT / size.y : 1;
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
    next.fadeIn(ANIM_FADE_SEC).play();
    if (prevName) actions[prevName]?.fadeOut(ANIM_FADE_SEC);
    currentAction.current = name;
  }

  function beginSwing() {
    attackAnimUntil.current = performance.now() + SKELETON_ATTACK_DURATION_MS;
    windUpQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, WOUND_UP_ANGLE));
    impactQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, IMPACT_ANGLE));
  }

  useFrame(() => {
    if (!combat.alive) {
      if (!deathPlayed.current) {
        playAction('Death_A', false);
        deathPlayed.current = true;
      }
      return;
    }

    const now = performance.now();
    if (combat.lastAttackAt !== prevAttackAt.current) {
      prevAttackAt.current = combat.lastAttackAt;
      beginSwing();
    }
    if (combat.lastHitAt !== prevHitAt.current) {
      prevHitAt.current = combat.lastHitAt;
      playAction('Hit_A', false);
      oneShotUntil.current = now + SKELETON_HIT_ANIM_MS;
    }
    if (now >= oneShotUntil.current) {
      const [px, , pz] = prevPos.current;
      const [cx, , cz] = combat.position;
      const moved = Math.hypot(cx - px, cz - pz) > 0.001;
      prevPos.current = combat.position;
      playAction(moved ? 'Walking_A' : 'Idle_A', true);
    }

    if (swingBoneRef.current) {
      const attackRemaining = attackAnimUntil.current - now;
      if (attackRemaining > 0) {
        const t = Math.min(1, 1 - attackRemaining / SKELETON_ATTACK_DURATION_MS);
        const { phase, localT } = swingEase(t);
        if (phase === 'strike') {
          swingBoneRef.current.quaternion.slerpQuaternions(windUpQuat.current, impactQuat.current, localT);
        } else {
          swingBoneRef.current.quaternion.slerpQuaternions(impactQuat.current, restQuat.current, localT);
        }
      } else {
        // Not attacking: keep tracking the mixer's live idle/walk pose for this bone so the
        // next swing always winds up from (and recovers back to) wherever it actually is.
        restQuat.current.copy(swingBoneRef.current.quaternion);
      }
    }
  });

  return (
    <group ref={modelGroupRef}>
      <primitive object={scene} />
    </group>
  );
}

function RiggedMonsterBody({
  combat,
  config,
  tint,
}: {
  combat: MonsterCombatState;
  config: RiggedMonsterConfig;
  tint?: THREE.ColorRepresentation;
}) {
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
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      // Give an elite (대장/군주) a visually distinct look without a separate model — clone the
      // shared GLTF-loaded material first (SkeletonUtils.clone doesn't clone materials, so
      // mutating in place would tint every instance of this model, not just this one) and
      // multiply its color rather than replacing it, to shift the hue while keeping whatever
      // shading/texture detail the base material already has.
      if (!tint) return;
      const wasArray = Array.isArray(mesh.material);
      const cloned = (wasArray ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material]).map(
        (m) => (m as THREE.MeshStandardMaterial).clone(),
      );
      for (const m of cloned) {
        (m as THREE.MeshStandardMaterial).color?.multiply(new THREE.Color(tint));
      }
      mesh.material = wasArray ? cloned : cloned[0];
    });
  }, [scene, tint]);

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
  tint,
}: {
  monster: MonsterInstanceSummary;
  variant?: MonsterVariant;
  scale?: number;
  tint?: THREE.ColorRepresentation;
}) {
  const combat = useCombatStore((s) => s.monsters[monster.instance_id]);
  const attackRange = useCombatStore((s) => s.player.attackRange);
  const isTargeted = useCombatStore((s) => s.targetId === monster.instance_id);
  const setTarget = useCombatStore((s) => s.setTarget);
  const prevHpRef = useRef(combat?.currentHp ?? monster.current_hp);
  const [popups, setPopups] = useState<DamagePopup[]>([]);
  const [dying, setDying] = useState(false);
  const wasAliveRef = useRef(true);
  const facingRef = useRef(0);
  const facingGroupRef = useRef<THREE.Group>(null);
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

  // Runs every frame (rather than a useEffect gated on position/lastAttackAt) so facing keeps
  // tracking the player continuously — the old effect-based version froze whenever neither of
  // those deps changed, e.g. a monster standing still mid-attack-cooldown while the player
  // circled around it, which looked like it was attacking in the wrong direction. Driven
  // imperatively via facingGroupRef.current.rotation.y (same pattern CharacterMesh uses for
  // its own facing) instead of a React rotation prop, since a ref write alone doesn't
  // trigger a re-render to pick up the new angle.
  useFrame(() => {
    const live = useCombatStore.getState().monsters[monster.instance_id];
    if (!live || !live.alive) return;
    const [mx, , mz] = live.position;
    const [px, , pz] = prevPosRef.current;
    const dx = mx - px;
    const dz = mz - pz;
    if (Math.hypot(dx, dz) > 0.01) {
      // Moving — face the direction of travel.
      facingRef.current = Math.atan2(dx, dz);
    } else if (live.aggressive || live.lastHitAt !== null) {
      // Stopped while engaged (close enough to attack) — face the player instead of
      // freezing at whatever heading it happened to approach from.
      const fdx = playerPosition.x - mx;
      const fdz = playerPosition.z - mz;
      if (Math.hypot(fdx, fdz) > 0.01) {
        facingRef.current = Math.atan2(fdx, fdz);
      }
    }
    prevPosRef.current = live.position;
    if (facingGroupRef.current) facingGroupRef.current.rotation.y = facingRef.current;
  });

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
    // The actual combat lock (see resolveTarget in combatStore) — attacks/skills go only to
    // this monster from now on until it dies or another one is clicked, regardless of which
    // one ends up nearest.
    setTarget(monster.instance_id);
    const dx = playerPosition.x - basePosition[0];
    const dz = playerPosition.z - basePosition[2];
    const dist = Math.hypot(dx, dz) || 1;
    const standoff = attackRange * 0.85;
    const inRange = dist <= attackRange;

    // Skill aiming armed (see combatStore's isAimingSkill/toggleAimSkill) — this click IS
    // the target designation Ragnarok-style ability targeting calls for. In range, fire on
    // the spot; out of range, walk to a standoff point first and fire once arrival lands
    // (see CharacterMesh's pendingSkillCast watcher) — same walk-then-act shape as the
    // basic-attack branch below, just a single cast instead of repeated auto-attacks.
    if (useCombatStore.getState().isAimingSkill) {
      useCombatStore.getState().cancelAimSkill();
      if (inRange) {
        // Firing on the spot supersedes any walk-to-attack still in flight from an earlier
        // click on a different monster — without this, an aimed cast on monster B while
        // still mid-walk toward monster A left moveTarget still pointed at A, so the
        // character kept marching there and then missed forever (the lock had already
        // moved to B, and A's arrival block never got a hit to clear itself on).
        clearMoveTarget();
        useCombatStore.getState().requestCastSkill();
      } else {
        const standX = basePosition[0] + (dx / dist) * standoff;
        const standZ = basePosition[2] + (dz / dist) * standoff;
        setSkillMoveTarget(standX, standZ);
      }
      return;
    }

    // setAttackTargetOnly/setAttackMoveTarget below are movement-only: they just walk the
    // player to (or stop them at) a range where the lock set above can connect.
    if (inRange) {
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
    <group ref={facingGroupRef} position={basePosition} scale={scale}>
      {isTargeted && !dying && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.55, 0.7, 24]} />
          <meshBasicMaterial color="#e0538a" transparent opacity={0.85} />
        </mesh>
      )}
      {!dying && (
        <mesh visible={false} onClick={handleClick}>
          <cylinderGeometry args={[0.55, 0.55, labelHeight, 8]} />
          <meshBasicMaterial />
        </mesh>
      )}
      {variant.model === 'skeleton' ? (
        <RiggedSkeletonMonsterBody combat={combat} tint={tint} />
      ) : (
        <RiggedMonsterBody combat={combat} config={MONSTER_CONFIG[variant.model]} tint={tint} />
      )}
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
useGLTF.preload(SKELETON_MODEL_URL);
useGLTF.preload(SKELETON_WEAPON_URL);
useGLTF.preload(SKELETON_RIG_GENERAL);
useGLTF.preload(SKELETON_RIG_MOVEMENT);
