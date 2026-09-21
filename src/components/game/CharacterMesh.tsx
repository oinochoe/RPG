import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { NameTag } from './NameTag';
import { HealthBar } from './HealthBar';
import { Projectile } from './Projectile';
import { FxSprite } from './FxSprite';
import { playerPosition } from './playerTransform';
import { moveTarget, clearMoveTarget } from './moveTarget';
import { resolveMovement } from './worldColliders';
import { OFFSET as CAMERA_OFFSET } from './CameraRig';
import { playSound, playFootstep } from '../../lib/sound';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
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

// Fallback when no weapon is equipped yet (a fresh character's starter weapon is granted
// unequipped — see create_character — so this covers "never equipped anything" too, not
// just a genuine empty-handed state).
const WEAPON_MODEL: Record<CharacterProfile['character_class'], string> = {
  warrior: '/models/kaykit/Assets/gltf/sword_1handed.gltf',
  mage: '/models/kaykit/Assets/gltf/staff.gltf',
  archer: '/models/kaykit/Assets/gltf/bow_withString.gltf',
};

const KAYKIT_WEAPONS = '/models/kaykit-weapons/Assets/gltf';

// Maps an equipped weapon's item_name (item_templates has no dedicated "which 3D model"
// column, so this is the client-side equivalent of one — same pattern as
// combatStore.ts's SKILL_BY_CLASS duplicating skill_templates rather than fetching it) to
// the specific model that should render in the character's hand. Starter weapons map to the
// same files WEAPON_MODEL already used, so equipping one is a visual no-op; the new
// purchasable upgrades (see migration 20260921040000) get a distinct, better-looking model.
const WEAPON_MODEL_BY_NAME: Record<string, string> = {
  '녹슨 검': WEAPON_MODEL.warrior,
  '나무 지팡이': WEAPON_MODEL.mage,
  '나무 활': WEAPON_MODEL.archer,
  '강철 검': `${KAYKIT_WEAPONS}/sword_D.gltf`,
  '대현자의 지팡이': `${KAYKIT_WEAPONS}/staff_B.gltf`,
  '사냥꾼의 장궁': `${KAYKIT_WEAPONS}/bow_B_withString.gltf`,
};

const RIG_GENERAL = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_General.glb';
const RIG_MOVEMENT = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb';

const TARGET_HEIGHT = 0.9;
const ATTACK_DURATION_MS = 300;
const MOVE_FADE_SEC = 0.15;
const MOVE_SPEED = 6;
const PLAYER_COLLISION_RADIUS = 0.4;
const FOOTSTEP_INTERVAL_MS = 320;
// Overall playable boundary (field + village combined) — LightRig follows the player, so
// this no longer needs to fit inside a fixed shadow frustum, just the decorated ground itself.
// Matches worldColliders.ts's FIELD_EXTENT/2 (300/2=150) and scatterDesertProps' own radius
// clamp, so the desert biome's far edge is (mostly) reachable rather than fenced off by a
// tighter movement boundary than what decorations were actually scattered out to.
const MAX_RADIUS = 150;
const ARRIVE_EPSILON = 0.15;

// The camera sits at a fixed diagonal offset (CameraRig's OFFSET, e.g. (18,16,18)) rather
// than straight overhead, so "up" on screen isn't world -Z and "right" isn't world +X —
// pressing A/left needs to move the character toward screen-left, not diagonally, the same
// way Lineage-style angled cameras handle movement. Derive that screen basis from the same
// offset CameraRig uses, instead of hardcoding the resulting ~45° rotation, so the two stay
// in sync if the camera angle ever changes.
const CAMERA_FORWARD_X = -CAMERA_OFFSET.x;
const CAMERA_FORWARD_Z = -CAMERA_OFFSET.z;
const CAMERA_FORWARD_LEN = Math.hypot(CAMERA_FORWARD_X, CAMERA_FORWARD_Z) || 1;
const FORWARD: [number, number] = [CAMERA_FORWARD_X / CAMERA_FORWARD_LEN, CAMERA_FORWARD_Z / CAMERA_FORWARD_LEN];
const RIGHT: [number, number] = [-FORWARD[1], FORWARD[0]];

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: FORWARD,
  ArrowUp: FORWARD,
  KeyS: [-FORWARD[0], -FORWARD[1]],
  ArrowDown: [-FORWARD[0], -FORWARD[1]],
  KeyA: [-RIGHT[0], -RIGHT[1]],
  ArrowLeft: [-RIGHT[0], -RIGHT[1]],
  KeyD: RIGHT,
  ArrowRight: RIGHT,
};

