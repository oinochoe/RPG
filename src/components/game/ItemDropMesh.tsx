import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { NameTag } from './NameTag';
import { playerPosition, triggerPickupAnim } from './playerTransform';
import { setLootMoveTarget } from './moveTarget';
import { useLootStore, pickupDrop, PICKUP_RADIUS, DROP_TTL_MS, type WorldDrop } from '../../stores/lootStore';

const KAYKIT_ROOT = '/models/kaykit/Assets/gltf';
const KAYKIT_WEAPONS = '/models/kaykit-weapons/Assets/gltf';
const KAYKIT_DUNGEON = '/models/kaykit-dungeon/Assets/gltf';

interface DropModelConfig {
  url: string;
  // World-unit size the model's largest bounding-box dimension is scaled to fit — same
  // auto-fit idea as NPC.tsx's TARGET_HEIGHT, just normalized on the largest axis instead of
  // just height, since these models aren't all upright humanoids.
  targetSize: number;
  glowColor: string;
}

// One visual per item_template_id (see item_templates' seed data). Weapons reuse the exact
// same model files CharacterMesh.tsx renders in-hand (its own WEAPON_MODEL/
// WEAPON_MODEL_BY_NAME) so a dropped weapon looks like the weapon you'd actually equip.
// Everything else pulls from the already-downloaded kaykit-dungeon prop set (bottles/chest)
// or the new Quaternius scroll (see public/models/quaternius-scroll/License.txt) — there's
// no per-item bespoke model for the two body-armor items (천리안의 로브/가죽 조끼), so both
// fall back to the dungeon chest prop as a generic "gear" shape.
export const DROP_MODEL_BY_ITEM: Record<number, DropModelConfig> = {
  1: { url: `${KAYKIT_ROOT}/sword_1handed.gltf`, targetSize: 0.8, glowColor: '#c9d6e3' },
  3: { url: `${KAYKIT_ROOT}/staff.gltf`, targetSize: 0.9, glowColor: '#c9d6e3' },
  5: { url: `${KAYKIT_ROOT}/bow_withString.gltf`, targetSize: 0.8, glowColor: '#c9d6e3' },
  9: { url: `${KAYKIT_WEAPONS}/sword_D.gltf`, targetSize: 0.85, glowColor: '#ffd54a' },
  10: { url: `${KAYKIT_WEAPONS}/staff_B.gltf`, targetSize: 0.95, glowColor: '#ffd54a' },
  11: { url: `${KAYKIT_WEAPONS}/bow_B_withString.gltf`, targetSize: 0.85, glowColor: '#ffd54a' },
  2: { url: `${KAYKIT_WEAPONS}/shield_A.gltf`, targetSize: 0.5, glowColor: '#c9d6e3' },
  4: { url: `${KAYKIT_DUNGEON}/chest.gltf`, targetSize: 0.45, glowColor: '#c9d6e3' },
  6: { url: `${KAYKIT_DUNGEON}/chest.gltf`, targetSize: 0.45, glowColor: '#c9d6e3' },
  7: { url: `${KAYKIT_DUNGEON}/bottle_A_green.gltf`, targetSize: 0.3, glowColor: '#7be08a' },
  8: { url: `${KAYKIT_DUNGEON}/bottle_B_green.gltf`, targetSize: 0.32, glowColor: '#2bd66f' },
  12: { url: `${KAYKIT_DUNGEON}/bottle_A_brown.gltf`, targetSize: 0.3, glowColor: '#7ec8ff' },
  13: { url: `${KAYKIT_DUNGEON}/bottle_B_brown.gltf`, targetSize: 0.32, glowColor: '#3a9bff' },
  14: { url: '/models/quaternius-scroll/Scroll.glb', targetSize: 0.35, glowColor: '#ffd54a' },
  15: { url: '/models/quaternius-scroll/Scroll.glb', targetSize: 0.35, glowColor: '#c084fc' },
};

// Every item_template_id added after the original 15-item starter set (46-item catalog
// expansion, enchant scrolls, boss gear, 초록 물약, gems/materials — 50+ ids) had no entry
// above, and `if (!config) return null` made the drop render literally nothing: no model, no
// glow ring, no click hitbox — real user report: "던젼에서 가끔 떨어진 아이템이 안보이는데."
// Rather than hand-authoring 50+ more per-ID entries, this falls back to a shape already
// loaded for the drop's own itemType (see lootStore's DropTableEntry) whenever there's no
// specific entry, so nothing can ever be fully invisible again, present or future.
const CATEGORY_FALLBACK: Record<import('../../stores/lootStore').DropItemType, DropModelConfig> = {
  weapon: { url: `${KAYKIT_ROOT}/sword_1handed.gltf`, targetSize: 0.8, glowColor: '#c9d6e3' },
  armor: { url: `${KAYKIT_DUNGEON}/chest.gltf`, targetSize: 0.45, glowColor: '#c9d6e3' },
  consumable: { url: `${KAYKIT_DUNGEON}/bottle_A_green.gltf`, targetSize: 0.3, glowColor: '#7be08a' },
  scroll: { url: '/models/quaternius-scroll/Scroll.glb', targetSize: 0.35, glowColor: '#ffd54a' },
  misc: { url: `${KAYKIT_DUNGEON}/chest.gltf`, targetSize: 0.3, glowColor: '#e8c97a' },
};

