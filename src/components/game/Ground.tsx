import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
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
  type Decoration,
  type TreeKind,
  type DesertPropKind,
} from './worldColliders';
import { Village, villageColliders } from './Village';
import { CaveEntrance } from './CaveEntrance';

// A bit larger than worldColliders.ts's FIELD_EXTENT (400) so the visible grass plane
// extends past the walkable/decorated area instead of ending in a visible hard edge.
const GROUND_SIZE = 460;
const FIELD_HALF = GROUND_SIZE / 2;
// The desert patch and river strip are drawn as their own planes layered just above the
// grass (see the Y offsets below) rather than trying to make one texture biome-aware —
// simplest way to get a hard, deliberate edge between zones with the same
// canvas-texture-per-material approach every other surface in this game already uses.
const DESERT_WIDTH = FIELD_HALF - DESERT_X_START;

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
  scale?: number;
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

function RiverStrip() {
  const waterTexture = useWaterTexture();
  return (
    <mesh position={[RIVER_X_CENTER, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[RIVER_HALF_WIDTH * 2, GROUND_SIZE]} />
      <meshStandardMaterial map={waterTexture} roughness={0.3} metalness={0.1} transparent opacity={0.92} />
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
    if (useCombatStore.getState().isAimingSkill) {
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
        <NatureProp url={BRIDGE_MODEL} position={[RIVER_X_CENTER, 0.05, 0]} scale={3.2} />
      </Suspense>

      <Village />
      <CaveEntrance />
    </group>
  );
}

Object.values(TREE_MODEL).forEach((url) => useGLTF.preload(url));
Object.values(DESERT_PROP_MODEL).forEach((url) => useGLTF.preload(url));
useGLTF.preload(BRIDGE_MODEL);
