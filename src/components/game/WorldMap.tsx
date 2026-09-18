import { useEffect, useState } from 'react';
import { playerPosition } from './playerTransform';
import { rockColliders, FIELD_ENTRANCE_POINT } from './worldColliders';
import { VILLAGE_CENTER, VILLAGE_SIZE } from './Village';
import { DUNGEON_MAX_FLOOR, DUNGEON_EXIT_TRIGGER, DUNGEON_DESCEND_TRIGGER } from './Dungeon';
import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

const VIEW_HALF = 75;
const DUNGEON_VIEW_HALF = 14;
const POLL_MS = 100;

/** Shared glow/gradient defs — a soft outer blur behind the player/monster markers and a
 * radial vignette for the terrain, so the map reads less like flat schematic circles and
 * more like a painted overview. Defined once per <svg> (SVG ids are only unique within a
 * document, but each map is its own standalone <svg> element, so no cross-map collision). */
function MapDefs({ fieldColor }: { fieldColor: [string, string] }) {
  return (
    <defs>
      <radialGradient id="terrain" cx="50%" cy="45%" r="75%">
        <stop offset="0%" stopColor={fieldColor[0]} />
        <stop offset="100%" stopColor={fieldColor[1]} />
      </radialGradient>
      <filter id="markerGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** A little peaked-roof house glyph in place of a flat rounded rect. */
function VillageMark({ x, z, size }: { x: number; z: number; size: number }) {
  const half = size / 2;
  const roofPeak = -half - size * 0.32;
  return (
    <g transform={`translate(${x}, ${z})`}>
      <rect x={-half} y={-half * 0.4} width={size} height={half * 1.4} rx={0.6} fill="#8a7f72" stroke="#e8c97a" strokeWidth={0.4} />
      <path d={`M ${-half * 1.1} ${-half * 0.4} L 0 ${roofPeak} L ${half * 1.1} ${-half * 0.4} Z`} fill="#a8563f" stroke="#e8c97a" strokeWidth={0.4} strokeLinejoin="round" />
      <rect x={-size * 0.12} y={half * 0.15} width={size * 0.24} height={half * 0.55} fill="#5a3a28" />
    </g>
  );
}

/** A dark pointed cave-mouth arch instead of a plain filled circle. */
function CaveMark({ x, z, r, glowColor }: { x: number; z: number; r: number; glowColor: string }) {
  return (
    <g transform={`translate(${x}, ${z})`}>
      <circle r={r * 1.6} fill={glowColor} opacity={0.18} filter="url(#markerGlow)" />
      <path
        d={`M ${-r} ${r * 0.7} L ${-r} 0 Q ${-r} ${-r * 1.3} 0 ${-r * 1.3} Q ${r} ${-r * 1.3} ${r} 0 L ${r} ${r * 0.7} Z`}
        fill="#100e14"
        stroke={glowColor}
        strokeWidth={0.4}
      />
    </g>
  );
}

/** A small four-point spike instead of a plain filled circle — reads more like a threat
 * marker than a generic dot. */
function MonsterMark({ x, z, r, color }: { x: number; z: number; r: number; color: string }) {
  return (
    <path
      transform={`translate(${x}, ${z})`}
      d={`M 0 ${-r} L ${r * 0.55} 0 L 0 ${r} L ${-r * 0.55} 0 Z`}
      fill={color}
      filter="url(#markerGlow)"
    />
  );
}

function PlayerMark({ x, z, r }: { x: number; z: number; r: number }) {
  return (
    <circle cx={x} cy={z} r={r} fill="#57c25b" stroke="#f4f1e8" strokeWidth={0.4} filter="url(#markerGlow)" />
  );
}

function FieldMap({ player }: { player: { x: number; z: number } }) {
  const monsters = useCombatStore((s) => s.monsters);

  return (
    <svg
      width={480}
      height={480}
      viewBox={`${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`}
      style={{ background: '#3f6b34', borderRadius: 6, display: 'block' }}
    >
      <MapDefs fieldColor={['#4d7a3f', '#33552a']} />
      <rect x={-VIEW_HALF} y={-VIEW_HALF} width={VIEW_HALF * 2} height={VIEW_HALF * 2} fill="url(#terrain)" />

      {rockColliders.map((rock, i) => (
        <circle key={i} cx={rock.x} cy={rock.z} r={0.6} fill="#5a5148" stroke="#3d3830" strokeWidth={0.15} />
      ))}

      <VillageMark x={VILLAGE_CENTER[0]} z={VILLAGE_CENTER[1]} size={VILLAGE_SIZE * 0.4} />
      <text
        x={VILLAGE_CENTER[0]}
        y={VILLAGE_CENTER[1] - VILLAGE_SIZE / 2 - 1.5}
        fill="#e8c97a"
        fontSize={3.2}
        textAnchor="middle"
        fontWeight={700}
      >
        마을
      </text>

      <CaveMark x={FIELD_ENTRANCE_POINT[0]} z={FIELD_ENTRANCE_POINT[1]} r={1.8} glowColor="#c084fc" />
      <text
        x={FIELD_ENTRANCE_POINT[0]}
        y={FIELD_ENTRANCE_POINT[1] - 2.4}
        fill="#c084fc"
        fontSize={3}
        textAnchor="middle"
        fontWeight={700}
      >
        던전
      </text>

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => <MonsterMark key={m.instanceId} x={m.position[0]} z={m.position[2]} r={1.1} color="#d3487a" />)}

      <PlayerMark x={player.x} z={player.z} r={1.6} />

      <text x={0} y={-VIEW_HALF + 4} fill="#cfe8d0" fontSize={3} textAnchor="middle">N</text>
      <text x={0} y={VIEW_HALF - 1.5} fill="#cfe8d0" fontSize={3} textAnchor="middle">S</text>
      <text x={-VIEW_HALF + 3} y={1} fill="#cfe8d0" fontSize={3} textAnchor="middle">W</text>
      <text x={VIEW_HALF - 3} y={1} fill="#cfe8d0" fontSize={3} textAnchor="middle">E</text>
    </svg>
  );
}

