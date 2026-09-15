import { useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useAuthStore } from '../../stores/authStore';
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
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // authStore.logout() saves the player's current position before revoking the
      // session (see PositionSync for the periodic version) — this only works if it
      // runs through the SPA's own in-memory state rather than a hard page reload, which
      // is why this is a same-page button instead of a link to the character-select
      // page's separate logout button. RequireAuth reacts to isAuthenticated flipping to
      // false and redirects to /login on its own; no manual navigation needed here.
      await useAuthStore.getState().logout();
    } finally {
      setLoggingOut(false);
    }
  }

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#ffd54a', fontWeight: 700, fontSize: 12 }}>{player.gold} G</span>
          {player.skillPoints > 0 && (
            <span
              style={{
                color: '#e8c97a',
                fontWeight: 700,
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(232, 201, 122, 0.2)',
                border: '1px solid #e8c97a',
              }}
            >
              스킬 포인트 {player.skillPoints}
            </span>
          )}
        </div>
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
        <div>캐릭터: C</div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            pointerEvents: 'auto',
            marginTop: 6,
            width: '100%',
            padding: '4px 0',
            borderRadius: 6,
            border: '1px solid rgba(244, 241, 232, 0.35)',
            background: 'rgba(0,0,0,0.25)',
            color: '#f4f1e8',
            fontSize: 11,
            cursor: loggingOut ? 'default' : 'pointer',
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? '로그아웃 중...' : '로그아웃'}
        </button>
      </div>
    </div>
  );
}
