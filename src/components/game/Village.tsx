import { Suspense, useEffect, useMemo } from 'react';
import { getToonGradient } from './toon';
import { useGLTF } from './toonGLTF';
import * as THREE from 'three';
import { useCobblestoneTexture } from './proceduralTextures';
import { VILLAGES, type VillageZone } from './worldColliders';
import { NPC, type NpcKind } from './NPC';
import { BUILDING_SCALE, VILLAGE_BUILDINGS, villageColliders, type BuildingDef } from './villageLayout';

export { villageColliders };

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
      // Ties into quest 1's own hookText ("매일 새벽 강가에 꽃을 놓고 오네") — a washerwoman by
      // the river fits 새벽여울's own dawn-river theme better than another generic villager.
      { kind: 'elder', name: '빨래하는 아낙', offset: [4, 3], facingY: Math.PI / 4 },
    ],
    props: [
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [-9.5, -9], scale: 1.1 },
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [9.5, -9], scale: 1.1 },
      { model: `${KENNEY_TOWN}/stall.glb`, offset: [-9, 6], scale: 1.1, rotationY: Math.PI / 2 },
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
      // Stands by the windmill prop below — gives it someone tending it rather than just
      // sitting there as scenery.
      { kind: 'elder', name: '방앗간지기', offset: [10, 3], facingY: -Math.PI / 3 },
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
      // Decorative — 북녘등불 sits closest to the desert crossing, so a trader passing through
      // fits better than another watch-themed NPC.
      { kind: 'villager', name: '사막 상인', offset: [4, 4], facingY: -Math.PI / 4 },
    ],
    props: [
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [-3, -9.5], scale: 1.1 },
      { model: `${KENNEY_TOWN}/lantern.glb`, offset: [3, -9.5], scale: 1.1 },
      { model: `${KENNEY_TOWN}/stall.glb`, offset: [9, 6], scale: 1.1, rotationY: Math.PI / 2 },
    ],
  },
];

// villageIndex lets ShopPanel.tsx tell which village's 대장장이 the player actually walked up
// to — all 3 villages reuse the exact same NPC names ("상인"/"대장장이"), so name alone can't
// distinguish them the way it does for the quest-giving flavor NPCs (each of those has a
// unique name).
export const SHOP_NPCS: { kind: ShopNpcKind; name: string; position: [number, number]; villageIndex: number }[] =
  VILLAGES.flatMap((zone, i) =>
    VILLAGE_CONFIGS[i].shopNpcs.map((npc) => ({
      kind: npc.kind,
      name: npc.name,
      position: [zone.center[0] + npc.offset[0], zone.center[1] + npc.offset[1]] as [number, number],
      villageIndex: i,
    })),
  );

export const SHOP_INTERACT_RADIUS = 2.5;

// Real user request: "마을마다 파는 품목도 달라야겠지?" — each village's 대장장이 carries a
// different band of the gear catalog's own required_level tiers (see ShopPanel.tsx), so
// leveling up gives a real reason to visit the other two villages instead of every blacksmith
// selling the identical full catalog. Bands overlap at their edges (10-15, 20-25) rather than
// cutting hard at each tier breakpoint, so a character isn't stranded with literally nothing
// to buy while between two villages' ranges. 새벽여울 is the starting village (lowest band);
// 상인 (potions/scrolls) is deliberately NOT tiered this way — see ShopPanel's own comment for
// why consumables stay available everywhere.
export const VILLAGE_BLACKSMITH_LEVEL_RANGE: [number, number][] = [
  [1, 15], // 새벽여울
  [10, 25], // 황금이삭
  [20, 30], // 북녘등불 — 30 is the top of the purchasable catalog; Lv35 is boss-exclusive drop-only
];

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
        <meshToonMaterial color="#9aa3ad" gradientMap={getToonGradient()} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.15, 20]} />
        <meshToonMaterial color="#6fa8d6" emissive="#2a5f8a" emissiveIntensity={0.2} gradientMap={getToonGradient()} />
      </mesh>
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.7, 10]} />
        <meshToonMaterial color="#9aa3ad" gradientMap={getToonGradient()} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color="#bfe3ff" intensity={0.4} distance={5} />
    </group>
  );
}

function VillagePlaza({ zone, config, villageIndex }: { zone: VillageZone; config: VillageConfig; villageIndex: number }) {
  const cobbleTexture = useCobblestoneTexture();

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[zone.center[0], 0.005, zone.center[1]]} receiveShadow>
        <planeGeometry args={[zone.size, zone.size]} />
        <meshToonMaterial map={cobbleTexture} gradientMap={getToonGradient()} />
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
            talk={{ type: 'shop', kind: npc.kind, villageIndex }}
          />
        ))}
        {config.flavorNpcs.map((npc, i) => (
          <NPC
            key={i}
            position={[zone.center[0] + npc.offset[0], 0, zone.center[1] + npc.offset[1]]}
            name={npc.name}
            kind={npc.kind}
            facingY={npc.facingY}
            talk={{ type: 'quest', name: npc.name }}
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
        <VillagePlaza key={i} zone={zone} config={VILLAGE_CONFIGS[i]} villageIndex={i} />
      ))}
    </group>
  );
}

VILLAGE_BUILDINGS.forEach((b) => useGLTF.preload(b.model));
VILLAGE_CONFIGS.forEach((cfg) => cfg.props?.forEach((p) => useGLTF.preload(p.model)));
