import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useCobblestoneTexture } from './proceduralTextures';
import { VILLAGES, type Collider, type VillageZone } from './worldColliders';
import { NPC, type NpcKind } from './NPC';

// Re-exported for callers that only care about "the first/main village" (WorldMap.tsx now
// loops over every village instead, but PositionSync-style callers elsewhere may still want
// a single default). Kept as a plain re-export rather than duplicating the literal.
export const VILLAGE_CENTER = VILLAGES[0].center;
export const VILLAGE_SIZE = VILLAGES[0].size;

// Shop NPCs — exported so ShopProximity.tsx can check the player's distance to them
// (and which one) without duplicating these coordinates. Each kind sells a different
// item_type slice of the catalog (see characters.ts's /me/shop route): 대장장이 (blacksmith)
// sells weapon/armor, 상인 (merchant) sells everything else. Both villages sell the same
// catalog per kind — this is "another one of these NPCs is closer," not a second shop.
export type ShopNpcKind = 'merchant' | 'blacksmith';

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

// The only 5 building models actually downloaded from the KayKit Medieval Hexagon pack (see
// public/models/kaykit-medieval) — both villages reuse this same set rather than needing a
// second building style, since sourcing more (the itch.io-only KayKit forest/town packs
// aren't fetchable by URL the way Kenney.nl is) wasn't worth the risk for what's otherwise
// just architectural variety. They're told apart by layout, NPCs, and props instead.
const VILLAGE_BUILDINGS: BuildingDef[] = [
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

interface FlavorNpcDef {
  kind: NpcKind;
  name: string;
  offset: [number, number];
  facingY?: number;
}

interface PropDef {
  model: string;
  offset: [number, number];
  scale?: number;
  rotationY?: number;
}

interface VillageConfig {
  name: string;
  shopNpcs: { kind: ShopNpcKind; name: string; offset: [number, number] }[];
  flavorNpcs: FlavorNpcDef[];
  props?: PropDef[];
}

const KENNEY_TOWN = '/models/kenney-town';

export const VILLAGE_CONFIGS: VillageConfig[] = [
  {
    // The starting town — "Dawn Shallows," a quiet river-side beginning.
    name: '새벽여울',
    shopNpcs: [
      { kind: 'merchant', name: '상인', offset: [7, -3] },
      { kind: 'blacksmith', name: '대장장이', offset: [-7, -3] },
    ],
    flavorNpcs: [
      { kind: 'villager', name: '촌장', offset: [0, 4], facingY: Math.PI },
      // Decorative only (no quest written for this name — QuestPanel already handles that
      // gracefully with "지금은 특별히 부탁할 일이 없네") — every other village already had 2
      // flavor NPCs, this one only had 1.
      { kind: 'townsman', name: '여관 주인', offset: [-4, 3] },
    ],
  },
  {
    // A second town further south — same building set, different NPCs/props (market stalls,
    // a lantern, a windmill) so it doesn't just read as a copy-pasted village. "Golden Grain,"
    // for the windmill/farmer theme.
    name: '황금이삭',
    shopNpcs: [
      { kind: 'merchant', name: '상인', offset: [7, -3] },
      { kind: 'blacksmith', name: '대장장이', offset: [-7, -3] },
    ],
    flavorNpcs: [
      { kind: 'villager', name: '농부', offset: [-4, 3] },
      { kind: 'townsman', name: '경비병', offset: [4, 3], facingY: Math.PI },
    ],
    props: [
      { model: `${KENNEY_TOWN}/stall.glb`, offset: [3, 2], scale: 1.1 },
      { model: `${KENNEY_TOWN}/stall-red.glb`, offset: [-3, 2], scale: 1.1, rotationY: Math.PI },
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [-9, -9], scale: 1 },
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [9, -9], scale: 1 },
      { model: `${KENNEY_TOWN}/windmill.glb`, offset: [13, 5], scale: 1.3, rotationY: Math.PI / 4 },
    ],
  },
  {
    // A third town up north — same building set again, told apart by its watchpost framing
    // (lanterns flanking the entrance, no windmill/stalls) and its own flavor NPCs. "Northern
    // Lantern," matching the lantern-flanked entrance.
    name: '북녘등불',
    shopNpcs: [
      { kind: 'merchant', name: '상인', offset: [7, -3] },
      { kind: 'blacksmith', name: '대장장이', offset: [-7, -3] },
    ],
    flavorNpcs: [
      { kind: 'elder', name: '파수꾼', offset: [0, -10], facingY: Math.PI },
      { kind: 'townsman', name: '노인', offset: [-4, 4] },
    ],
    props: [
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [-3, -9.5], scale: 1.1 },
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [3, -9.5], scale: 1.1 },
      { model: `${KENNEY_TOWN}/stall.glb`, offset: [9, 6], scale: 1.1, rotationY: Math.PI / 2 },
    ],
  },
];

