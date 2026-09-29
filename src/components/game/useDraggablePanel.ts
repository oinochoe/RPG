import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { detectTouch, useIsTouch, useViewportSize, type ViewportSize } from '../../lib/device';
import { TOUCH_LEFT_COLUMN, TOUCH_TOP_INSET } from './hudLayout';

export interface DraggablePosition {
  x: number;
  y: number;
}

// Gap kept between a panel and the screen edge when it is pinned/clamped.
const EDGE_GAP = 8;
// Keep at least this much of the header on screen so a dragged panel can always be grabbed
// back.
const MIN_VISIBLE_HEADER = 48;

// The phone HUD (TouchHud) keeps its status card + panel-button row in the top-left column. A
// panel must not open on top of those buttons, or it can't be toggled closed with them.
// Portrait: open below that block. Landscape: open to the right of it.

/** Where a panel of `width` first opens on a phone (instead of the desktop default). */
export function touchPanelPosition(width: number, viewport: ViewportSize): DraggablePosition {
  if (viewport.width > viewport.height) {
    return { x: Math.max(EDGE_GAP, Math.min(TOUCH_LEFT_COLUMN, viewport.width - width - EDGE_GAP)), y: EDGE_GAP };
  }
  return { x: Math.max(EDGE_GAP, (viewport.width - width) / 2), y: TOUCH_TOP_INSET };
}

/** True when the screen is too narrow for a panel of `width` px to sit as a floating window. */
export function isNarrowFor(width: number, viewport: ViewportSize): boolean {
  return viewport.width < width + EDGE_GAP * 4;
}

/** Keeps a dragged panel's top-left corner where the panel stays reachable on screen. */
export function clampPosition(pos: DraggablePosition, width: number, viewport: ViewportSize): DraggablePosition {
  const maxX = Math.max(EDGE_GAP, viewport.width - Math.min(width, viewport.width) - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, viewport.height - MIN_VISIBLE_HEADER);
  return {
    x: Math.min(Math.max(pos.x, EDGE_GAP), maxX),
    y: Math.min(Math.max(pos.y, EDGE_GAP), maxY),
  };
}

/**
 * The CSS box a panel should use: a floating window at `position` on a big screen, or a
 * full-width sheet pinned to the top on a phone (where a fixed 320-580px window would run off
 * the edge and can't be dragged anywhere useful).
 */
export function panelFrame(
  width: number,
  position: DraggablePosition,
  viewport: ViewportSize,
  topInset: number = EDGE_GAP,
): CSSProperties {
  if (isNarrowFor(width, viewport)) {
    return {
      left: EDGE_GAP,
      right: EDGE_GAP,
      top: topInset,
      width: 'auto',
      maxHeight: viewport.height - topInset - EDGE_GAP,
      overflowY: 'auto',
      boxSizing: 'border-box',
    };
  }
  const clamped = clampPosition(position, width, viewport);
  return { left: clamped.x, top: clamped.y, width, maxHeight: viewport.height - EDGE_GAP * 2, overflowY: 'auto' };
}

/**
 * Lets a fixed-position panel be repositioned by dragging its header — with a mouse or a
 * finger (pointer events, so one code path covers both). Position is plain pixel coordinates
 * (top-left corner) rather than the panel's original anchor — callers pass a lazy
 * `getDefaultPosition` that runs once on mount to compute the starting pixel position from
 * the panel's intended default anchor.
 *
 * The component itself stays mounted even while "closed" (each panel does
 * `if (!isOpen) return null` after calling every hook, rather than unmounting), so this
 * position naturally persists across a close/reopen within the same session.
 *
 * `frameStyle` is what the panel should spread into its root style: on a phone it turns the
 * window into a full-width sheet and drag is disabled (there is nowhere to drag it to).
 * The header element also needs `touchAction: 'none'` so a finger drag isn't taken by
 * browser scrolling.
 */
export function useDraggablePanel(getDefaultPosition: () => DraggablePosition, width: number) {
  const [position, setPosition] = useState<DraggablePosition>(() =>
    detectTouch()
      ? touchPanelPosition(width, { width: window.innerWidth, height: window.innerHeight })
      : getDefaultPosition(),
  );
  const viewport = useViewportSize();
  const isTouch = useIsTouch();
  // A full-width sheet in portrait must start below the HUD's button row, not cover it.
  const topInset = isTouch && viewport.height >= viewport.width ? TOUCH_TOP_INSET : EDGE_GAP;
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const narrow = isNarrowFor(width, viewport);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Mouse: primary button only. Touch/pen always report button 0 on contact.
      if (e.button !== 0 || narrow) return;
      // Skip when the press landed on an interactive control inside the header (e.g. the ✕
      // close button) so tapping it doesn't also kick off a drag.
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select')) return;

      const pointerId = e.pointerId;
      const current = clampPosition(position, width, viewport);
      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: current.x, originY: current.y };

      function onMove(ev: PointerEvent) {
        if (!dragRef.current || ev.pointerId !== pointerId) return;
        setPosition({
          x: dragRef.current.originX + (ev.clientX - dragRef.current.startX),
          y: dragRef.current.originY + (ev.clientY - dragRef.current.startY),
        });
      }
      function onUp(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return;
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [position, narrow, width, viewport],
  );

  return { position, onHeaderPointerDown, frameStyle: panelFrame(width, position, viewport, topInset), narrow };
}
