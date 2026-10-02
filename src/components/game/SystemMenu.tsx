import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useUIStore } from "../../stores/uiStore";
import { useCharacterStore } from "../../stores/characterStore";
import { playerStuck } from "./playerTransform";
import { useDraggablePanel } from "./useDraggablePanel";
import { useTooltip } from "./Tooltip";
import { useTutorialStore } from "../../lib/tutorial";
import { useIsTouch } from "../../lib/device";
import { Button, buttonVariants } from "../ui/button";
import { cn } from "../../lib/utils";
import { useFxSettings } from "./fxSettings";
import { GamePanel } from "../ui/game-panel";

const PANEL_WIDTH = 280;
const STUCK_POLL_MS = 300;

const KEYBINDS: [string, string][] = [
  ["이동", "WASD / 방향키"],
  ["공격", "좌클릭"],
  ["NPC와 대화", "Space"],
  ["스킬 창 열기", "K"],
  ["지도", "M"],
  ["캐릭터 / 장비", "C"],
  ["인벤토리", "I"],
  ["퀘스트 목록", "Q"],
  ["단축키 슬롯", "1 - 8"],
  ["아이템 줍기(클릭도 가능)", "F4"],
  ["메뉴", "F1 / ESC"],
];

/**
 * F1 menu — replaces the old always-on top-right corner box. Keybind reference plus
 * account actions (캐릭터 선택/로그아웃) that don't need to be visible during normal play.
 */
export function SystemMenu() {
  const isOpen = useUIStore((s) => s.isSystemMenuOpen);
  const closeSystemMenu = useUIStore((s) => s.closeSystemMenu);
  const shake = useFxSettings((s) => s.shake);
  const setShake = useFxSettings((s) => s.setShake);
  const [loggingOut, setLoggingOut] = useState(false);
  // Collapsed by default — the keybind reference is useful but shouldn't be the first thing
  // this menu shows every time; 캐릭터 선택/로그아웃 (what someone actually opens F1 to do
  // most of the time) get top billing instead.
  const [showKeybinds, setShowKeybinds] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const navigate = useNavigate();
  const isTouch = useIsTouch();
  const { frameStyle, onHeaderPointerDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 180),
  }), PANEL_WIDTH);

  // Only polled while the menu is actually open — playerStuck is a plain mutable object (see
  // playerTransform.ts), not React state, so the escape button's enabled/disabled look needs
  // this to notice CharacterMesh's stuck-detection heuristic flipping it.
  useEffect(() => {
    if (!isOpen) return;
    const poll = () => setIsStuck(playerStuck.value);
    poll();
    const id = window.setInterval(poll, STUCK_POLL_MS);
    return () => window.clearInterval(id);
  }, [isOpen]);

  const { handlers: stuckTooltipHandlers, tooltip: stuckTooltip } = useTooltip(
    isStuck
      ? "지형에 낀 상태가 감지되었습니다 — 가까운 마을로 즉시 이동합니다"
      : "지형에 낀 상태에서만 사용할 수 있습니다 (평소 이동에는 마을 귀환 주문서를 사용하세요)",
  );

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
    <GamePanel
      title="메뉴"
      onClose={closeSystemMenu}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
    >
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setShake(!shake)}>
          화면 흔들림 {shake ? "켜짐" : "꺼짐"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => {
            closeSystemMenu();
            useTutorialStore.getState().open();
          }}
        >
          게임 방법 (도움말)
        </Button>
        {/* New tab on purpose: the guide is a public page and never touches this game session. */}
        <a
          href="/guide"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full")}
        >
          공략집
        </a>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/characters")}>
          캐릭터 선택
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "로그아웃 중..." : "로그아웃"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="relative w-full"
          onClick={() => {
            if (!isStuck) return;
            useCharacterStore.getState().unstuck();
            closeSystemMenu();
          }}
          disabled={!isStuck}
          {...stuckTooltipHandlers}
        >
          긴급 탈출 {isStuck ? "(마을로 이동)" : "(끼었을 때만 사용 가능)"}
          {stuckTooltip}
        </Button>
      </div>

      {!isTouch && (
        <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setShowKeybinds((s) => !s)}>
          단축키 안내 {showKeybinds ? "▲" : "▼"}
        </Button>
      )}
      {!isTouch && showKeybinds && (
        <div className="mt-2">
          {KEYBINDS.map(([label, key]) => (
            <div key={label} className="flex justify-between border-b-2 border-edge/15 px-0.5 py-1.5 text-sm last:border-b-0">
              <span className="text-ink">{label}</span>
              <span className="font-bold text-gold-ink">{key}</span>
            </div>
          ))}
        </div>
      )}

      {/* CC BY 3.0 requires attribution — see itemIcons.tsx for which icon came from whom. */}
      <p className="mt-3 text-center text-[10px] leading-snug text-ink-soft">
        아이템/지도 아이콘: Lorc, Delapouite, sbed, Caro Asercion, badges
        (game-icons.net, CC BY 3.0)
        <br />
        효과음: Kenney.nl (CC0)
        <br />
        자연물/마을 소품(나무/사막/다리/노점/풍차): Kenney.nl (CC0)
      </p>
    </GamePanel>
  );
}
