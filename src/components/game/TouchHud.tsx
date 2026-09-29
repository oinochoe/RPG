import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useLootStore } from '../../stores/lootStore';
import { useUIStore } from '../../stores/uiStore';
import { Bar } from './StatusBar';
import { Hotbar, COMPACT_HEIGHT } from './Hotbar';
import { clearMoveTarget } from './moveTarget';
import { computeStick, resetStick, stick } from './touchInput';
import { interact } from './interactions';

const STICK_SIZE = 120;
const KNOB_SIZE = 50;
const ACTION_SIZE = 68;
const PANEL_BUTTON_SIZE = 36;
const STATUS_WIDTH = 5 * PANEL_BUTTON_SIZE + 4 * 4;

const GOLD = '#e8c97a';
const SAFE_LEFT = 'max(12px, env(safe-area-inset-left))';
const SAFE_RIGHT = 'max(12px, env(safe-area-inset-right))';
const SAFE_BOTTOM = 'max(12px, env(safe-area-inset-bottom))';
const SAFE_TOP = 'max(8px, env(safe-area-inset-top))';

const SHOP_NPC_LABEL: Record<'merchant' | 'blacksmith', string> = { merchant: '상인', blacksmith: '대장장이' };

/** Fixed-base virtual joystick — feeds touchInput's shared `stick`, read by CharacterMesh. */
function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const half = STICK_SIZE / 2;

  useEffect(() => () => resetStick(), []);

  function update(e: ReactPointerEvent) {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ox = e.clientX - (rect.left + rect.width / 2);
    const oy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(ox, oy);
    // The knob stays inside the ring visually; the stick value keeps using the raw offset so
    // dragging past the edge still reads as "full push".
    const clamp = dist > half ? half / dist : 1;
    setKnob({ x: ox * clamp, y: oy * clamp });
    const value = computeStick(ox, oy, half);
    stick.x = value.x;
    stick.y = value.y;
  }

  function release() {
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    resetStick();
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        if (activePointer.current !== null) return;
        activePointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        // Same rule as pressing a movement key: taking manual control cancels any
        // click-to-move / walk-then-attack destination.
        clearMoveTarget();
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === activePointer.current) update(e);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === activePointer.current) release();
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === activePointer.current) release();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        left: SAFE_LEFT,
        bottom: SAFE_BOTTOM,
        width: STICK_SIZE,
        height: STICK_SIZE,
        borderRadius: '50%',
        background: 'rgba(15, 17, 13, 0.45)',
        border: `2px solid rgba(232, 201, 122, 0.45)`,
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: half - KNOB_SIZE / 2 + knob.x,
          top: half - KNOB_SIZE / 2 + knob.y,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: '50%',
          background: 'rgba(232, 201, 122, 0.55)',
          border: '2px solid rgba(232, 201, 122, 0.9)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

const PANEL_BUTTONS: { label: string; toggle: () => void; isOpen: (s: ReturnType<typeof useUIStore.getState>) => boolean }[] = [
  { label: '가방', toggle: () => useUIStore.getState().toggleInventory(), isOpen: (s) => s.isInventoryOpen },
  { label: '캐릭', toggle: () => useUIStore.getState().toggleCharacterPanel(), isOpen: (s) => s.isCharacterPanelOpen },
  { label: '퀘스트', toggle: () => useUIStore.getState().toggleQuestLog(), isOpen: (s) => s.isQuestLogOpen },
  { label: '지도', toggle: () => useUIStore.getState().toggleMap(), isOpen: (s) => s.isMapOpen },
  { label: '메뉴', toggle: () => useUIStore.getState().toggleSystemMenu(), isOpen: (s) => s.isSystemMenuOpen },
];

const roundButton: CSSProperties = {
  pointerEvents: 'auto',
  borderRadius: 8,
  border: '1px solid rgba(232, 201, 122, 0.5)',
  color: GOLD,
  fontWeight: 700,
  touchAction: 'manipulation',
  padding: 0,
};