export const villageColliders: Collider[] = VILLAGES.flatMap((zone) => [
  { x: zone.center[0], z: zone.center[1], radius: 1.4 }, // fountain
  ...VILLAGE_BUILDINGS.map((b) => ({
    x: zone.center[0] + b.offset[0],
    z: zone.center[1] + b.offset[1],
    radius: Math.max(b.footprint[0], b.footprint[1]) * BUILDING_SCALE * 1.15,
  })),
]);

export const SHOP_NPCS: { kind: ShopNpcKind; name: string; position: [number, number] }[] = VILLAGES.flatMap(
  (zone, i) =>
    VILLAGE_CONFIGS[i].shopNpcs.map((npc) => ({
      kind: npc.kind,
      name: npc.name,
      position: [zone.center[0] + npc.offset[0], zone.center[1] + npc.offset[1]] as [number, number],
    })),
);

export const SHOP_INTERACT_RADIUS = 2.5;

// Flavor NPCs that double as quest givers (see questStore's findQuestByGiver, matched by
// name) — same flat-list shape as SHOP_NPCS, for QuestProximity.tsx to scan without knowing
// about VILLAGE_CONFIGS' per-village structure.
export const QUEST_NPCS: { name: string; position: [number, number] }[] = VILLAGES.flatMap((zone, i) =>
  VILLAGE_CONFIGS[i].flavorNpcs.map((npc) => ({
    name: npc.name,
    position: [zone.center[0] + npc.offset[0], zone.center[1] + npc.offset[1]] as [number, number],
  })),
);

export const QUEST_INTERACT_RADIUS = 2.5;

function Building({ zone, building }: { zone: VillageZone; building: BuildingDef }) {
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
      position={[zone.center[0] + building.offset[0], 0, zone.center[1] + building.offset[1]]}
      rotation={[0, building.rotationY ?? 0, 0]}
      scale={BUILDING_SCALE}
    >
      <primitive object={scene} />
    </group>
  );
}

function Prop({ zone, prop }: { zone: VillageZone; prop: PropDef }) {
  const gltf = useGLTF(prop.model);
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
      position={[zone.center[0] + prop.offset[0], 0, zone.center[1] + prop.offset[1]]}
      rotation={[0, prop.rotationY ?? 0, 0]}
      scale={prop.scale ?? 1}
    >
      <primitive object={scene} />
    </group>
  );
}

function Fountain({ zone }: { zone: VillageZone }) {
  return (
    <group position={[zone.center[0], 0, zone.center[1]]}>
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

function VillagePlaza({ zone, config }: { zone: VillageZone; config: VillageConfig }) {
  const cobbleTexture = useCobblestoneTexture();

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[zone.center[0], 0.005, zone.center[1]]} receiveShadow>
        <planeGeometry args={[zone.size, zone.size]} />
        <meshStandardMaterial map={cobbleTexture} roughness={0.95} metalness={0} />
      </mesh>

      <Fountain zone={zone} />

      <Suspense fallback={null}>
        {VILLAGE_BUILDINGS.map((building, i) => (
          <Building key={i} zone={zone} building={building} />
        ))}
        {config.shopNpcs.map((npc) => (
          <NPC
            key={npc.kind}
            position={[zone.center[0] + npc.offset[0], 0, zone.center[1] + npc.offset[1]]}
            name={npc.name}
            kind={npc.kind}
          />
        ))}
        {config.flavorNpcs.map((npc, i) => (
          <NPC
            key={i}
            position={[zone.center[0] + npc.offset[0], 0, zone.center[1] + npc.offset[1]]}
            name={npc.name}
            kind={npc.kind}
            facingY={npc.facingY}
          />
        ))}
        {config.props?.map((prop, i) => <Prop key={i} zone={zone} prop={prop} />)}
      </Suspense>
    </group>
  );
}

/**
 * Every village plaza — just decoration + colliders, rendered unconditionally alongside the
 * field as one continuous walkable world (no scene swap / teleport; you walk there).
 */
export function Village() {
  return (
    <group>
      {VILLAGES.map((zone, i) => (
        <VillagePlaza key={i} zone={zone} config={VILLAGE_CONFIGS[i]} />
      ))}
    </group>
  );
}

VILLAGE_BUILDINGS.forEach((b) => useGLTF.preload(b.model));
VILLAGE_CONFIGS.forEach((cfg) => cfg.props?.forEach((p) => useGLTF.preload(p.model)));
