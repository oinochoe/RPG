import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { NameTag } from './NameTag';
import { HealthBar } from './HealthBar';
import { playerPosition } from './playerTransform';
import { moveTarget, clearMoveTarget } from './moveTarget';
import { resolveMovement } from './worldColliders';
import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import type { CharacterProfile } from '../../types/api';

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

const CHARACTER_MODEL: Record<CharacterProfile['character_class'], string> = {
  warrior: '/models/kaykit/Characters/gltf/Knight.glb',
  mage: '/models/kaykit/Characters/gltf/Mage.glb',
  archer: '/models/kaykit/Characters/gltf/Ranger.glb',
};

const WEAPON_MODEL: Record<CharacterProfile['character_class'], string> = {
  warrior: '/models/kaykit/Assets/gltf/sword_1handed.gltf',
  mage: '/models/kaykit/Assets/gltf/staff.gltf',
  archer: '/models/kaykit/Assets/gltf/bow_withString.gltf',
};

const RIG_GENERAL = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_General.glb';
const RIG_MOVEMENT = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb';

const TARGET_HEIGHT = 0.9;
const ATTACK_DURATION_MS = 300;
const MOVE_FADE_SEC = 0.15;
const MOVE_SPEED = 6;
const PLAYER_COLLISION_RADIUS = 0.4;
// Overall playable boundary (field + village combined) — LightRig follows the player, so
// this no longer needs to fit inside a fixed shadow frustum, just the decorated ground itself.
const MAX_RADIUS = 68;
const ARRIVE_EPSILON = 0.15;
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const SWING_AXIS = new THREE.Vector3(1, 0, 0);
const STRIKE_END = 0.4;
const WOUND_UP_ANGLE = -2.0;
const IMPACT_ANGLE = 1.0;

function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Eased progress (0..1) through the swing: ease-in through the strike, smoothstep recovery. */
function swingEase(t: number): { phase: 'strike' | 'recovery'; localT: number } {
  if (t < STRIKE_END) {
    const localT = t / STRIKE_END;
    return { phase: 'strike', localT: localT * localT };
  }
  const localT = (t - STRIKE_END) / (1 - STRIKE_END);
  return { phase: 'recovery', localT: localT * localT * (3 - 2 * localT) };
}

