import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';

const KEYBINDS: [string, string][] = [
  ['이동', 'WASD / 방향키'],
  ['공격 / NPC와 대화', 'Space'],
  ['지도', 'M'],
  ['캐릭터 / 인벤토리', 'C'],
  ['단축키 슬롯', '1 - 4'],
  ['메뉴', 'F1'],
];

/**
 * F1 menu — replaces the old always-on top-right corner box. Keybind reference plus
 * account actions (캐릭터 선택/로그아웃) that don't need to be visible during normal play.
 */
export function SystemMenu() {
  const isOpen = useUIStore((s) => s.isSystemMenuOpen);
  const closeSystemMenu = useUIStore((s) => s.closeSystemMenu);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  if (!isOpen) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // See HUD's old comment (now moved here): authStore.logout() saves position through
      // the SPA's in-memory state, so this must be a same-page action rather than a link.
      await useAuthStore.getState().logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div
      onClick={closeSystemMenu}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 280,
          background: '#1a2a1c',
          border: '2px solid #e8c97a',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>메뉴</span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>F1 또는 ESC로 닫기</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          {KEYBINDS.map(([label, key]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 2px',
                fontSize: 12,
                borderBottom: '1px solid rgba(232, 201, 122, 0.12)',
              }}
            >
              <span style={{ color: '#cfe8d0' }}>{label}</span>
              <span style={{ color: '#e8c97a', fontWeight: 700 }}>{key}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/characters')}
          style={{
            width: '100%',
            padding: '6px 0',
            borderRadius: 6,
            border: '1px solid rgba(244, 241, 232, 0.35)',
            background: 'rgba(0,0,0,0.25)',
            color: '#f4f1e8',
            fontSize: 12,
            cursor: 'pointer',
            marginBottom: 6,
          }}
        >
          캐릭터 선택
        </button>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%',
            padding: '6px 0',
            borderRadius: 6,
            border: '1px solid rgba(244, 241, 232, 0.35)',
            background: 'rgba(0,0,0,0.25)',
            color: '#f4f1e8',
            fontSize: 12,
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
