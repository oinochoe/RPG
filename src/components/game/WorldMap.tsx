import { useEffect, useMemo, useState } from 'react';
import { playerPosition, playerFacing } from './playerTransform';
import {
  FIELD_ENTRANCE_POINT,
  RIVER_X_CENTER,
  RIVER_HALF_WIDTH,
  DESERT_X_START,
  DESERT_X_END,
  OUTER_ZONE_BOUND,
  VILLAGES,
  FIELD_EXTENT,
  riverPathD,
} from './worldColliders';
import { VILLAGE_CONFIGS } from './Village';
import { DUNGEON_MAX_FLOOR, getEntryTrigger, getExitTrigger, ROOM_HALF_X, ROOM_HALF_Z, getFloorRects } from './Dungeon';
import { ICON_PATH, MapIcon, PlayerArrow } from './mapIcons';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

// Derived from FIELD_EXTENT (rather than a separately hand-tuned constant) plus a small margin
// so the map can never clip again just because the field grew — this used to be a bare number
// that drifted out of sync with worldColliders.ts's own FIELD_EXTENT.
const VIEW_HALF = FIELD_EXTENT / 2 + 10;
// Separate X/Z half-extents (not one reused value) since the dungeon floor plan is now a tall,
// narrow S-shape (3 rooms stacked along Z, connected by corridors) rather than a square room —
// a single shared "half" would either clip the tall axis or waste space on the narrow one.
const DUNGEON_VIEW_HALF_X = ROOM_HALF_X + 4;
const DUNGEON_VIEW_HALF_Z = ROOM_HALF_Z + 4;
const POLL_MS = 100;
// Computed once — VIEW_HALF is a module constant, so the visible window never changes.
const RIVER_PATH = riverPathD(-VIEW_HALF, VIEW_HALF);

/** Small decorative compass rose (replaces the old 4 plain edge-mounted letters) — a fixed
 * ornament in the map's corner, in the same world-coordinate space as everything else since
 * this SVG has no separate screen-space overlay layer. */
function CompassRose({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g opacity={0.9}>
      <circle cx={cx} cy={cy} r={r} fill="rgba(15, 25, 12, 0.4)" stroke="#e8c97a" strokeWidth={0.5} />
      <polygon
        points={`${cx},${cy - r * 0.72} ${cx + r * 0.2},${cy} ${cx},${cy + r * 0.72} ${cx - r * 0.2},${cy}`}
        fill="#e8c97a"
      />
      <polygon
        points={`${cx - r * 0.72},${cy} ${cx},${cy - r * 0.2} ${cx + r * 0.72},${cy} ${cx},${cy + r * 0.2}`}
        fill="rgba(232, 201, 122, 0.55)"
      />
      <circle cx={cx} cy={cy} r={r * 0.1} fill="#f4f1e8" />
      <text x={cx} y={cy - r - 1.3} fill="#e8c97a" fontSize={r * 0.5} textAnchor="middle" fontWeight={700}>
        N
      </text>
      <text x={cx} y={cy + r + r * 0.5 + 0.6} fill="#e8c97a" fontSize={r * 0.4} textAnchor="middle">
        S
      </text>
      <text x={cx - r - r * 0.35} y={cy + r * 0.35} fill="#e8c97a" fontSize={r * 0.4} textAnchor="middle">
        W
      </text>
      <text x={cx + r + r * 0.35} y={cy + r * 0.35} fill="#e8c97a" fontSize={r * 0.4} textAnchor="middle">
        E
      </text>
    </g>
  );
}

/** Double-line gold frame plus small corner flourishes — the parchment-map border, drawn in
 * the same world-space viewBox rather than as a CSS border, so it scales with the map.
 * Separate halfX/halfZ (rather than one shared half) since the dungeon map's viewBox isn't
 * square. */
