import { useEffect, useState } from 'react';
import { playerPosition } from './playerTransform';
import { rockColliders } from './worldColliders';
import { VILLAGE_CENTER, VILLAGE_SIZE } from './Village';
import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';

const VIEW_HALF = 50;
const POLL_MS = 100;

export function WorldMap() {
  const isOpen = useUIStore((s) => s.isMapOpen);
  const closeMap = useUIStore((s) => s.closeMap);
  const monsters = useCombatStore((s) => s.monsters);
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
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>지도</span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>M 또는 ESC로 닫기</span>
        </div>
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
      </div>
    </div>
  );
}