const BOB_HEIGHT = 0.08;
const BOB_BASE_Y = 0.25;
const BOB_SPEED = 2.2;
const SPIN_SPEED = 1.1;

function DropModel({ config }: { config: DropModelConfig }) {
  const gltf = useGLTF(config.url);

  // Computed once, synchronously, on a still-unparented clone — Box3.setFromObject reads
  // world matrices, and measuring AFTER this clone was already mounted under drop.position's
  // group (e.g. via a useEffect) picked up that offset as if it were the model's own local
  // bounds, then re-applied it as a further LOCAL position on top of the same offset. That
  // silently shoved the actual mesh away from its own glow ring/nametag (which don't get this
  // treatment) — usually just far enough to read as "nothing rendered here but the label."
  // Measuring here, before any parent transform exists, keeps world space == local space.
  const { scene, scale, offset } = useMemo(() => {
    const cloned = gltf.scene.clone();
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const largest = Math.max(size.x, size.y, size.z);
    const modelScale = largest > 0 ? config.targetSize / largest : 1;
    const center = new THREE.Vector3();
    box.getCenter(center);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
    return {
      scene: cloned,
      scale: modelScale,
      // Re-centers so the model's own pivot (often not at its visual center, e.g. a weapon
      // rigged around a hand-grip point) doesn't put it half underground or floating — in
      // the model's own unscaled units, since this is applied to a <primitive> nested inside
      // the scaled group below (the parent's scale then applies to this offset too).
      offset: [-center.x, -box.min.y, -center.z] as [number, number, number],
    };
  }, [gltf.scene, config.targetSize]);

  return (
    <group scale={scale}>
      <primitive object={scene} position={offset} />
    </group>
  );
}

/** A monster drop lying in the world — bobs and spins in place with a colored glow ring
 * underneath (see DROP_MODEL_BY_ITEM) so it reads clearly against grass/dungeon floor from a
 * distance, and self-despawns once its TTL elapses (see lootStore's DROP_TTL_MS) rather than
 * needing a separate global ticker to sweep stale drops. */
export function ItemDropMesh({ drop }: { drop: WorldDrop }) {
  const config = DROP_MODEL_BY_ITEM[drop.itemTemplateId] ?? CATEGORY_FALLBACK[drop.itemType];
  const bobRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const expiredRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  useFrame(({ clock }) => {
    if (expiredRef.current) return;
    if (performance.now() - drop.spawnedAt > DROP_TTL_MS) {
      expiredRef.current = true;
      useLootStore.getState().removeDrop(drop.id);
      return;
    }
    const t = clock.elapsedTime;
    if (bobRef.current) {
      bobRef.current.position.y = BOB_BASE_Y + Math.sin(t * BOB_SPEED + drop.id) * BOB_HEIGHT;
      bobRef.current.rotation.y = t * SPIN_SPEED;
    }
    if (glowRef.current) {
      const pulse = 0.55 + Math.sin(t * 2.4 + drop.id) * 0.15;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  // Clicking a drop already within pickup range grabs it immediately — same "click acts
  // instantly if already in range" shape as MonsterMesh's own click handler — otherwise it's
  // a walk-then-pick-up like any other click-to-move-then-act target (see moveTarget.ts's
  // lootTargetId, consumed by CharacterMesh's own useFrame block on arrival).
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const dx = playerPosition.x - drop.position[0];
    const dz = playerPosition.z - drop.position[2];
    if (Math.hypot(dx, dz) <= PICKUP_RADIUS) {
      pickupDrop(drop.id).then((ok) => {
        if (ok) triggerPickupAnim();
      });
    } else {
      setLootMoveTarget(drop.position[0], drop.position[2], drop.id);
    }
  }

  return (
    <group position={drop.position}>
      <mesh
        visible={false}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry args={[0.4, 0.4, 0.6, 8]} />
        <meshBasicMaterial />
      </mesh>
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.18, 0.38, 24]} />
        <meshBasicMaterial
          color={config.glowColor}
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group ref={bobRef}>
        <DropModel config={config} />
      </group>
      {/* Always-visible name tag would clutter the ground once several drops are out at
          once (up to lootStore's MAX_DROPS) — shown only on hover, same "the model itself
          is the primary visual" reasoning as not rendering one for every prop in the scene. */}
      {hovered && <NameTag position={[0, 0.55, 0]} label={drop.itemName} accent={config.glowColor} />}
    </group>
  );
}

Object.values(DROP_MODEL_BY_ITEM).forEach((c) => useGLTF.preload(c.url));