/** The touch replacement for the I/C/Q/M/F1 shortcuts. */
function PanelButtons() {
  const ui = useUIStore();
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PANEL_BUTTONS.map((b) => {
        const open = b.isOpen(ui);
        return (
          <button
            key={b.label}
            onClick={b.toggle}
            style={{
              ...roundButton,
              width: PANEL_BUTTON_SIZE,
              height: PANEL_BUTTON_SIZE,
              fontSize: 10,
              background: open ? 'rgba(232, 201, 122, 0.35)' : 'rgba(15, 17, 13, 0.65)',
            }}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

/** Replaces Space (talk) and F4 (pick up): one button that does whichever applies. */
function ActionButton() {
  const nearShopKind = useUIStore((s) => s.nearShopKind);
  const nearQuestNpcName = useUIStore((s) => s.nearQuestNpcName);
  const nearDropId = useUIStore((s) => s.nearDropId);
  const drops = useLootStore((s) => s.drops);

  const drop = nearDropId !== null ? drops.find((d) => d.id === nearDropId) : undefined;
  let label = '행동';
  let hint: string | null = null;
  if (nearShopKind) {
    label = '대화';
    hint = SHOP_NPC_LABEL[nearShopKind];
  } else if (nearQuestNpcName) {
    label = '대화';
    hint = nearQuestNpcName;
  } else if (drop) {
    label = '줍기';
    hint = drop.itemName;
  }
  const ready = hint !== null;

  return (
    <div
      style={{
        position: 'absolute',
        right: SAFE_RIGHT,
        bottom: `calc(${SAFE_BOTTOM} + ${COMPACT_HEIGHT + 12}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {hint && (
        <span
          style={{
            color: GOLD,
            fontSize: 11,
            fontWeight: 700,
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            maxWidth: 110,
            textAlign: 'center',
          }}
        >
          {hint}
        </span>
      )}
      <button
        onClick={() => interact()}
        style={{
          ...roundButton,
          width: ACTION_SIZE,
          height: ACTION_SIZE,
          borderRadius: '50%',
          fontSize: 14,
          borderWidth: 2,
          opacity: ready ? 1 : 0.4,
          background: ready ? 'rgba(232, 201, 122, 0.4)' : 'rgba(15, 17, 13, 0.65)',
          boxShadow: ready ? '0 0 12px rgba(232, 201, 122, 0.6)' : 'none',
        }}
      >
        {label}
      </button>
    </div>
  );
}

/**
 * Phone layout. Same information as the desktop HUD (level + HP/MP/EXP, hotbar, prompts) but
 * arranged for thumbs: status + panel buttons top-left (the minimap owns top-right), joystick
 * bottom-left, hotbar + action button bottom-right. Nothing here needs a keyboard.
 */
export function TouchHud() {
  const player = useCombatStore((s) => s.player);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: SAFE_LEFT,
          top: SAFE_TOP,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            padding: '6px 8px',
            width: STATUS_WIDTH,
            boxSizing: 'border-box',
            borderRadius: 10,
            background: 'rgba(15, 17, 13, 0.65)',
            border: '1px solid rgba(232, 201, 122, 0.4)',
          }}
        >
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>Lv.{player.level}</span>
          <Bar ratio={player.currentHp / player.maxHp} color="#57c25b" label={`HP ${player.currentHp}/${player.maxHp}`} width={STATUS_WIDTH - 18} />
          <Bar
            ratio={player.maxMp > 0 ? player.currentMp / player.maxMp : 0}
            color="#5b8bd5"
            label={`MP ${player.currentMp}/${player.maxMp}`}
            width={STATUS_WIDTH - 18}
          />
          <Bar
            ratio={player.experience / player.expToNext}
            color="#d5a85b"
            label={`EXP ${player.experience}/${player.expToNext}`}
            height={10}
            width={STATUS_WIDTH - 18}
          />
        </div>
        <PanelButtons />
      </div>

      <Joystick />
      <ActionButton />

      <div style={{ position: 'absolute', right: SAFE_RIGHT, bottom: SAFE_BOTTOM }}>
        <Hotbar compact />
      </div>
    </div>
  );
}
