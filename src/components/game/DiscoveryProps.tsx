import { Suspense, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DISCOVERIES, type DiscoveryDef, type PropPreset } from './discoveries';
import { selectRenderable, selectTriggered } from './discoveryRender';
import { zoneAt } from './discoveryZones';
import { getToonGradient } from './toon';
import { NPC } from './NPC';
import { cameraZoomFor } from './CameraRig';
import { clickToTalk } from './interactions';
import { playerPosition } from './playerTransform';
import { useWorldStore } from '../../stores/worldStore';
import { useUIStore } from '../../stores/uiStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import { useCombatStore } from '../../stores/combatStore';

const CHECK_INTERVAL_S = 0.5;
// Triggers have small radii; a fast player could cross one between two 0.5s samples, so they get a faster check.
const TRIGGER_INTERVAL_S = 0.1;
// Minimum radius of the tap area on screen, in CSS pixels (same idea as NPC.tsx).
const HIT_RADIUS_PX = 26;
const HIT_HEIGHT = 1.6;

// Shared geometries (module-level, never disposed — meshes using them set dispose={null}).
const ROCK_GEO = new THREE.DodecahedronGeometry(0.7, 0);
const POST_GEO = new THREE.CylinderGeometry(0.07, 0.09, 1.4, 6);
const BOARD_GEO = new THREE.BoxGeometry(0.9, 0.35, 0.08);
const PIT_GEO = new THREE.CircleGeometry(0.9, 20);
const PIT_RIM_GEO = new THREE.TorusGeometry(0.95, 0.09, 6, 20);
const CAP_GEO = new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const STEM_GEO = new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6);
const PLINTH_GEO = new THREE.BoxGeometry(1, 0.35, 1);
const PILLAR_GEO = new THREE.CylinderGeometry(0.28, 0.34, 1.2, 8);
const ORB_GEO = new THREE.SphereGeometry(0.3, 10, 8);
const GLOW_GEO = new THREE.SphereGeometry(0.2, 8, 6);
const HIT_GEO_CACHE = new Map<number, THREE.CylinderGeometry>();

function Toon({ color }: { color: string }) {
  return <meshToonMaterial color={color} gradientMap={getToonGradient()} />;
}

const MUSHROOM_SPOTS: [number, number, number, string][] = [
  [0, 0, 1, '#c0392b'],
  [0.4, 0.15, 0.8, '#e8b04a'],
  [-0.35, 0.2, 0.9, '#c0392b'],
  [0.05, -0.38, 0.7, '#d98c5f'],
];

