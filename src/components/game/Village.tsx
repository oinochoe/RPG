import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useCobblestoneTexture } from './proceduralTextures';
import type { Collider } from './worldColliders';
import { NPC } from './NPC';

// Kept in sync with the exclusion box in worldColliders.ts (VILLAGE_CLEAR_X/Z) so rocks
// never spawn inside these buildings. Exported so WorldMap.tsx can highlight this same area.
export const VILLAGE_CENTER: [number, number] = [-32, 0];
export const VILLAGE_SIZE = 22;
const PLAZA_SIZE = VILLAGE_SIZE;

// Shop NPCs — exported so ShopProximity.tsx can check the player's distance to them
// (and which one) without duplicating these coordinates. Each kind sells a different
// item_type slice of the catalog (see characters.ts's /me/shop route): 대장장이 (blacksmith)
// sells weapon/armor, 상인 (merchant) sells everything else (consumables etc., none seeded
// yet, so their shop is genuinely empty for now rather than faked).
export type ShopNpcKind = 'merchant' | 'blacksmith';

export const SHOP_NPCS: { kind: ShopNpcKind; name: string; position: [number, number] }[] = [
  { kind: 'merchant', name: '상인', position: [VILLAGE_CENTER[0] + 7, VILLAGE_CENTER[1] - 3] },
  { kind: 'blacksmith', name: '대장장이', position: [VILLAGE_CENTER[0] - 7, VILLAGE_CENTER[1] - 3] },
];
export const SHOP_INTERACT_RADIUS = 2.5;

// KayKit's Medieval Hexagon Pack models are modeled at roughly a 1-unit hex-tile scale;
// this brings them up to match our character height (TARGET_HEIGHT 0.9 in CharacterMesh) —
// buildings are still meant to tower over characters, just not fill the whole screen.
const BUILDING_SCALE = 1.6;

interface BuildingDef {
  model: string;
  // Half-width/half-depth of the model's own bounding box (pre-scale), used to size its
  // collider — see the accessor min/max values read from each .gltf file.
  footprint: [number, number];
  offset: [number, number];
  rotationY?: number;
}

const BUILDINGS: BuildingDef[] = [
  {
    model: '/models/kaykit-medieval/Assets/gltf/buildings/blue/building_blacksmith_blue.gltf',
    footprint: [0.66, 0.63],
    offset: [-7, -6],
  },
  {
    model: '/models/kaykit-medieval/Assets/gltf/buildings/red/building_market_red.gltf',
    footprint: [0.9, 0.71],
    offset: [7, -6],
  },
  {
    model: '/models/kaykit-medieval/Assets/gltf/buildings/blue/building_home_A_blue.gltf',
    footprint: [0.4, 0.47],
    offset: [-7, 6],
    rotationY: Math.PI,
  },
  {
    model: '/models/kaykit-medieval/Assets/gltf/buildings/red/building_home_B_red.gltf',
    footprint: [0.44, 0.55],
    offset: [7, 6],
    rotationY: Math.PI,
  },
  {
    model: '/models/kaykit-medieval/Assets/gltf/buildings/blue/building_tavern_blue.gltf',
    footprint: [0.6, 0.7],
    offset: [0, 8.5],
    rotationY: Math.PI,
  },
];

export const villageColliders: Collider[] = [
  { x: VILLAGE_CENTER[0], z: VILLAGE_CENTER[1], radius: 1.4 }, // fountain
  ...BUILDINGS.map((b) => ({
    x: VILLAGE_CENTER[0] + b.offset[0],
    z: VILLAGE_CENTER[1] + b.offset[1],
    radius: Math.max(b.footprint[0], b.footprint[1]) * BUILDING_SCALE * 1.15,
  })),
];

function Building({ building }: { building: BuildingDef }) {
  const gltf = useGLTF(building.model);
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
    <group
      position={[VILLAGE_CENTER[0] + building.offset[0], 0, VILLAGE_CENTER[1] + building.offset[1]]}
      rotation={[0, building.rotationY ?? 0, 0]}
      scale={BUILDING_SCALE}
    >
      <primitive object={scene} />
    </group>
  );
}

function Fountain() {
  return (
    <group position={[VILLAGE_CENTER[0], 0, VILLAGE_CENTER[1]]}>
      <mesh receiveShadow castShadow position={[0, 0.25, 0]}>
        <cylinderGeometry args={[1.3, 1.4, 0.5, 20]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.15, 20]} />
        <meshStandardMaterial color="#6fa8d6" roughness={0.2} metalness={0.1} emissive="#2a5f8a" emissiveIntensity={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.7, 10]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.6} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color="#bfe3ff" intensity={0.4} distance={5} />
    </group>
  );
}

/**
 * The village plaza — just decoration + colliders, rendered unconditionally alongside the
 * field as one continuous walkable world (no scene swap / teleport; you walk there).
 */
export function Village() {
  const cobbleTexture = useCobblestoneTexture();

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[VILLAGE_CENTER[0], 0.005, VILLAGE_CENTER[1]]}
        receiveShadow
      >
        <planeGeometry args={[PLAZA_SIZE, PLAZA_SIZE]} />
        <meshStandardMaterial map={cobbleTexture} roughness={0.95} metalness={0} />
      </mesh>

      <Fountain />

      <Suspense fallback={null}>
        {BUILDINGS.map((building, i) => (
          <Building key={i} building={building} />
        ))}
        {SHOP_NPCS.map((npc) => (
          <NPC key={npc.kind} position={[npc.position[0], 0, npc.position[1]]} name={npc.name} kind={npc.kind} />
        ))}
      </Suspense>
    </group>
  );
}

BUILDINGS.forEach((b) => useGLTF.preload(b.model));