function MapFrame({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const inset1 = 2;
  const inset2 = 5;
  const corner = 10;
  const corners: [number, number][] = [
    [-halfX + inset2, -halfZ + inset2],
    [halfX - inset2, -halfZ + inset2],
    [-halfX + inset2, halfZ - inset2],
    [halfX - inset2, halfZ - inset2],
  ];
  return (
    <g>
      <rect
        x={-halfX + inset1}
        y={-halfZ + inset1}
        width={(halfX - inset1) * 2}
        height={(halfZ - inset1) * 2}
        fill="none"
        stroke="#e8c97a"
        strokeWidth={1.4}
        rx={4}
        opacity={0.85}
      />
      <rect
        x={-halfX + inset2}
        y={-halfZ + inset2}
        width={(halfX - inset2) * 2}
        height={(halfZ - inset2) * 2}
        fill="none"
        stroke="#e8c97a"
        strokeWidth={0.5}
        rx={3}
        opacity={0.5}
      />
      {corners.map(([x, y], i) => (
        <path
          key={i}
          d={`M ${x - corner} ${y} L ${x} ${y} L ${x} ${y - corner}`}
          fill="none"
          stroke="#e8c97a"
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.7}
          transform={`rotate(${90 * (i === 1 ? 1 : i === 2 ? 3 : i === 3 ? 2 : 0)} ${x} ${y})`}
        />
      ))}
    </g>
  );
}