function Mushrooms() {
  return (
    <>
      {MUSHROOM_SPOTS.map(([x, z, s, cap], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <mesh geometry={STEM_GEO} position={[0, 0.125, 0]} dispose={null} castShadow>
            <Toon color="#efe6d2" />
          </mesh>
          <mesh geometry={CAP_GEO} position={[0, 0.25, 0]} dispose={null} castShadow>
            <Toon color={cap} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function PropMesh({ preset }: { preset: PropPreset }) {
  switch (preset) {
    case 'rock':
      return (
        <mesh geometry={ROCK_GEO} position={[0, 0.45, 0]} scale={[1.1, 0.8, 0.95]} rotation={[0.3, 0.6, 0.1]} dispose={null} castShadow receiveShadow>
          <Toon color="#7d7a72" />
        </mesh>
      );
    case 'signpost':
      return (
        <>
          <mesh geometry={POST_GEO} position={[0, 0.7, 0]} dispose={null} castShadow>
            <Toon color="#7a5230" />
          </mesh>
          <mesh geometry={BOARD_GEO} position={[0.1, 1.15, 0]} rotation={[0, 0, 0.05]} dispose={null} castShadow>
            <Toon color="#b88a54" />
          </mesh>
        </>
      );
    case 'pit':
      return (
        <>
          <mesh geometry={PIT_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} dispose={null} receiveShadow>
            <Toon color="#15120f" />
          </mesh>
          <mesh geometry={PIT_RIM_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} dispose={null}>
            <Toon color="#6b5a45" />
          </mesh>
        </>
      );
    case 'mushrooms':
      return <Mushrooms />;
    case 'sparkle':
      return (
        <mesh geometry={GLOW_GEO} position={[0, 0.5, 0]} dispose={null}>
          <meshBasicMaterial color="#fff2a8" toneMapped={false} />
        </mesh>
      );
    case 'statue':
      return (
        <>
          <mesh geometry={PLINTH_GEO} position={[0, 0.175, 0]} dispose={null} castShadow receiveShadow>
            <Toon color="#8f8b82" />
          </mesh>
          <mesh geometry={PILLAR_GEO} position={[0, 0.95, 0]} dispose={null} castShadow>
            <Toon color="#a9a499" />
          </mesh>
          <mesh geometry={ORB_GEO} position={[0, 1.8, 0]} dispose={null} castShadow>
            <Toon color="#a9a499" />
          </mesh>
        </>
      );
    default:
      return null;
  }
}

/** Small pulsing diamond over an unseen, non-hidden discovery: a sprite (always faces the camera), no light, no particles. */
function HintSparkle({ y, phase }: { y: number; phase: number }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    const s = ref.current;
    if (!s) return;
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3 + phase);
    s.scale.setScalar(0.18 + 0.22 * k);
    (s.material as THREE.SpriteMaterial).opacity = 0.25 + 0.75 * k;
  });
  return (
    <sprite ref={ref} position={[0, y, 0]} renderOrder={5}>
      <spriteMaterial color="#fff2a8" rotation={Math.PI / 4} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function hitGeometry(radius: number): THREE.CylinderGeometry {
  const key = Math.round(radius * 10);
  let g = HIT_GEO_CACHE.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(key / 10, key / 10, HIT_HEIGHT, 8);
    HIT_GEO_CACHE.set(key, g);
  }
  return g;
}

function PropDiscovery({ def, seen }: { def: DiscoveryDef; seen: boolean }) {
  const viewportWidth = useThree((s) => s.size.width);
  const screenRadius = HIT_RADIUS_PX / cameraZoomFor(viewportWidth);
  const hitRadius = Math.max(0.8, def.radius * 0.6, screenRadius);
  const [x, z] = def.position;
  const showHint = !seen && !def.hidden;
  return (
    <group position={[x, 0, z]}>
      <PropMesh preset={def.prop} />
      {showHint && <HintSparkle y={def.prop === 'statue' ? 2.5 : 1.6} phase={x * 0.37 + z * 0.11} />}
      {/* Invisible, generous tap target: tapping a prop walks over and inspects it. */}
      <mesh
        visible={false}
        geometry={hitGeometry(hitRadius)}
        position={[0, HIT_HEIGHT / 2, 0]}
        dispose={null}
        onClick={(event) => {
          event.stopPropagation();
          clickToTalk({ type: 'discovery', id: def.id }, def.position);
        }}
      >
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

/** Draws the discovery props and hidden NPCs near the player (recomputed twice a second) and fires `trigger`
 * discoveries when the player first walks into them. Nothing in the dungeon. */
export function DiscoveryProps() {
  const inDungeon = useWorldStore((s) => s.currentArea === 'dungeon');
  const seen = useDiscoveryStore((s) => s.seen);
  const [ids, setIds] = useState<string[]>([]);
  const acc = useRef(CHECK_INTERVAL_S); // evaluate on the first frame
  const idsKey = useRef('');
  const fired = useRef(new Set<string>());
  const triggerAcc = useRef(TRIGGER_INTERVAL_S);
  const triggerDefs = useMemo(() => DISCOVERIES.filter((d) => d.kind === 'trigger'), []);

  useFrame((_, delta) => {
    if (inDungeon) return;
    const ctx = () => ({
      level: useCombatStore.getState().player.level,
      seen: useDiscoveryStore.getState().seen,
      zoneAt,
    });
    triggerAcc.current += delta;
    if (triggerAcc.current >= TRIGGER_INTERVAL_S) {
      triggerAcc.current = 0;
      for (const d of selectTriggered(triggerDefs, playerPosition.x, playerPosition.z, ctx(), fired.current)) {
        fired.current.add(d.id);
        useUIStore.getState().openDiscovery(d.id);
      }
    }
    acc.current += delta;
    if (acc.current < CHECK_INTERVAL_S) return;
    acc.current = 0;
    const next = selectRenderable(DISCOVERIES, playerPosition.x, playerPosition.z, ctx()).map((d) => d.id);
    const key = next.join('|');
    if (key !== idsKey.current) {
      idsKey.current = key;
      setIds(next);
    }
  });

  if (inDungeon || ids.length === 0) return null;
  const idSet = new Set(ids);
  return (
    <>
      {DISCOVERIES.filter((d) => idSet.has(d.id)).map((d) =>
        d.kind === 'npc' && d.npcKind ? (
          <Suspense key={d.id} fallback={null}>
            <NPC position={[d.position[0], 0, d.position[1]]} name={d.name} kind={d.npcKind} talk={{ type: 'discovery', id: d.id }} />
          </Suspense>
        ) : (
          <PropDiscovery key={d.id} def={d} seen={seen.has(d.id)} />
        ),
      )}
    </>
  );
}
