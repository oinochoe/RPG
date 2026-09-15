import { useCombatStore } from '../../stores/combatStore';
import type { CharacterProfile } from '../../types/api';

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

function Bar({ ratio, color, label }: { ratio: number; color: string; label: string }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div style={{ position: 'relative', width: 220, height: 14, borderRadius: 7, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
      <div style={{ width: `${clamped * 100}%`, height: '100%', background: color, transition: 'width 200ms ease-out' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: '#f4f1e8',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function HUD({ character }: { character: CharacterProfile }) {
  const player = useCombatStore((s) => s.player);
  const accent = CLASS_ACCENT[character.character_class];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(15, 17, 13, 0.6)',
          border: `1px solid ${accent}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14 }}>
          {character.name} <span style={{ color: accent }}>Lv.{player.level}</span>
        </div>
        <Bar ratio={player.currentHp / player.maxHp} color="#57c25b" label={`HP ${player.currentHp}/${player.maxHp}`} />
        <Bar ratio={player.experience / player.expToNext} color="#5b9bd5" label={`EXP ${player.experience}/${player.expToNext}`} />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 16,
          top: 16,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(15, 17, 13, 0.55)',
          color: '#f4f1e8',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div>이동: WASD / 방향키</div>
        <div>공격: Space</div>
        <div>지도: M</div>
      </div>
    </div>
  );
}