function FieldMap({ player, facing }: { player: { x: number; z: number }; facing: number }) {
  return (
    <svg
      width={720}
      height={720}
      viewBox={`${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`}
      style={{ background: '#2f4f27', borderRadius: 6, display: 'block' }}
    >
      <defs>
        <radialGradient id="fieldGrass" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#4d7a3d" />
          <stop offset="100%" stopColor="#2a4423" />
        </radialGradient>
        <linearGradient id="fieldDesert" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c9a865" />
          <stop offset="100%" stopColor="#e8cf9a" />
        </linearGradient>
        <radialGradient id="fieldVignette" cx="50%" cy="50%" r="72%">
          <stop offset="55%" stopColor="black" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.4" />
        </radialGradient>
        {/* Subtle parchment-grain overlay — a bare flat-color fill read as too clean/digital. */}
        <filter id="fieldGrain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
        </filter>
      </defs>

      <rect x={-VIEW_HALF} y={-VIEW_HALF} width={VIEW_HALF * 2} height={VIEW_HALF * 2} fill="url(#fieldGrass)" />
      {/* Desert biome + river — same zone boundaries the actual field uses (worldColliders.ts),
          so the map matches what's really out there instead of just showing uniform grass. */}
      <rect
        x={DESERT_X_START}
        y={-VIEW_HALF}
        width={DESERT_X_END - DESERT_X_START}
        height={VIEW_HALF * 2}
        fill="url(#fieldDesert)"
      />
      {/* The 4 outer-ring danger zones past OUTER_ZONE_BOUND (see worldColliders.ts's
          inFairyForestZone/inOrcVillageZone/inBoneFieldZone/inGhoulFieldZone) — flat tinted
          bands with a name label, matching how the desert band above is drawn, so quest NPCs'
          "어느 마을인지" village callouts have a visible zone to point to on the map. */}
      <rect
        x={-VIEW_HALF}
        y={OUTER_ZONE_BOUND}
        width={DESERT_X_END - -VIEW_HALF}
        height={VIEW_HALF - OUTER_ZONE_BOUND}
        fill="#3f6b4a"
        opacity={0.75}
      />
      <text x={(-VIEW_HALF + DESERT_X_END) / 2} y={(OUTER_ZONE_BOUND + VIEW_HALF) / 2} fill="#eaffe0" fontSize={7} textAnchor="middle" fontWeight={700}>
        요정의 숲
      </text>
      <rect
        x={-VIEW_HALF}
        y={-VIEW_HALF}
        width={DESERT_X_END - -VIEW_HALF}
        height={VIEW_HALF - OUTER_ZONE_BOUND}
        fill="#6b4a3a"
        opacity={0.75}
      />
      <text x={(-VIEW_HALF + DESERT_X_END) / 2} y={-(OUTER_ZONE_BOUND + VIEW_HALF) / 2} fill="#ffe8d0" fontSize={7} textAnchor="middle" fontWeight={700}>
        오크 마을
      </text>
      <rect
        x={-VIEW_HALF}
        y={-OUTER_ZONE_BOUND}
        width={-OUTER_ZONE_BOUND - -VIEW_HALF}
        height={OUTER_ZONE_BOUND * 2}
        fill="#9c9484"
        opacity={0.75}
      />
      <text x={(-VIEW_HALF - OUTER_ZONE_BOUND) / 2} y={0} fill="#2a241c" fontSize={7} textAnchor="middle" fontWeight={700}>
        해골 평원
      </text>
      <rect
        x={DESERT_X_END}
        y={-VIEW_HALF}
        width={VIEW_HALF - DESERT_X_END}
        height={VIEW_HALF * 2}
        fill="#3a4a3a"
        opacity={0.8}
      />
      <text x={(DESERT_X_END + VIEW_HALF) / 2} y={0} fill="#d0f0c0" fontSize={7} textAnchor="middle" fontWeight={700}>
        구울 평원
      </text>
      <path d={RIVER_PATH} fill="#2f7fa8" />
      {/* The one crossing point in the river's collider chain (see worldColliders.ts's
          riverColliders/BRIDGE_Z/BRIDGE_GAP_HALF) — drawn as a short wooden deck spanning the
          river's width so the map actually shows where to cross instead of just a solid blue
          band with no way through. */}
      <rect
        x={RIVER_X_CENTER - RIVER_HALF_WIDTH - 1.5}
        y={-5}
        width={RIVER_HALF_WIDTH * 2 + 3}
        height={10}
        rx={1}
        fill="#8a5a34"
        stroke="#5c3b21"
        strokeWidth={0.6}
      />
      <rect
        x={-VIEW_HALF}
        y={-VIEW_HALF}
        width={VIEW_HALF * 2}
        height={VIEW_HALF * 2}
        filter="url(#fieldGrain)"
        opacity={0.6}
      />

      {/* Individual rocks aren't worth showing on an overview map — hundreds of small gray
          dots read as noise, not information (this used to plot every rockCollider). */}

      {VILLAGES.map((zone, i) => (
        <g key={i}>
          <MapIcon path={ICON_PATH.house} x={zone.center[0]} y={zone.center[1]} size={10} color="#e8c97a" />
          <text
            x={zone.center[0]}
            y={zone.center[1] + 8}
            fill="#e8c97a"
            fontSize={3.4}
            textAnchor="middle"
            fontWeight={700}
          >
            {VILLAGE_CONFIGS[i].name}
          </text>
        </g>
      ))}

      <MapIcon path={ICON_PATH.cave} x={FIELD_ENTRANCE_POINT[0]} y={FIELD_ENTRANCE_POINT[1]} size={6} color="#c084fc" />
      <text
        x={FIELD_ENTRANCE_POINT[0]}
        y={FIELD_ENTRANCE_POINT[1] - 4}
        fill="#c084fc"
        fontSize={3}
        textAnchor="middle"
        fontWeight={700}
      >
        던전
      </text>

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={11} />

      <rect
        x={-VIEW_HALF}
        y={-VIEW_HALF}
        width={VIEW_HALF * 2}
        height={VIEW_HALF * 2}
        fill="url(#fieldVignette)"
      />
      <MapFrame halfX={VIEW_HALF} halfZ={VIEW_HALF} />
      <CompassRose cx={VIEW_HALF - 20} cy={-VIEW_HALF + 20} r={7} />
    </svg>
  );
}

