import { useEffect, useMemo, useState } from 'react';
import { playerPosition, playerFacing } from './playerTransform';
import { RIVER_X_CENTER, RIVER_HALF_WIDTH, DESERT_X_START, VILLAGES, FIELD_ENTRANCE_POINT, riverPathD } from './worldColliders';
import { DUNGEON_MAX_FLOOR, DUNGEON_EXIT_TRIGGER, DUNGEON_DESCEND_TRIGGER, getFloorRects } from './Dungeon';
import { ICON_PATH, MapIcon, SkullMarker, PlayerArrow } from './mapIcons';
import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

// The always-on corner map from the Lineage-style reference the user shared — small, never
// closed, shows the immediate area around the player at a glance; the M-key WorldMap remains
// the "real" full map for planning routes across the whole field/floor. Kept deliberately
// simple (no zoom levels, no rotation-follows-player) since that's the part of the reference
// that actually matters day to day — the bigger "press M repeatedly to cycle town/field/world"
// browsing behavior stays out of scope for now.
const POLL_MS = 150;
const CORNER_SIZE = 190;
// How much of the field is visible around the player at once — deliberately tighter than the
// full map's whole-field view; this is meant to answer "what's near me right now," not replace
// the M-key map for route planning.
const FIELD_LOCAL_HALF = 45;
// Same "what's near me" framing for the dungeon corner view — panning with the player instead
// of trying to squeeze the whole winding 3-room floor into a 190px square (which the full
// M-key map already shows in full).
const DUNGEON_LOCAL_HALF = 40;
// Anything drawn as a flat biome band (grass/desert/river) is sized way past any reachable
// player position and left for the SVG viewport itself to clip, rather than recomputing exact
// bounds against a viewBox that pans with the player every frame.
const BACKDROP_HALF = 1000;

function MiniFieldView({ player, facing }: { player: { x: number; z: number }; facing: number }) {
  const monsters = useCombatStore((s) => s.monsters);
  const half = FIELD_LOCAL_HALF;

  return (
    <svg
      width={CORNER_SIZE}
      height={CORNER_SIZE}
      viewBox={`${player.x - half} ${player.z - half} ${half * 2} ${half * 2}`}
      style={{ display: 'block' }}
    >
      <rect x={-BACKDROP_HALF} y={-BACKDROP_HALF} width={BACKDROP_HALF * 2} height={BACKDROP_HALF * 2} fill="#3f6b34" />
      <rect x={DESERT_X_START} y={-BACKDROP_HALF} width={BACKDROP_HALF * 2} height={BACKDROP_HALF * 2} fill="#d9b877" />
      <path d={riverPathD(player.z - half - 5, player.z + half + 5)} fill="#2f7fa8" />
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

      {VILLAGES.map((zone, i) => (
        <MapIcon key={i} path={ICON_PATH.house} x={zone.center[0]} y={zone.center[1]} size={9} color="#e8c97a" />
      ))}
      <MapIcon path={ICON_PATH.cave} x={FIELD_ENTRANCE_POINT[0]} y={FIELD_ENTRANCE_POINT[1]} size={6} color="#c084fc" />

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => (
          <SkullMarker key={m.instanceId} x={m.position[0]} y={m.position[2]} size={3} color="#d3487a" />
        ))}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={5.5} />
    </svg>
  );
}

function MiniDungeonView({ player, facing, floor }: { player: { x: number; z: number }; facing: number; floor: number }) {
  const monsters = useCombatStore((s) => s.monsters);
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const rects = useMemo(() => getFloorRects(floor), [floor]);
  const half = DUNGEON_LOCAL_HALF;

  return (
    <svg
      width={CORNER_SIZE}
      height={CORNER_SIZE}
      viewBox={`${player.x - half} ${player.z - half} ${half * 2} ${half * 2}`}
      style={{ display: 'block', background: '#1c1a20' }}
    >
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
      <MapIcon path={ICON_PATH.ladder} x={DUNGEON_EXIT_TRIGGER[0]} y={DUNGEON_EXIT_TRIGGER[1]} size={3} color="#bcdcf0" />
      {hasNorthGap && (
        <MapIcon path={ICON_PATH.ladder} x={DUNGEON_DESCEND_TRIGGER[0]} y={DUNGEON_DESCEND_TRIGGER[1]} size={3} color="#c084fc" />
      )}

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => (
          <SkullMarker key={m.instanceId} x={m.position[0]} y={m.position[2]} size={2.6} color="#e0538a" />
        ))}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={3.2} />
    </svg>
  );
}

/** Persistent corner overlay — unlike WorldMap.tsx's full modal, this never closes and never
 * blocks clicks, so it's mounted directly alongside the HUD rather than gated by isMapOpen. */
export function MiniMap() {
  const isMapOpen = useUIStore((s) => s.isMapOpen);
  const currentArea = useWorldStore((s) => s.currentArea);
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);
  const [player, setPlayer] = useState({ x: 0, z: 0, facing: 0 });

  useEffect(() => {
    const poll = () => setPlayer({ x: playerPosition.x, z: playerPosition.z, facing: playerFacing.radians });
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // The full map modal already shows everything this does and more — no reason to keep two
  // maps visible at once while it's open.
  if (isMapOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: CORNER_SIZE,
        height: CORNER_SIZE,
        borderRadius: 14,
        overflow: 'hidden',
        border: '2px solid #e8c97a',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
        // Never intercepts clicks — purely informational, sits above in-world Html tags
        // (nametags/health bars can spike their own z-index very high, see WorldMap.tsx's
        // note) without competing with any actual modal (menu/map/panels stay above this).
        pointerEvents: 'none',
        zIndex: 2147483000,
      }}
    >
      {currentArea === 'dungeon' ? (
        <MiniDungeonView player={player} facing={player.facing} floor={dungeonFloor} />
      ) : (
        <MiniFieldView player={player} facing={player.facing} />
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 3,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: '#f4f1e8',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
        }}
      >
        M
      </div>
      {currentArea === 'dungeon' && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#f4f1e8',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
          }}
        >
          지하 {dungeonFloor}층
        </div>
      )}
    </div>
  );
}
