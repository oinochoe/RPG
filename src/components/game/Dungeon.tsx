import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { setMoveTarget } from './moveTarget';
import { useCombatStore } from '../../stores/combatStore';
import {
  DUNGEON_META,
  ROOM_HALF_X,
  ROOM_HALF_Z,
  floorTilesFromOpenCells,
  getEntryTrigger,
  getExitTrigger,
  getFloorRects,
  getFloorRoomList,
  rasterize,
  roomColumnOffsets,
  roomTorchOffsets,
  wallsFromOpenCells,
  type DungeonId,
} from './dungeonLayout';

// Re-exported so existing 3D-side importers keep working; the stores import dungeonLayout directly.
export * from './dungeonLayout';

// KayKit Dungeon Pack — every structural piece (wall/wall_doorway/floor_tile_large) is
// modeled on a 4-unit grid (see each .gltf's own bounding box: width 4, height 4, depth 1 for
// walls; 4x4 for floor tiles).
const KAYKIT_DUNGEON = '/models/kaykit-dungeon/Assets/gltf';
const WALL_MODEL = `${KAYKIT_DUNGEON}/wall.gltf`;
const FLOOR_TILE_MODEL = `${KAYKIT_DUNGEON}/floor_tile_large.gltf`;
const COLUMN_MODEL = `${KAYKIT_DUNGEON}/column.gltf`;
const TORCH_MODEL = `${KAYKIT_DUNGEON}/torch_lit.gltf`;
// A full flight (its own bounding box: 4×5.1×4 at scale 1 — every stairs_* variant in this
// pack is the same ~5.1 tall, built for connecting two actual floor levels), used here purely
// as a decorative "this leads somewhere" silhouette next to FloorMarker's glow effect — this
// dungeon has no real elevation (every floor is its own flat instance, see worldStore.ts), so
// it's scaled well down rather than rendered at the grid's real 1:1 scale.
const STAIRS_MODEL = `${KAYKIT_DUNGEON}/stairs_narrow.gltf`;
const STAIRS_SCALE = 0.4;

