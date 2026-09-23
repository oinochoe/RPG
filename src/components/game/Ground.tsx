import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useGrassTexture, useSandTexture, useWaterTexture } from './proceduralTextures';
import { setMoveTarget } from './moveTarget';
import { useCombatStore } from '../../stores/combatStore';
import {
  scatterDecorations,
  scatterTrees,
  scatterDesertProps,
  rockColliders,
  treeColliders,
  desertPropColliders,
  riverColliders,
  activeColliders,
  RIVER_X_CENTER,
  RIVER_HALF_WIDTH,
  DESERT_X_START,
  DESERT_X_END,
  riverXAt,
  type Decoration,
  type TreeKind,
  type DesertPropKind,
} from './worldColliders';
import { Village, villageColliders } from './Village';
import { CaveEntrance } from './CaveEntrance';
import { FieldNpcs } from './FieldNpcs';

// A bit larger than worldColliders.ts's FIELD_EXTENT (400) so the visible grass plane
// extends past the walkable/decorated area instead of ending in a visible hard edge.
const GROUND_SIZE = 960;
// The desert patch and river strip are drawn as their own planes layered just above the
// grass (see the Y offsets below) rather than trying to make one texture biome-aware —
// simplest way to get a hard, deliberate edge between zones with the same
// canvas-texture-per-material approach every other surface in this game already uses.
// Fixed to the desert's own logical bounds (not GROUND_SIZE-derived) so the sand patch
// doesn't visually bleed into 구울 평원, which starts right where the desert ends.
const DESERT_WIDTH = DESERT_X_END - DESERT_X_START;

const KENNEY_NATURE = '/models/kenney-nature';
const TREE_MODEL: Record<TreeKind, string> = {
  pineTallA: `${KENNEY_NATURE}/tree_pineTallA.glb`,
  pineTallB: `${KENNEY_NATURE}/tree_pineTallB.glb`,
  pineRoundA: `${KENNEY_NATURE}/tree_pineRoundA.glb`,
  pineRoundB: `${KENNEY_NATURE}/tree_pineRoundB.glb`,
  oak: `${KENNEY_NATURE}/tree_oak.glb`,
  default: `${KENNEY_NATURE}/tree_default.glb`,
};
const DESERT_PROP_MODEL: Record<DesertPropKind, string> = {
  cactusTall: `${KENNEY_NATURE}/cactus_tall.glb`,
  cactusShort: `${KENNEY_NATURE}/cactus_short.glb`,
  palm: `${KENNEY_NATURE}/tree_palm.glb`,
  palmBend: `${KENNEY_NATURE}/tree_palmBend.glb`,
  rockTall: `${KENNEY_NATURE}/rock_tallA.glb`,
};
const BRIDGE_MODEL = `${KENNEY_NATURE}/bridge_wood.glb`;
// bridge_wood.glb's own bounding box (read from the GLB's accessor min/max, same technique
// used to size the other Kenney assets) is 1.04×0.4×1.04 — a single repeatable deck module,
// not a one-piece span. Placed just once at the old scale it only covered ~3.3 units, leaving
// it looking like a disconnected plank dropped in the middle of a much wider river instead of
// actually joining both banks. Tiled across the crossing instead, like the dungeon's floor
// tiles.
const BRIDGE_SCALE = 3.2;
// bridge_wood.glb's mesh Y range is [0, 0.4] (its node also carries its own -0.05
// translation) — scaling that uniformly by BRIDGE_SCALE the way x/z needs to be for the
// footprint to tile across the river turned a 0.4-unit-tall deck into a 1.28-unit-tall one,
// nearly 1.5x the player's own ~0.9-unit model height (see CharacterMesh's TARGET_HEIGHT) —
// exactly the "the bridge is floating, doesn't feel like walking on it" look, since the
// player's own Y never rises to meet it (movement is flat, no per-tile elevation). Scaling
// height on its own, much less aggressively, keeps the footprint fix without the deck
// towering over the character it's supposed to be walked on by.
const BRIDGE_Y_SCALE = 0.25;
const BRIDGE_SEGMENT_SPAN = 1.04 * BRIDGE_SCALE;
// Reaches a bit past the waterline onto solid ground on each side so the deck visibly meets
// the bank instead of ending right at the water's edge.
const BRIDGE_BANK_OVERLAP = 2.5;
const BRIDGE_HALF_SPAN = RIVER_HALF_WIDTH + BRIDGE_BANK_OVERLAP;
const BRIDGE_SEGMENT_COUNT = Math.ceil((BRIDGE_HALF_SPAN * 2) / BRIDGE_SEGMENT_SPAN) + 1;
const BRIDGE_SEGMENT_OFFSETS = Array.from({ length: BRIDGE_SEGMENT_COUNT }, (_, i) =>
  BRIDGE_SEGMENT_COUNT === 1 ? 0 : -BRIDGE_HALF_SPAN + (i * (BRIDGE_HALF_SPAN * 2)) / (BRIDGE_SEGMENT_COUNT - 1),
);