function DungeonMap({
  player,
  facing,
  floor,
}: {
  player: { x: number; z: number };
  facing: number;
  floor: number;
}) {
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const rects = useMemo(() => getFloorRects(floor), [floor]);
  const entryTrigger = useMemo(() => getEntryTrigger(floor), [floor]);
  const exitTrigger = useMemo(() => getExitTrigger(floor), [floor]);

  return (
    <svg
      width={440}
      height={700}
      viewBox={`${-DUNGEON_VIEW_HALF_X} ${-DUNGEON_VIEW_HALF_Z} ${DUNGEON_VIEW_HALF_X * 2} ${DUNGEON_VIEW_HALF_Z * 2}`}
      style={{ background: '#100e13', borderRadius: 6, display: 'block' }}
    >
      <defs>
        <linearGradient id="dungeonFloorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34313b" />
          <stop offset="100%" stopColor="#211f27" />
        </linearGradient>
        <radialGradient id="dungeonVignette" cx="50%" cy="50%" r="70%">
          <stop offset="55%" stopColor="black" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.55" />
        </radialGradient>
        <filter id="dungeonGrain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0" />
        </filter>
      </defs>

      {/* Each room/corridor/doorway-stub rect from getFloorRects, drawn directly — the SVG
          shape matches the 3D geometry exactly since both derive from the same rect list. */}
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x1}
          y={r.z1}
          width={r.x2 - r.x1}
          height={r.z2 - r.z1}
          fill="url(#dungeonFloorGrad)"
          stroke="#4a4750"
          strokeWidth={0.5}
        />
      ))}
      <rect
        x={-DUNGEON_VIEW_HALF_X}
        y={-DUNGEON_VIEW_HALF_Z}
        width={DUNGEON_VIEW_HALF_X * 2}
        height={DUNGEON_VIEW_HALF_Z * 2}
        filter="url(#dungeonGrain)"
        opacity={0.7}
      />

      <MapIcon path={ICON_PATH.ladder} x={entryTrigger[0]} y={entryTrigger[1]} size={2.6} color="#bcdcf0" />
      <text x={entryTrigger[0]} y={entryTrigger[1] + 3.2} fill="#bcdcf0" fontSize={2.4} textAnchor="middle">
        {floor <= 1 ? '입구' : '위층'}
      </text>

      {hasNorthGap && exitTrigger && (
        <>
          <MapIcon path={ICON_PATH.ladder} x={exitTrigger[0]} y={exitTrigger[1]} size={2.6} color="#c084fc" />
          <text x={exitTrigger[0]} y={exitTrigger[1] - 2.2} fill="#c084fc" fontSize={2.4} textAnchor="middle">
            아래층
          </text>
        </>
      )}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={2.6} />

      <rect
        x={-DUNGEON_VIEW_HALF_X}
        y={-DUNGEON_VIEW_HALF_Z}
        width={DUNGEON_VIEW_HALF_X * 2}
        height={DUNGEON_VIEW_HALF_Z * 2}
        fill="url(#dungeonVignette)"
      />
      <MapFrame halfX={DUNGEON_VIEW_HALF_X} halfZ={DUNGEON_VIEW_HALF_Z} />
    </svg>
  );
}

export function WorldMap() {
  const isOpen = useUIStore((s) => s.isMapOpen);
  const closeMap = useUIStore((s) => s.closeMap);
  const currentArea = useWorldStore((s) => s.currentArea);
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);
  const [player, setPlayer] = useState({ x: 0, z: 0, facing: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const poll = () => setPlayer({ x: playerPosition.x, z: playerPosition.z, facing: playerFacing.radians });
    const id = window.setInterval(poll, POLL_MS);
    poll();
    return () => window.clearInterval(id);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={closeMap}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // drei's <Html> nametags (rendered above monsters/characters in the 3D scene) set
        // their own distance-scaled z-index that can reach into the millions — this needs
        // to beat any of them so the map modal isn't punched through by in-world labels.
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a2a1c',
          border: '2px solid #e8c97a',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>
            {currentArea === 'dungeon' ? `지도 · 던전 지하 ${dungeonFloor}층` : '지도'}
          </span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>M 또는 ESC로 닫기</span>
        </div>
        {currentArea === 'dungeon' ? (
          <DungeonMap player={player} facing={player.facing} floor={dungeonFloor} />
        ) : (
          <FieldMap player={player} facing={player.facing} />
        )}
      </div>
    </div>
  );
}