/** Generic static (non-rigged) KayKit prop — matches Village.tsx's Building component. */
function DungeonProp({
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

function Torch({ position }: { position: [number, number] }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <DungeonProp url={TORCH_MODEL} position={[0, 0.4, 0]} />
      <pointLight position={[0, 1.4, 0]} color="#ff9a3c" intensity={1.4} distance={9} />
    </group>
  );
}

// A flat, dim, opacity-0.35 ground disc with a weak (intensity 0.5) point light used to read
// as "very hard to notice" in the dungeon's own dark ambient/fog (see Scene.tsx's isDungeon
// branch — ambientLight 0.12, fog starting at 14 units) — this is the actual transition
// trigger's only visual, so missing it meant walking past a floor change with zero warning.
// Rebuilt as a much louder "portal" language instead: a bright double ring plus a translucent
// light beam rising straight up, unmistakable through fog from well outside DUNGEON_EXIT_
// RADIUS/DUNGEON_DESCEND_RADIUS (1.8), backed by a much stronger point light.
function FloorMarker({ position, color }: { position: [number, number]; color: string }) {
  const innerRingRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = t * 0.6;
      innerRingRef.current.scale.setScalar(1 + Math.sin(t * 1.8) * 0.08);
    }
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 2.2) * 0.1;
    }
  });

  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.0, 1.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={innerRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.5, 0.65, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={beamRef} position={[0, 2, 0]}>
        <cylinderGeometry args={[0.12, 0.4, 4, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color={color} intensity={1.8} distance={8} />
      {/* Purely decorative — sits just outside the trigger radius so it never blocks the
          actual walk-in check, see DUNGEON_EXIT_RADIUS/DUNGEON_DESCEND_RADIUS (both 1.8). Its
          own Suspense boundary since FloorMarker renders outside the floor's main one. */}
      <Suspense fallback={null}>
        <DungeonProp url={STAIRS_MODEL} position={[0, 0, 1.6]} rotationY={Math.PI} scale={STAIRS_SCALE} />
      </Suspense>
    </group>
  );
}

/**
 * A self-contained dungeon floor — a genuinely separate instance (unlike the village), so it
 * reuses near-origin coordinates freely for every floor, even across different dungeons (see
 * DUNGEON_META/worldColliders.ts's DUNGEON_ENTRANCES for the 4 dungeons this now renders — they
 * never load at once, so sharing coordinate space is invisible). A chain of rooms (3-5, see
 * FLOOR_PLANS, a shared shape pool every dungeon draws from) linked by winding corridors, a
 * different shape per floor; the entry doorway always leads back toward the field (floor 1) or
 * up a floor, the exit doorway (present on every floor but this dungeon's own last one) leads
 * one floor deeper. See worldStore.ts for the actual floor-swapping logic, and getFloorRects()
 * above for the shape.
 */
export function Dungeon({ dungeonId, floor }: { dungeonId: DungeonId; floor: number }) {
  const maxFloor = DUNGEON_META[dungeonId].maxFloor;
  const hasExit = floor < maxFloor;
  const open = useMemo(() => rasterize(getFloorRects(floor, maxFloor)), [floor, maxFloor]);
  const walls = useMemo(() => wallsFromOpenCells(open), [open]);
  const floorTiles = useMemo(() => floorTilesFromOpenCells(open), [open]);
  const rooms = useMemo(() => getFloorRoomList(floor), [floor]);
  const entryTrigger = useMemo(() => getEntryTrigger(floor), [floor]);
  const exitTrigger = useMemo(() => getExitTrigger(floor, maxFloor), [floor, maxFloor]);

  function handleFloorClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    // See Ground.tsx's handleGroundClick for why this cancels instead of also moving.
    if (useCombatStore.getState().armedSkillId !== null) {
      useCombatStore.getState().cancelAimSkill();
      return;
    }
    setMoveTarget(event.point.x, event.point.z);
  }

  return (
    <group>
      {/* Invisible click-to-move plane, sized to the whole floor's bounding box (a bit more
          than any single room needs, but harmless — clicks outside the actual walkable area
          just resolve against the wall colliders like normal) — the real floor visuals are
          the floor_tile_large instances below, but those are Suspense-boundary GLTF loads and
          shouldn't gate click-to-move working immediately on floor entry. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleFloorClick}
        visible={false}
        position={[0, 0, (rooms[0].z1 + rooms[rooms.length - 1].z2) / 2]}
      >
        <planeGeometry args={[ROOM_HALF_X * 2, ROOM_HALF_Z * 2]} />
      </mesh>

      <Suspense fallback={null}>
        {floorTiles.map(([x, z], i) => (
          <DungeonProp key={`floor-${i}`} url={FLOOR_TILE_MODEL} position={[x, 0, z]} />
        ))}

        {walls.map((w, i) => (
          <DungeonProp key={`wall-${i}`} url={WALL_MODEL} position={[w.x, 0, w.z]} rotationY={w.rotationY} />
        ))}

        {rooms.flatMap((room, ri) =>
          roomColumnOffsets(room).map(([x, z], i) => (
            <DungeonProp key={`column-${ri}-${i}`} url={COLUMN_MODEL} position={[x, 0, z]} />
          )),
        )}

        {rooms.flatMap((room, ri) =>
          roomTorchOffsets(room).map((pos, i) => <Torch key={`torch-${ri}-${i}`} position={pos} />),
        )}
      </Suspense>

      <FloorMarker position={entryTrigger} color="#bcdcf0" />
      {hasExit && exitTrigger && <FloorMarker position={exitTrigger} color="#c084fc" />}
    </group>
  );
}

useGLTF.preload(WALL_MODEL);
useGLTF.preload(FLOOR_TILE_MODEL);
useGLTF.preload(COLUMN_MODEL);
useGLTF.preload(TORCH_MODEL);
useGLTF.preload(STAIRS_MODEL);