function Rocks({ decorations }: { decorations: Decoration[] }) {
  const rocks = useMemo(() => decorations.filter((d) => d.kind === 'rock'), [decorations]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    rocks.forEach((rock, i) => {
      dummy.position.set(rock.position[0], rock.scale * 0.18, rock.position[2]);
      dummy.rotation.set(0, rock.rotationY, 0);
      dummy.scale.setScalar(rock.scale * 0.3);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [rocks]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rocks.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#7c7566" roughness={0.95} flatShading />
    </instancedMesh>
  );
}

function GrassTufts({ decorations }: { decorations: Decoration[] }) {
  const tufts = useMemo(() => decorations.filter((d) => d.kind === 'tuft'), [decorations]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    tufts.forEach((tuft, i) => {
      dummy.position.set(tuft.position[0], tuft.scale * 0.25, tuft.position[2]);
      dummy.rotation.set(0, tuft.rotationY, 0);
      dummy.scale.set(tuft.scale * 0.5, tuft.scale, tuft.scale * 0.5);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [tufts]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tufts.length]} castShadow>
      <coneGeometry args={[0.22, 0.5, 5]} />
      <meshStandardMaterial color="#5fae4a" roughness={0.75} flatShading />
    </instancedMesh>
  );
}

/** Generic static (non-rigged) prop clone — same pattern as Village.tsx's Building and
 * Dungeon.tsx's DungeonProp, just under a new name since this file has its own scatter data. */
function NatureProp({
  url,
  position,
  rotationY = 0,
  scale = 1,
}: {
  url: string;
  position: [number, number, number];
  rotationY?: number;
  // A tuple lets a caller stretch footprint (x/z) without also stretching height (y) — see
  // the bridge's own call site, where a uniform scale used to blow its deck height up to
  // well above the player's own model height (see BRIDGE_Y_SCALE's comment).
  scale?: number | [number, number, number];
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

function DesertPatch() {
  const sandTexture = useSandTexture();
  return (
    <mesh
      position={[DESERT_X_START + DESERT_WIDTH / 2, 0.01, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[DESERT_WIDTH, GROUND_SIZE]} />
      <meshStandardMaterial map={sandTexture} roughness={1} metalness={0} />
    </mesh>
  );
}

const RIVER_SEGMENTS = 90;
// Bank-shadow gradient (vertex colors, multiplied onto the water texture) — brightest at the
// centerline, darker toward each edge, so the strip doesn't read as one flat uniform slab.
const RIVER_CENTER_TINT = new THREE.Color(1, 1, 1);
const RIVER_BANK_TINT = new THREE.Color(0.55, 0.62, 0.68);
const RIVER_FLOW_SPEED = 0.1;

/** A straight plane can't follow worldColliders.ts's riverXAt() meander, so this builds a
 * ribbon strip by hand: 3 vertices per cross-section (left bank, center, right bank) at each
 * z-step, sampling riverXAt(z) for the centerline. UVs match planeGeometry's own convention
 * (u 0..1 across width, v 0..1 along length) so the water texture's existing repeat.set(6, 22)
 * still tiles the same way it did on the old flat plane. */
function buildRiverGeometry(): THREE.BufferGeometry {
  const half = GROUND_SIZE / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= RIVER_SEGMENTS; i++) {
    const t = i / RIVER_SEGMENTS;
    const z = -half + t * half * 2;
    const cx = riverXAt(z);
    positions.push(cx - RIVER_HALF_WIDTH, 0, z, cx, 0, z, cx + RIVER_HALF_WIDTH, 0, z);
    uvs.push(0, t, 0.5, t, 1, t);
    colors.push(
      RIVER_BANK_TINT.r, RIVER_BANK_TINT.g, RIVER_BANK_TINT.b,
      RIVER_CENTER_TINT.r, RIVER_CENTER_TINT.g, RIVER_CENTER_TINT.b,
      RIVER_BANK_TINT.r, RIVER_BANK_TINT.g, RIVER_BANK_TINT.b,
    );
  }

  for (let i = 0; i < RIVER_SEGMENTS; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    // Left-center and center-right quads, each split into 2 triangles wound to face +Y.
    indices.push(a, b, a + 1, b, b + 1, a + 1);
    indices.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function RiverStrip() {
  const waterTexture = useWaterTexture();
  const geometry = useMemo(() => buildRiverGeometry(), []);

  // A tiled static texture alone still reads as flat — scrolling its V offset over time gives
  // the water an actual sense of current instead of just noise, which a straight plane image
  // (real tile or not) could never provide on its own.
  useFrame((_, delta) => {
    waterTexture.offset.y -= delta * RIVER_FLOW_SPEED;
  });

  return (
    <mesh position={[0, 0.02, 0]} geometry={geometry}>
      <meshStandardMaterial
        map={waterTexture}
        vertexColors
        roughness={0.3}
        metalness={0.1}
        transparent
        opacity={0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function Ground() {
  const grassTexture = useGrassTexture();
  const decorations = useMemo(() => scatterDecorations(), []);
  const trees = useMemo(() => scatterTrees(), []);
  const desertProps = useMemo(() => scatterDesertProps(), []);

  useEffect(() => {
    activeColliders.list = [...rockColliders, ...treeColliders, ...desertPropColliders, ...riverColliders, ...villageColliders];
  }, []);

  function handleGroundClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    // Clicking empty ground while a skill is armed isn't a valid target — cancel the aim
    // instead of also walking there, so backing out of targeting doesn't send the player
    // wandering off toward wherever they clicked to cancel.
    if (useCombatStore.getState().armedSkillId !== null) {
      useCombatStore.getState().cancelAimSkill();
      return;
    }
    setMoveTarget(event.point.x, event.point.z);
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={handleGroundClick}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial map={grassTexture} roughness={0.9} metalness={0} />
      </mesh>
      <DesertPatch />
      <RiverStrip />
      <Rocks decorations={decorations} />
      <GrassTufts decorations={decorations} />

      <Suspense fallback={null}>
        {trees.map((tree, i) => (
          <NatureProp
            key={`tree-${i}`}
            url={TREE_MODEL[tree.kind]}
            position={tree.position}
            rotationY={tree.rotationY}
            scale={tree.scale}
          />
        ))}
        {desertProps.map((prop, i) => (
          <NatureProp
            key={`desert-${i}`}
            url={DESERT_PROP_MODEL[prop.kind]}
            position={prop.position}
            rotationY={prop.rotationY}
            scale={prop.scale}
          />
        ))}
        {BRIDGE_SEGMENT_OFFSETS.map((offset, i) => (
          <NatureProp
            key={`bridge-${i}`}
            url={BRIDGE_MODEL}
            position={[RIVER_X_CENTER + offset, 0.05, 0]}
            scale={[BRIDGE_SCALE, BRIDGE_Y_SCALE, BRIDGE_SCALE]}
          />
        ))}
      </Suspense>

      <Village />
      <CaveEntrance />
      <FieldNpcs />
    </group>
  );
}

Object.values(TREE_MODEL).forEach((url) => useGLTF.preload(url));
Object.values(DESERT_PROP_MODEL).forEach((url) => useGLTF.preload(url));
useGLTF.preload(BRIDGE_MODEL);
