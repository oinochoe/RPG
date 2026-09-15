import { useEffect, useState } from 'react';
import { playerPosition } from './playerTransform';
import { rockColliders } from './worldColliders';
import { VILLAGE_CENTER, VILLAGE_SIZE } from './Village';
import { DUNGEON_MAX_FLOOR, DUNGEON_EXIT_TRIGGER, DUNGEON_DESCEND_TRIGGER } from './Dungeon';
import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

const VIEW_HALF = 75;
const DUNGEON_VIEW_HALF = 14;
const POLL_MS = 100;

function FieldMap({ player }: { player: { x: number; z: number } }) {
  const monsters = useCombatStore((s) => s.monsters);

  return (
    <svg
      width={480}
      height={480}
      viewBox={`${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`}
      style={{ background: '#3f6b34', borderRadius: 6, display: 'block' }}
    >
      {rockColliders.map((rock, i) => (
        <circle key={i} cx={rock.x} cy={rock.z} r={0.6} fill="#5a5148" />
      ))}

      <rect
        x={VILLAGE_CENTER[0] - VILLAGE_SIZE / 2}
        y={VILLAGE_CENTER[1] - VILLAGE_SIZE / 2}
        width={VILLAGE_SIZE}
        height={VILLAGE_SIZE}
        rx={2}
        fill="#8a7f72"
        stroke="#e8c97a"
        strokeWidth={0.4}
      />
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

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => (
          <circle key={m.instanceId} cx={m.position[0]} cy={m.position[2]} r={1} fill="#d3487a" />
        ))}

      <circle cx={player.x} cy={player.z} r={1.6} fill="#57c25b" stroke="#f4f1e8" strokeWidth={0.4} />

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
      <rect x={-12} y={-10} width={24} height={20} rx={1} fill="#2c2933" stroke="#4a4750" strokeWidth={0.5} />

      <circle
        cx={DUNGEON_EXIT_TRIGGER[0]}
        cy={DUNGEON_EXIT_TRIGGER[1]}
        r={1.2}
        fill="#bcdcf0"
        opacity={0.8}
      />
      <text x={DUNGEON_EXIT_TRIGGER[0]} y={DUNGEON_EXIT_TRIGGER[1] + 2.6} fill="#bcdcf0" fontSize={2.4} textAnchor="middle">
        {floor <= 1 ? '입구' : '위층'}
      </text>

      {hasNorthGap && (
        <>
          <circle
            cx={DUNGEON_DESCEND_TRIGGER[0]}
            cy={DUNGEON_DESCEND_TRIGGER[1]}
            r={1.2}
            fill="#c084fc"
            opacity={0.8}
          />
          <text x={DUNGEON_DESCEND_TRIGGER[0]} y={DUNGEON_DESCEND_TRIGGER[1] - 1.8} fill="#c084fc" fontSize={2.4} textAnchor="middle">
            아래층
          </text>
        </>
      )}

      {Object.values(monsters)
        .filter((m) => m.alive)
        .map((m) => (
          <circle key={m.instanceId} cx={m.position[0]} cy={m.position[2]} r={0.9} fill="#e0538a" />
        ))}

      <circle cx={player.x} cy={player.z} r={1.4} fill="#57c25b" stroke="#f4f1e8" strokeWidth={0.4} />
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
        {currentArea === 'dungeon' ? (
          <DungeonMap player={player} floor={dungeonFloor} />
        ) : (
          <FieldMap player={player} />
        )}
      </div>
    </div>
  );
}
