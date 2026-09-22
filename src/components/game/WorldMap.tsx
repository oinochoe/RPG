import { useEffect, useMemo, useState } from 'react';
import { playerPosition, playerFacing } from './playerTransform';
import {
  FIELD_ENTRANCE_POINT,
  RIVER_X_CENTER,
  RIVER_HALF_WIDTH,
  DESERT_X_START,
  VILLAGES,
  FIELD_EXTENT,
  riverPathD,
} from './worldColliders';
import { VILLAGE_CONFIGS } from './Village';
import {
  DUNGEON_MAX_FLOOR,
  DUNGEON_EXIT_TRIGGER,
  DUNGEON_DESCEND_TRIGGER,
  ROOM_HALF_X,
  ROOM_HALF_Z,
  getFloorRects,
} from './Dungeon';
import { ICON_PATH, MapIcon, SkullMarker, PlayerArrow } from './mapIcons';
import { useCombatStore } from '../../stores/combatStore';
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

function FieldMap({ player, facing }: { player: { x: number; z: number }; facing: number }) {
  const monsters = useCombatStore((s) => s.monsters);

  return (
    <svg
      width={720}
      height={720}
      viewBox={`${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`}
      style={{ background: '#3f6b34', borderRadius: 6, display: 'block' }}
    >
      {/* Desert biome + river — same zone boundaries the actual field uses (worldColliders.ts),
          so the map matches what's really out there instead of just showing uniform grass. */}
      <rect x={DESERT_X_START} y={-VIEW_HALF} width={VIEW_HALF - DESERT_X_START} height={VIEW_HALF * 2} fill="#d9b877" />
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

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => (
          <SkullMarker key={m.instanceId} x={m.position[0]} y={m.position[2]} size={2.6} color="#d3487a" />
        ))}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={11} />

      <text x={0} y={-VIEW_HALF + 4} fill="#cfe8d0" fontSize={3} textAnchor="middle">N</text>
      <text x={0} y={VIEW_HALF - 1.5} fill="#cfe8d0" fontSize={3} textAnchor="middle">S</text>
      <text x={-VIEW_HALF + 3} y={1} fill="#cfe8d0" fontSize={3} textAnchor="middle">W</text>
      <text x={VIEW_HALF - 3} y={1} fill="#cfe8d0" fontSize={3} textAnchor="middle">E</text>
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
  const monsters = useCombatStore((s) => s.monsters);
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const rects = useMemo(() => getFloorRects(floor), [floor]);

  return (
    <svg
      width={440}
      height={700}
      viewBox={`${-DUNGEON_VIEW_HALF_X} ${-DUNGEON_VIEW_HALF_Z} ${DUNGEON_VIEW_HALF_X * 2} ${DUNGEON_VIEW_HALF_Z * 2}`}
      style={{ background: '#1c1a20', borderRadius: 6, display: 'block' }}
    >
      {/* Each room/corridor/doorway-stub rect from getFloorRects, drawn directly — the SVG
          shape matches the 3D geometry exactly since both derive from the same rect list. */}
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x1}
          y={r.z1}
          width={r.x2 - r.x1}
          height={r.z2 - r.z1}
          fill="#2c2933"
          stroke="#4a4750"
          strokeWidth={0.5}
        />
      ))}

      <MapIcon path={ICON_PATH.ladder} x={DUNGEON_EXIT_TRIGGER[0]} y={DUNGEON_EXIT_TRIGGER[1]} size={2.6} color="#bcdcf0" />
      <text x={DUNGEON_EXIT_TRIGGER[0]} y={DUNGEON_EXIT_TRIGGER[1] + 3.2} fill="#bcdcf0" fontSize={2.4} textAnchor="middle">
        {floor <= 1 ? '입구' : '위층'}
      </text>

      {hasNorthGap && (
        <>
          <MapIcon
            path={ICON_PATH.ladder}
            x={DUNGEON_DESCEND_TRIGGER[0]}
            y={DUNGEON_DESCEND_TRIGGER[1]}
            size={2.6}
            color="#c084fc"
          />
          <text x={DUNGEON_DESCEND_TRIGGER[0]} y={DUNGEON_DESCEND_TRIGGER[1] - 2.2} fill="#c084fc" fontSize={2.4} textAnchor="middle">
            아래층
          </text>
        </>
      )}

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => (
          <SkullMarker key={m.instanceId} x={m.position[0]} y={m.position[2]} size={2.2} color="#e0538a" />
        ))}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={2.6} />
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