const SWING_AXIS = new THREE.Vector3(1, 0, 0);
const STRIKE_END = 0.4;
const WOUND_UP_ANGLE = -2.0;
const IMPACT_ANGLE = 1.0;

// Ranged classes skip the melee swing and fire one of these instead (see handleAttackResult).
// Height roughly matches hand/chest level so the projectile visibly leaves the caster.
const PROJECTILE_VARIANT: Partial<Record<CharacterProfile['character_class'], 'arrow' | 'bolt'>> = {
  archer: 'arrow',
  mage: 'bolt',
};
const PROJECTILE_ORIGIN_HEIGHT = 0.75;
const PROJECTILE_DURATION_MS = 200;

// Per-class color for a skill's "화려한" flash/impact/projectile glow — deliberately not
// CLASS_ACCENT: 파이어볼 reads as fire regardless of mage's icy-blue UI accent, so these are
// their own palette themed to each skill's name/flavor rather than the class's UI color.
const SKILL_FX_COLOR: Record<CharacterProfile['character_class'], THREE.ColorRepresentation> = {
  warrior: '#ffcf5c',
  archer: '#eaffb0',
  mage: '#ff6a2b',
};
const SKILL_FLARE_TEXTURE = '/models/kaykit-spells/textures/flare_01.png';
const SKILL_IMPACT_TEXTURE = '/models/kaykit-spells/textures/impact_01.png';
const SKILL_CAST_FLASH_SIZE = 1.6;
const SKILL_CAST_FLASH_DURATION_MS = 300;
const SKILL_IMPACT_BURST_SIZE = 1.3;
const SKILL_IMPACT_BURST_DURATION_MS = 350;

// Ranged classes play a short draw/cast pose before the projectile actually leaves —
// beginDraw() below pulls the arm back over this whole duration, and the projectile is
// queued (not spawned) until it elapses, matching a real draw-then-release feel instead
// of firing instantly on input. Damage was already applied instantly inside
// attackNearest either way (see handleAttackResult) — this only delays the visual.
const RANGED_DRAW_DURATION_MS = 150;
const RANGED_DRAW_ANGLE = -1.3;

interface ActiveProjectile {
  id: number;
  from: [number, number, number];
  to: [number, number, number];
  variant: 'arrow' | 'bolt';
  isSkill: boolean;
}

interface PendingProjectile {
  from: [number, number, number];
  to: [number, number, number];
  variant: 'arrow' | 'bolt';
  isSkill: boolean;
}

