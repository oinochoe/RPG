import { useCombatStore, type AllocatableStat } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import type { CharacterProfile } from '../../types/api';

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

const STAT_ROWS: { stat: AllocatableStat; label: string; gain: string }[] = [
  { stat: 'attack', label: '공격력', gain: '+1' },
  { stat: 'defense', label: '방어력', gain: '+1' },
  { stat: 'hp', label: '최대 체력', gain: '+8' },
];

function StatRow({
  label,
  value,
  gain,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  gain: string;
  canAllocate: boolean;
  onAllocate: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 4px',
        borderBottom: '1px solid rgba(232, 201, 122, 0.15)',
      }}
    >
      <span style={{ color: '#cfe8d0', fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14, minWidth: 32, textAlign: 'right' }}>
          {value}
        </span>
        <button
          onClick={onAllocate}
          disabled={!canAllocate}
          style={{
            width: 28,
            height: 24,
            borderRadius: 6,
            border: '1px solid #e8c97a',
            background: canAllocate ? 'rgba(232, 201, 122, 0.2)' : 'rgba(255,255,255,0.05)',
            color: canAllocate ? '#e8c97a' : '#6a6a5f',
            fontWeight: 700,
            fontSize: 13,
            cursor: canAllocate ? 'pointer' : 'default',
          }}
          title={`${gain} (포인트 1 소모)`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CharacterPanel({ character }: { character: CharacterProfile }) {
  const isOpen = useUIStore((s) => s.isCharacterPanelOpen);
  const closeCharacterPanel = useUIStore((s) => s.closeCharacterPanel);
  const player = useCombatStore((s) => s.player);
  const allocateStat = useCombatStore((s) => s.allocateStat);
  const accent = CLASS_ACCENT[character.character_class];

  if (!isOpen) return null;

  const canAllocate = player.skillPoints > 0;

  return (
    <div
      onClick={closeCharacterPanel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Same reasoning as WorldMap: beat drei <Html> nametags' distance-scaled z-index.
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          background: '#1a2a1c',
          border: `2px solid ${accent}`,
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>
            {character.name} <span style={{ color: accent }}>Lv.{player.level}</span>
          </span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>C 또는 ESC로 닫기</span>
        </div>

        <div style={{ color: '#9aa08f', fontSize: 12, marginBottom: 12 }}>
          HP {player.currentHp}/{player.maxHp} · EXP {player.experience}/{player.expToNext} · {player.gold} G
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderRadius: 8,
            background: canAllocate ? 'rgba(232, 201, 122, 0.15)' : 'rgba(255,255,255,0.04)',
            marginBottom: 8,
          }}
        >
          <span style={{ color: '#e8c97a', fontSize: 13, fontWeight: 700 }}>스킬 포인트</span>
          <span style={{ color: '#e8c97a', fontSize: 15, fontWeight: 700 }}>{player.skillPoints}</span>
        </div>

        <div>
          {STAT_ROWS.map(({ stat, label, gain }) => (
            <StatRow
              key={stat}
              label={label}
              value={stat === 'attack' ? player.attackPower : stat === 'defense' ? player.defensePower : player.maxHp}
              gain={gain}
              canAllocate={canAllocate}
              onAllocate={() => allocateStat(stat)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
