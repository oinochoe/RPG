import { VILLAGES, type Collider } from './worldColliders';

// Village building layout + colliders — plain data with no three.js, so worldStore can use
// villageColliders without pulling the 3D bundle in. Village.tsx renders from these.

// KayKit's Medieval Hexagon Pack models are modeled at roughly a 1-unit hex-tile scale;
// this brings them up to match our character height (TARGET_HEIGHT 0.9 in CharacterMesh) —
// buildings are still meant to tower over characters, just not fill the whole screen.
export const BUILDING_SCALE = 1.6;

export interface BuildingDef {
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
export const VILLAGE_BUILDINGS: BuildingDef[] = [
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

export const villageColliders: Collider[] = VILLAGES.flatMap((zone) => [
  { x: zone.center[0], z: zone.center[1], radius: 1.4 }, // fountain
  ...VILLAGE_BUILDINGS.map((b) => ({
    x: zone.center[0] + b.offset[0],
    z: zone.center[1] + b.offset[1],
    radius: Math.max(b.footprint[0], b.footprint[1]) * BUILDING_SCALE * 1.15,
  })),
]);