export function CharacterMesh({ character }: { character: CharacterProfile }) {
  const groupRef = useRef<THREE.Group>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const accent = CLASS_ACCENT[character.character_class];
  const baseY = character.position_y;

  const characterGltf = useGLTF(CHARACTER_MODEL[character.character_class]);
  const weaponGltf = useGLTF(WEAPON_MODEL[character.character_class]);
  const generalGltf = useGLTF(RIG_GENERAL);
  const movementGltf = useGLTF(RIG_MOVEMENT);

  const scene = useMemo(() => cloneSkeleton(characterGltf.scene), [characterGltf.scene]);
  const weaponScene = useMemo(() => cloneSkeleton(weaponGltf.scene), [weaponGltf.scene]);
  const clips = useMemo(
    () => [...generalGltf.animations, ...movementGltf.animations],
    [generalGltf.animations, movementGltf.animations],
  );

  const { actions } = useAnimations(clips, scene);
  const currentAction = useRef<string | null>(null);

  // The sword arm is driven two ways at once: THREE's own mixer plays Idle_A/Walking_A on
  // it like every other bone, and then — only while a swing is active — we override its
  // quaternion afterward in our own useFrame (which runs after useAnimations' internal
  // mixer.update, since that hook is called first in this component). windUp/impactQuat
  // are snapshotted relative to restQuat (the arm's live idle/walk pose, kept up to date
  // every non-attacking frame below) at the moment a swing starts, so the strike always
  // winds up from and recovers back to whatever the mixer actually has the arm doing —
  // never a hardcoded pose that could fight or desync from it.
  const swingBoneRef = useRef<THREE.Object3D | null>(null);
  const restQuat = useRef(new THREE.Quaternion());
  const windUpQuat = useRef(new THREE.Quaternion());
  const impactQuat = useRef(new THREE.Quaternion());

  function playAction(name: string) {
    if (currentAction.current === name) return;
    const next = actions[name];
    if (!next) return;
    const prevName = currentAction.current;
    next.reset().fadeIn(MOVE_FADE_SEC).play();
    if (prevName) actions[prevName]?.fadeOut(MOVE_FADE_SEC);
    currentAction.current = name;
  }

  useEffect(() => {
    // GLTFLoader strips dots from node names, so the source rig's "handslot.r"/"upperarm.r"
    // bones come through as "handslotr"/"upperarmr".
    const hand = scene.getObjectByName('handslotr');
    hand?.add(weaponScene);
    swingBoneRef.current = scene.getObjectByName('upperarmr') ?? null;
    if (swingBoneRef.current) restQuat.current.copy(swingBoneRef.current.quaternion);
    return () => {
      hand?.remove(weaponScene);
    };
  }, [scene, weaponScene]);

  useEffect(() => {
    if (!modelGroupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    modelGroupRef.current.scale.setScalar(scale);
  }, [scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });
  }, [scene]);

  const keysDown = useRef<Set<string>>(new Set());
  const facing = useRef(0);
  const attackAnimUntil = useRef(0);

  const player = useCombatStore((s) => s.player);
  const attackNearest = useCombatStore((s) => s.attackNearest);

  function beginSwing() {
    attackAnimUntil.current = performance.now() + ATTACK_DURATION_MS;
    windUpQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, WOUND_UP_ANGLE));
    impactQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, IMPACT_ANGLE));
  }

  useEffect(() => {
    playerPosition.set(character.position_x, character.position_y, character.position_z);

    function attack() {
      const result = attackNearest(playerPosition.x, playerPosition.z);
      if (result.hit) beginSwing();
    }

    function onKeyDown(e: KeyboardEvent) {
      const ui = useUIStore.getState();
      if (ui.isMapOpen || ui.isCharacterPanelOpen || ui.isShopOpen) return;
      if (e.code === 'Space') {
        e.preventDefault();
        // Context-sensitive like most action-RPGs: talking to a nearby NPC takes priority
        // over attacking (village has no monsters anyway, so this never actually competes).
        if (ui.nearShopKind) {
          useUIStore.getState().openShop(ui.nearShopKind);
        } else {
          attack();
        }
        return;
      }
      if (MOVE_KEYS[e.code]) {
        keysDown.current.add(e.code);
        clearMoveTarget();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keysDown.current.delete(e.code);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const ui = useUIStore.getState();
    if (ui.isMapOpen || ui.isCharacterPanelOpen || ui.isShopOpen) return;

    let dx = 0;
    let dz = 0;
    for (const code of keysDown.current) {
      const dir = MOVE_KEYS[code];
      if (!dir) continue;
      dx += dir[0];
      dz += dir[1];
    }
    const usingKeyboard = Math.hypot(dx, dz) > 0.0001;

    if (!usingKeyboard && moveTarget.point) {
      const toTargetX = moveTarget.point.x - playerPosition.x;
      const toTargetZ = moveTarget.point.z - playerPosition.z;
      const dist = Math.hypot(toTargetX, toTargetZ);
      if (dist > ARRIVE_EPSILON) {
        dx = toTargetX / dist;
        dz = toTargetZ / dist;
      } else {
        moveTarget.point = null;
      }
    }

    const moveLen = Math.hypot(dx, dz);
    const isMoving = moveLen > 0.0001;
    if (isMoving) {
      dx /= moveLen;
      dz /= moveLen;
      const resolved = resolveMovement(
        playerPosition.x,
        playerPosition.z,
        dx * MOVE_SPEED * delta,
        dz * MOVE_SPEED * delta,
        PLAYER_COLLISION_RADIUS,
      );
      playerPosition.x = resolved.x;
      playerPosition.z = resolved.z;
      const radius = Math.hypot(playerPosition.x, playerPosition.z);
      if (radius > MAX_RADIUS) {
        playerPosition.x = (playerPosition.x / radius) * MAX_RADIUS;
        playerPosition.z = (playerPosition.z / radius) * MAX_RADIUS;
      }
      const targetFacing = Math.atan2(dx, dz);
      facing.current += shortestAngleDelta(facing.current, targetFacing) * Math.min(1, delta * 12);
    }

    if (!usingKeyboard && !moveTarget.point && moveTarget.attackTargetId !== null) {
      const result = attackNearest(playerPosition.x, playerPosition.z);
      if (result.hit) {
        beginSwing();
        if (result.killed || result.instanceId !== moveTarget.attackTargetId) {
          moveTarget.attackTargetId = null;
        }
      }
    }

    groupRef.current.position.x = playerPosition.x;
    groupRef.current.position.z = playerPosition.z;
    groupRef.current.position.y = baseY;
    groupRef.current.rotation.y = facing.current;

    isMoving ? playAction('Walking_A') : playAction('Idle_A');

    const attackRemaining = attackAnimUntil.current - performance.now();
    if (swingBoneRef.current) {
      if (attackRemaining > 0) {
        const t = Math.min(1, 1 - attackRemaining / ATTACK_DURATION_MS);
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
    <group ref={groupRef} position={[character.position_x, baseY, character.position_z]}>
      <group ref={modelGroupRef}>
        <primitive object={scene} />
      </group>
      <NameTag position={[0, TARGET_HEIGHT + 0.35, 0]} label={`${character.name} Lv.${player.level}`} accent={accent} />
      <HealthBar position={[0, TARGET_HEIGHT + 0.15, 0]} ratio={player.currentHp / player.maxHp} color="#57c25b" />
    </group>
  );
}

useGLTF.preload(RIG_GENERAL);
useGLTF.preload(RIG_MOVEMENT);
Object.values(CHARACTER_MODEL).forEach((url) => useGLTF.preload(url));
Object.values(WEAPON_MODEL).forEach((url) => useGLTF.preload(url));
