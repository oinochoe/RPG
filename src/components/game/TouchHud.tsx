import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Backpack, Map as MapIcon, Menu, ScrollText, User, type LucideIcon } from 'lucide-react';
import { useCombatStore } from '../../stores/combatStore';
import { useLootStore } from '../../stores/lootStore';
import { useUIStore } from '../../stores/uiStore';
import { Bar } from '../ui/bar';
import { Badge } from '../ui/badge';
import { IconButton } from '../ui/icon-button';
import { cn } from '../../lib/utils';
import { Hotbar, COMPACT_HEIGHT } from './Hotbar';
import { clearMoveTarget } from './moveTarget';
import { computeStick, resetStick, stick } from './touchInput';
import { interact } from './interactions';
import { TOUCH_BUTTON_GAP, TOUCH_STATUS_WIDTH } from './hudLayout';

const STICK_SIZE = 120;
const KNOB_SIZE = 50;
const ACTION_SIZE = 72;

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
      className="rounded-full border-[3px] border-edge/80 bg-cream/55 shadow-chunk-sm backdrop-blur-[2px]"
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        left: SAFE_LEFT,
        bottom: SAFE_BOTTOM,
        width: STICK_SIZE,
        height: STICK_SIZE,
        touchAction: 'none',
      }}
    >
      <div
        className="rounded-full border-[3px] border-edge bg-gradient-to-b from-gold-light to-gold shadow-chunk-sm"
        style={{
          position: 'absolute',
          left: half - KNOB_SIZE / 2 + knob.x,
          top: half - KNOB_SIZE / 2 + knob.y,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

const PANEL_BUTTONS: {
  label: string;
  icon: LucideIcon;
  toggle: () => void;
  isOpen: (s: ReturnType<typeof useUIStore.getState>) => boolean;
}[] = [
  { label: '가방', icon: Backpack, toggle: () => useUIStore.getState().toggleInventory(), isOpen: (s) => s.isInventoryOpen },
  { label: '캐릭터', icon: User, toggle: () => useUIStore.getState().toggleCharacterPanel(), isOpen: (s) => s.isCharacterPanelOpen },
  { label: '퀘스트', icon: ScrollText, toggle: () => useUIStore.getState().toggleQuestLog(), isOpen: (s) => s.isQuestLogOpen },
  { label: '지도', icon: MapIcon, toggle: () => useUIStore.getState().toggleMap(), isOpen: (s) => s.isMapOpen },
  { label: '메뉴', icon: Menu, toggle: () => useUIStore.getState().toggleSystemMenu(), isOpen: (s) => s.isSystemMenuOpen },
];

/** The touch replacement for the I/C/Q/M/F1 shortcuts. */
function PanelButtons() {
  const ui = useUIStore();
  return (
    <div className="pointer-events-auto flex" style={{ gap: TOUCH_BUTTON_GAP }}>
      {PANEL_BUTTONS.map(({ label, icon: Icon, toggle, isOpen }) => (
        <IconButton key={label} label={label} active={isOpen(ui)} onClick={toggle} className="touch-manipulation">
          <Icon className="size-6" strokeWidth={2.25} />
        </IconButton>
      ))}
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
      className="flex flex-col items-center gap-1"
      style={{
        position: 'absolute',
        right: SAFE_RIGHT,
        bottom: `calc(${SAFE_BOTTOM} + ${COMPACT_HEIGHT + 12}px)`,
      }}
    >
      {hint && (
        <span className="max-w-[110px] rounded-full border-2 border-edge bg-cream/95 px-2 py-0.5 text-center text-[11px] font-bold leading-4 text-ink">
          {hint}
        </span>
      )}
      <button
        onClick={() => interact()}
        style={{ width: ACTION_SIZE, height: ACTION_SIZE }}
        className={cn(
          'pointer-events-auto touch-manipulation select-none rounded-full border-[3px] border-edge font-display text-lg text-ink transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none',
          ready
            ? 'bg-gradient-to-b from-gold-light to-gold shadow-[0_4px_0_var(--color-edge),0_0_16px_var(--color-gold)]'
            : 'bg-cream/70 opacity-60 shadow-chunk-sm',
        )}
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
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', touchAction: 'none' }}>
      <div
        className="flex flex-col gap-1.5"
        style={{ position: 'absolute', left: SAFE_LEFT, top: SAFE_TOP }}
      >
        <div
          className="box-border flex flex-col gap-1 rounded-panel border-[3px] border-edge bg-cream/95 px-2 py-1.5 shadow-chunk"
          style={{ width: TOUCH_STATUS_WIDTH }}
        >
          <div>
            <Badge tone="gold">Lv.{player.level}</Badge>
          </div>
          <Bar kind="hp" ratio={player.currentHp / player.maxHp} label={`HP ${player.currentHp}/${player.maxHp}`} height={18} />
          <Bar
            kind="mp"
            ratio={player.maxMp > 0 ? player.currentMp / player.maxMp : 0}
            label={`MP ${player.currentMp}/${player.maxMp}`}
            height={18}
          />
          <Bar kind="xp" ratio={player.experience / player.expToNext} label={`EXP ${player.experience}/${player.expToNext}`} height={14} />
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
