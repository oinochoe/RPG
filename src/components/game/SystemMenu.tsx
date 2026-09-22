import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useUIStore } from "../../stores/uiStore";
import { useDraggablePanel } from "./useDraggablePanel";

const PANEL_WIDTH = 280;

const KEYBINDS: [string, string][] = [
  ["이동", "WASD / 방향키"],
  ["공격", "좌클릭"],
  ["NPC와 대화", "Space"],
  ["스킬", "K"],
  ["지도", "M"],
  ["캐릭터 / 장비", "C"],
  ["인벤토리", "I"],
  ["단축키 슬롯", "1 - 4"],
  ["메뉴", "F1 / ESC"],
];

/**
 * F1 menu — replaces the old always-on top-right corner box. Keybind reference plus
 * account actions (캐릭터 선택/로그아웃) that don't need to be visible during normal play.
 */
export function SystemMenu() {
  const isOpen = useUIStore((s) => s.isSystemMenuOpen);
  const closeSystemMenu = useUIStore((s) => s.closeSystemMenu);
  const [loggingOut, setLoggingOut] = useState(false);
  // Collapsed by default — the keybind reference is useful but shouldn't be the first thing
  // this menu shows every time; 캐릭터 선택/로그아웃 (what someone actually opens F1 to do
  // most of the time) get top billing instead.
  const [showKeybinds, setShowKeybinds] = useState(false);
  const navigate = useNavigate();
  const { position, onHeaderMouseDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 180),
  }));

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
    // Draggable via the header (see useDraggablePanel) — no full-screen dismiss-on-outside-
    // click backdrop, same reasoning as the other panels.
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        background: "#1a2a1c",
        border: "2px solid #e8c97a",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          cursor: "move",
          userSelect: "none",
        }}
      >
        <span style={{ color: "#f4f1e8", fontWeight: 700, fontSize: 16 }}>
          메뉴
        </span>
        <button
          onClick={closeSystemMenu}
          style={{
            background: "transparent",
            border: "none",
            color: "#9aa08f",
            fontSize: 16,
            cursor: "pointer",
            lineHeight: 1,
            padding: 2,
          }}
          title="닫기 (F1 또는 ESC)"
        >
          ✕
        </button>
      </div>

      <button
        onClick={() => navigate("/characters")}
        style={{
          width: "100%",
          padding: "6px 0",
          borderRadius: 6,
          border: "1px solid rgba(244, 241, 232, 0.35)",
          background: "rgba(0,0,0,0.25)",
          color: "#f4f1e8",
          fontSize: 12,
          cursor: "pointer",
          marginBottom: 6,
        }}
      >
        캐릭터 선택
      </button>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        style={{
          width: "100%",
          padding: "6px 0",
          borderRadius: 6,
          border: "1px solid rgba(244, 241, 232, 0.35)",
          background: "rgba(0,0,0,0.25)",
          color: "#f4f1e8",
          fontSize: 12,
          cursor: loggingOut ? "default" : "pointer",
          opacity: loggingOut ? 0.6 : 1,
        }}
      >
        {loggingOut ? "로그아웃 중..." : "로그아웃"}
      </button>

      <button
        onClick={() => setShowKeybinds((s) => !s)}
        style={{
          width: "100%",
          padding: "6px 0",
          marginTop: 10,
          borderRadius: 6,
          border: "1px solid rgba(232, 201, 122, 0.25)",
          background: "transparent",
          color: "#9aa08f",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        단축키 안내 {showKeybinds ? "▲" : "▼"}
      </button>
      {showKeybinds && (
        <div style={{ marginTop: 8 }}>
          {KEYBINDS.map(([label, key]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 2px",
                fontSize: 12,
                borderBottom: "1px solid rgba(232, 201, 122, 0.12)",
              }}
            >
              <span style={{ color: "#cfe8d0" }}>{label}</span>
              <span style={{ color: "#e8c97a", fontWeight: 700 }}>{key}</span>
            </div>
          ))}
        </div>
      )}

      {/* CC BY 3.0 requires attribution — see itemIcons.tsx for which icon came from whom. */}
      <p
        style={{
          color: "rgba(154, 160, 143, 0.6)",
          fontSize: 9,
          marginTop: 10,
          textAlign: "center",
        }}
      >
        아이템/지도 아이콘: Lorc, Delapouite, sbed, Caro Asercion, badges
        (game-icons.net, CC BY 3.0)
        <br />
        효과음: Kenney.nl (CC0)
        <br />
        자연물/마을 소품(나무/사막/다리/노점/풍차): Kenney.nl (CC0)
      </p>
    </div>
  );
}
