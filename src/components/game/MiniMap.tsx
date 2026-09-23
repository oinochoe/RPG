import { useEffect, useMemo, useState } from 'react';
import { playerPosition, playerFacing } from './playerTransform';
import {
  RIVER_X_CENTER,
  RIVER_HALF_WIDTH,
  DESERT_X_START,
  DESERT_X_END,
  VILLAGES,
  DUNGEON_ENTRANCES,
  type DungeonId,
  riverPathD,
  curvedBandPathD,
  fairyForestEdgeAt,
  orcVillageEdgeAt,
  boneFieldEdgeAt,
} from './worldColliders';
import { DUNGEON_META, getEntryTrigger, getExitTrigger, getFloorRects } from './Dungeon';
import { ICON_PATH, MapIcon, PlayerArrow } from './mapIcons';
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
  const half = FIELD_LOCAL_HALF;

  return (
    <svg
      width={CORNER_SIZE}
      height={CORNER_SIZE}
      viewBox={`${player.x - half} ${player.z - half} ${half * 2} ${half * 2}`}
      style={{ display: 'block' }}
    >
      <rect x={-BACKDROP_HALF} y={-BACKDROP_HALF} width={BACKDROP_HALF * 2} height={BACKDROP_HALF * 2} fill="#3f6b34" />
      <rect x={DESERT_X_START} y={-BACKDROP_HALF} width={DESERT_X_END - DESERT_X_START} height={BACKDROP_HALF * 2} fill="#d9b877" />
      {/* The 4 outer-ring danger zones — same colors as WorldMap.tsx's full map, just without
          the text labels (no room in a 190px corner view). 3 of the 4 trace the same curved
          edge functions WorldMap.tsx uses (computed fresh each frame here since this view pans
          with the player, unlike WorldMap's fixed viewBox), recomputed only across the locally
          visible window rather than the full field. 구울 평원 keeps its flat rect (see
          WorldMap.tsx's own comment on why). */}
      <path d={curvedBandPathD(fairyForestEdgeAt, player.x - half - 5, player.x + half + 5, 3000, 'x', 5)} fill="#3f6b4a" />
      <path d={curvedBandPathD(orcVillageEdgeAt, player.x - half - 5, player.x + half + 5, -3000, 'x', 5)} fill="#6b4a3a" />
      <path d={curvedBandPathD(boneFieldEdgeAt, player.z - half - 5, player.z + half + 5, -3000, 'z', 5)} fill="#9c9484" />
      <rect x={DESERT_X_END} y={-BACKDROP_HALF} width={BACKDROP_HALF} height={BACKDROP_HALF * 2} fill="#3a4a3a" />
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
      {(Object.keys(DUNGEON_ENTRANCES) as DungeonId[]).map((id) => (
        <MapIcon key={id} path={ICON_PATH.cave} x={DUNGEON_ENTRANCES[id].point[0]} y={DUNGEON_ENTRANCES[id].point[1]} size={6} color="#c084fc" />
      ))}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={5.5} />
    </svg>
  );
}

function MiniDungeonView({
  player,
  facing,
  floor,
  maxFloor,
}: {
  player: { x: number; z: number };
  facing: number;
  floor: number;
  maxFloor: number;
}) {
  const hasNorthGap = floor < maxFloor;
  const rects = useMemo(() => getFloorRects(floor, maxFloor), [floor, maxFloor]);
  const entryTrigger = useMemo(() => getEntryTrigger(floor), [floor]);
  const exitTrigger = useMemo(() => getExitTrigger(floor, maxFloor), [floor, maxFloor]);
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
      <MapIcon path={ICON_PATH.ladder} x={entryTrigger[0]} y={entryTrigger[1]} size={3} color="#bcdcf0" />
      {hasNorthGap && exitTrigger && (
        <MapIcon path={ICON_PATH.ladder} x={exitTrigger[0]} y={exitTrigger[1]} size={3} color="#c084fc" />
      )}

      <PlayerArrow x={player.x} y={player.z} facingRad={facing} size={3.2} />
    </svg>
  );
}

/** Persistent corner overlay — unlike WorldMap.tsx's full modal, this never closes and never
 * blocks clicks, so it's mounted directly alongside the HUD rather than gated by isMapOpen. */
export function MiniMap() {
  const isMapOpen = useUIStore((s) => s.isMapOpen);
  const currentArea = useWorldStore((s) => s.currentArea);
  const currentDungeonId = useWorldStore((s) => s.currentDungeonId);
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);
  const [player, setPlayer] = useState({ x: 0, z: 0, facing: 0 });
  const inDungeon = currentArea === 'dungeon' && currentDungeonId !== null;
  const dungeonMeta = currentDungeonId ? DUNGEON_META[currentDungeonId] : null;

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
      {inDungeon && dungeonMeta ? (
        <MiniDungeonView player={player} facing={player.facing} floor={dungeonFloor} maxFloor={dungeonMeta.maxFloor} />
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
      {inDungeon && dungeonMeta && (
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
          {dungeonMeta.name} 지하 {dungeonFloor}층
        </div>
      )}
    </div>
  );
}