// A skill cast spawns a flash at the caster the instant it lands, and — for a hit that also
// resolves immediately (melee, or a ranged projectile's arrival) — an impact burst at the
// target. Both are purely visual (FxSprite); see SKILL_FX_COLOR/SKILL_*_TEXTURE above.
interface SkillEffect {
  id: number;
  kind: 'flash' | 'impact';
  position: [number, number, number];
}

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

  // `character` (characterStore.activeCharacter) is a point-in-time snapshot from
  // character-select — its own .inventory doesn't update on equip/unequip (only the
  // separate characterStore.inventory field does; see InventoryPanel/equipItem). Reading
  // live inventory here, not character.inventory, so the held weapon actually tracks equip
  // state instead of being stuck at whatever was equipped at login.
  const liveInventory = useCharacterStore((s) => s.inventory);
  const equippedWeaponName = liveInventory.find((item) => item.is_equipped && item.equip_slot === 'weapon')?.item_name;
  const weaponModelUrl =
    (equippedWeaponName && WEAPON_MODEL_BY_NAME[equippedWeaponName]) || WEAPON_MODEL[character.character_class];

  const characterGltf = useGLTF(CHARACTER_MODEL[character.character_class]);
  const weaponGltf = useGLTF(weaponModelUrl);
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
  const nextFootstepAt = useRef(0);
  const attackAnimUntil = useRef(0);
  // How long the current override lasts and which pose shape it follows — melee's swing
  // (windUp -> impact -> rest, see swingEase) and ranged's draw (rest -> windUp, holding
  // until release) need different durations and interpolation, but share the same bone/
  // quat refs since only one attack animation ever plays at a time per character.
  const attackAnimDuration = useRef(ATTACK_DURATION_MS);
  const attackAnimMode = useRef<'melee' | 'ranged' | null>(null);
  // Set by handleAttackResult for archer/mage, consumed once the draw animation elapses
  // (see the useFrame block below) — this is what actually delays the projectile's spawn
  // until the release moment instead of firing it the instant the input happened.
  const pendingProjectile = useRef<PendingProjectile | null>(null);

  const player = useCombatStore((s) => s.player);
  const attackNearest = useCombatStore((s) => s.attackNearest);
  const castSkill = useCombatStore((s) => s.castSkill);
  const [projectiles, setProjectiles] = useState<ActiveProjectile[]>([]);
  const [skillEffects, setSkillEffects] = useState<SkillEffect[]>([]);
  const skillEffectIdRef = useRef(0);

  function spawnSkillEffect(kind: SkillEffect['kind'], position: [number, number, number]) {
    skillEffectIdRef.current += 1;
    setSkillEffects((prev) => [...prev, { id: skillEffectIdRef.current, kind, position }]);
  }

  function beginSwing() {
    attackAnimUntil.current = performance.now() + ATTACK_DURATION_MS;
    attackAnimDuration.current = ATTACK_DURATION_MS;
    attackAnimMode.current = 'melee';
    windUpQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, WOUND_UP_ANGLE));
    impactQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, IMPACT_ANGLE));
  }

  function beginDraw() {
    attackAnimUntil.current = performance.now() + RANGED_DRAW_DURATION_MS;
    attackAnimDuration.current = RANGED_DRAW_DURATION_MS;
    attackAnimMode.current = 'ranged';
    windUpQuat.current
      .copy(restQuat.current)
      .multiply(new THREE.Quaternion().setFromAxisAngle(SWING_AXIS, RANGED_DRAW_ANGLE));
  }

  // Shared by both attack entry points (Space key and click-to-move-then-attack below) so a
  // hit always resolves into the right class's basic-attack visual: warrior keeps the melee
  // swing, archer/mage play a short draw/cast pose and the projectile itself is queued to
  // spawn once that pose finishes (see the useFrame block). Damage itself was already
  // applied instantly inside attackNearest either way — only the visual is delayed.
  function handleAttackResult(result: ReturnType<typeof attackNearest>, isSkill = false) {
    if (!result.hit) return;
    playSound('swing', 0.4);
    if (isSkill) {
      playSound('cast', 0.45);
      spawnSkillEffect('flash', [playerPosition.x, baseY + PROJECTILE_ORIGIN_HEIGHT, playerPosition.z]);
    }
    if (result.killed && result.goldDropped) playSound('coin', 0.4);
    const variant = PROJECTILE_VARIANT[character.character_class];
    const monster = result.instanceId != null ? useCombatStore.getState().monsters[result.instanceId] : undefined;
    if (!variant) {
      beginSwing();
      playSound(isSkill ? 'hitHeavy' : 'hit', 0.5);
      // Melee has no travel time — the impact reads immediately, same moment the swing
      // itself starts (damage was already applied instantly by castSkill either way).
      if (isSkill && monster) {
        spawnSkillEffect('impact', [monster.position[0], monster.position[1] + PROJECTILE_ORIGIN_HEIGHT, monster.position[2]]);
      }
      return;
    }
    if (!monster) return;
    beginDraw();
    pendingProjectile.current = {
      from: [playerPosition.x, baseY + PROJECTILE_ORIGIN_HEIGHT, playerPosition.z],
      to: [monster.position[0], monster.position[1] + PROJECTILE_ORIGIN_HEIGHT, monster.position[2]],
      variant,
      isSkill,
    };
  }

  // Fires an actual cast once an armed skill lands on a clicked monster (see
  // MonsterMesh's handleClick, which calls requestCastSkill) — the request lives in
  // combatStore since that's what MonsterMesh can reach, but the cast itself has to happen
  // here: this is the only place with both the player's live position and the swing/draw
  // animation refs handleAttackResult needs. Skips the run that fires on mount
  // (the ref value at that point reflects whatever another character session left behind,
  // not a real request) the same way skillTabRequestId's watcher does in CharacterPanel.
  const castRequestId = useCombatStore((s) => s.castRequestId);
  const skipInitialCastRequest = useRef(true);
  useEffect(() => {
    if (skipInitialCastRequest.current) {
      skipInitialCastRequest.current = false;
      return;
    }
    const result = castSkill(playerPosition.x, playerPosition.z);
    handleAttackResult(result, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castRequestId]);

  useEffect(() => {
    playerPosition.set(character.position_x, character.position_y, character.position_z);

    function onKeyDown(e: KeyboardEvent) {
      const ui = useUIStore.getState();
      // Movement/attack deliberately keep working while a panel is open (character/
      // inventory/shop/system-menu are all small docked or draggable windows now, not
      // full-screen blockers, and WorldMap is a see-through overlay) — like most
      // action-RPGs, opening a stats/inventory/shop window doesn't pause play.
      if (e.code === 'Space') {
        e.preventDefault();
        // Interact-only now (NPC talk, and whatever else earns a context-sensitive prompt
        // later, e.g. a door) — no longer a manual attack button. Basic attack happens by
        // clicking a monster (see the click-to-target-then-auto-attack block below), same
        // as a skill now requires an explicit clicked target instead of firing at whatever's
        // nearest.
        if (ui.nearShopKind) {
          useUIStore.getState().openShop(ui.nearShopKind);
        }
        return;
      }
      if (e.code === 'KeyK') {
        e.preventDefault();
        // Opens the skill tab to register the skill onto a hotbar slot — like every other
        // game with a quickbar, casting itself happens by pressing the assigned slot (see
        // the castRequestId watcher below), not by this key directly anymore.
        useUIStore.getState().openSkillTab();
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
      const now = performance.now();
      if (now >= nextFootstepAt.current) {
        nextFootstepAt.current = now + FOOTSTEP_INTERVAL_MS;
        playFootstep();
      }
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
        handleAttackResult(result);
        if (result.killed || result.instanceId !== moveTarget.attackTargetId) {
          moveTarget.attackTargetId = null;
        }
      }
    }

    // Arrived at the standoff point an aimed-but-out-of-range skill click set (see
    // MonsterMesh's handleClick / setSkillMoveTarget) — fire exactly once, whether it
    // connects or not, rather than repeating every frame like the basic-attack block above.
    // A skill has its own cooldown/MP cost, so "walk over and auto-cast forever" isn't the
    // right behavior the way "walk over and auto-attack forever" is for a free basic attack.
    if (!usingKeyboard && !moveTarget.point && moveTarget.pendingSkillCast) {
      moveTarget.pendingSkillCast = false;
      const result = castSkill(playerPosition.x, playerPosition.z);
      handleAttackResult(result, true);
    }

    groupRef.current.position.x = playerPosition.x;
    groupRef.current.position.z = playerPosition.z;
    groupRef.current.position.y = baseY;
    groupRef.current.rotation.y = facing.current;

    isMoving ? playAction('Walking_A') : playAction('Idle_A');

    const attackRemaining = attackAnimUntil.current - performance.now();

    // The draw pose finishes exactly when attackRemaining hits zero — that's the release
    // moment, so the queued projectile spawns here rather than back when the attack input
    // happened. No-op for melee (pendingProjectile is only ever set by the ranged path).
    if (pendingProjectile.current && attackRemaining <= 0) {
      const p = pendingProjectile.current;
      pendingProjectile.current = null;
      setProjectiles((prev) => [...prev, { id: performance.now() + Math.random(), ...p }]);
    }

    if (swingBoneRef.current) {
      if (attackRemaining > 0) {
        const t = Math.min(1, 1 - attackRemaining / attackAnimDuration.current);
        if (attackAnimMode.current === 'ranged') {
          // Draw: ease from rest into the pulled-back pose and hold there until release —
          // no separate impact/recovery phase, the bone just snaps back to the mixer's
          // idle/walk pose on the very next frame once attackRemaining crosses zero.
          const eased = t * t * (3 - 2 * t);
          swingBoneRef.current.quaternion.slerpQuaternions(restQuat.current, windUpQuat.current, eased);
        } else {
          const { phase, localT } = swingEase(t);
          if (phase === 'strike') {
            swingBoneRef.current.quaternion.slerpQuaternions(windUpQuat.current, impactQuat.current, localT);
          } else {
            swingBoneRef.current.quaternion.slerpQuaternions(impactQuat.current, restQuat.current, localT);
          }
        }
      } else {
        // Not attacking: keep tracking the mixer's live idle/walk pose for this bone so the
        // next swing always winds up from (and recovers back to) wherever it actually is.
        restQuat.current.copy(swingBoneRef.current.quaternion);
        attackAnimMode.current = null;
      }
    }
  });

  return (
    <>
    {projectiles.map((p) => (
      <Projectile
        key={p.id}
        from={p.from}
        to={p.to}
        variant={p.variant}
        duration={PROJECTILE_DURATION_MS}
        skill={p.isSkill}
        color={SKILL_FX_COLOR[character.character_class]}
        onArrive={() => {
          setProjectiles((prev) => prev.filter((x) => x.id !== p.id));
          playSound(p.isSkill ? 'hitHeavy' : 'hit', 0.5);
          // A skill's projectile lands with an impact burst too, same as melee's instant
          // one — just delayed until travel actually finishes instead of firing at once.
          if (p.isSkill) spawnSkillEffect('impact', p.to);
        }}
      />
    ))}
    {skillEffects.map((fx) => (
      <FxSprite
        key={fx.id}
        position={fx.position}
        texturePath={fx.kind === 'flash' ? SKILL_FLARE_TEXTURE : SKILL_IMPACT_TEXTURE}
        color={SKILL_FX_COLOR[character.character_class]}
        size={fx.kind === 'flash' ? SKILL_CAST_FLASH_SIZE : SKILL_IMPACT_BURST_SIZE}
        duration={fx.kind === 'flash' ? SKILL_CAST_FLASH_DURATION_MS : SKILL_IMPACT_BURST_DURATION_MS}
        onDone={() => setSkillEffects((prev) => prev.filter((x) => x.id !== fx.id))}
      />
    ))}
    <group ref={groupRef} position={[character.position_x, baseY, character.position_z]}>
      <group ref={modelGroupRef}>
        <primitive object={scene} />
      </group>
      <NameTag position={[0, TARGET_HEIGHT + 0.35, 0]} label={character.name} accent={accent} />
      <HealthBar position={[0, TARGET_HEIGHT + 0.15, 0]} ratio={player.currentHp / player.maxHp} color="#57c25b" />
    </group>
    </>
  );
}

useGLTF.preload(RIG_GENERAL);
useGLTF.preload(RIG_MOVEMENT);
Object.values(CHARACTER_MODEL).forEach((url) => useGLTF.preload(url));
Object.values(WEAPON_MODEL_BY_NAME).forEach((url) => useGLTF.preload(url));
useTexture.preload(SKILL_FLARE_TEXTURE);
useTexture.preload(SKILL_IMPACT_TEXTURE);