function DungeonMap({ player, floor }: { player: { x: number; z: number }; floor: number }) {
  const monsters = useCombatStore((s) => s.monsters);
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;

  return (
    <svg
      width={480}
      height={400}
      viewBox={`${-DUNGEON_VIEW_HALF} ${-DUNGEON_VIEW_HALF * 0.85} ${DUNGEON_VIEW_HALF * 2} ${DUNGEON_VIEW_HALF * 1.7}`}
      style={{ background: '#1c1a20', borderRadius: 6, display: 'block' }}
    >
      <MapDefs fieldColor={['#3a3542', '#1c1a20']} />
      <rect x={-12} y={-10} width={24} height={20} rx={1} fill="url(#terrain)" stroke="#4a4750" strokeWidth={0.5} />

      <CaveMark x={DUNGEON_EXIT_TRIGGER[0]} z={DUNGEON_EXIT_TRIGGER[1]} r={1.2} glowColor="#bcdcf0" />
      <text x={DUNGEON_EXIT_TRIGGER[0]} y={DUNGEON_EXIT_TRIGGER[1] + 2.6} fill="#bcdcf0" fontSize={2.4} textAnchor="middle">
        {floor <= 1 ? '입구' : '위층'}
      </text>

      {hasNorthGap && (
        <>
          <CaveMark x={DUNGEON_DESCEND_TRIGGER[0]} z={DUNGEON_DESCEND_TRIGGER[1]} r={1.2} glowColor="#c084fc" />
          <text x={DUNGEON_DESCEND_TRIGGER[0]} y={DUNGEON_DESCEND_TRIGGER[1] - 1.8} fill="#c084fc" fontSize={2.4} textAnchor="middle">
            아래층
          </text>
        </>
      )}

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => <MonsterMark key={m.instanceId} x={m.position[0]} z={m.position[2]} r={0.9} color="#e0538a" />)}

      <PlayerMark x={player.x} z={player.z} r={1.4} />
    </svg>
  );
}

export function WorldMap() {
  const isOpen = useUIStore((s) => s.isMapOpen);
  const closeMap = useUIStore((s) => s.closeMap);
  const currentArea = useWorldStore((s) => s.currentArea);
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);
  const [player, setPlayer] = useState({ x: 0, z: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => {
      setPlayer({ x: playerPosition.x, z: playerPosition.z });
    }, POLL_MS);
    setPlayer({ x: playerPosition.x, z: playerPosition.z });
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
        <div style={{ border: '1px solid rgba(232, 201, 122, 0.4)', borderRadius: 8, padding: 3 }}>
          {currentArea === 'dungeon' ? (
            <DungeonMap player={player} floor={dungeonFloor} />
          ) : (
            <FieldMap player={player} />
          )}
        </div>
      </div>
    </div>
  );
}
