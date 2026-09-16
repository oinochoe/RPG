import { useCallback, useRef, useState } from 'react';

export interface DraggablePosition {
  x: number;
  y: number;
}

/**
 * Lets a fixed-position panel be repositioned by dragging its header. Position is plain
 * pixel coordinates (top-left corner) rather than the panel's original anchor (e.g.
 * `left: 16` / `top: '50%'` + a translate) — callers pass a lazy `getDefaultPosition` that
 * runs once on mount to compute the starting pixel position from the panel's intended
 * default anchor (e.g. `{ x: 16, y: window.innerHeight / 2 - halfHeight }`).
 *
 * The component itself stays mounted even while "closed" (each panel does
 * `if (!isOpen) return null` after calling every hook, rather than unmounting), so this
 * position naturally persists across a close/reopen within the same session — dragging a
 * panel once keeps it there until the page reloads, rather than snapping back to the
 * default spot every time.
 */
export function useDraggablePanel(getDefaultPosition: () => DraggablePosition) {
  const [position, setPosition] = useState<DraggablePosition>(getDefaultPosition);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only the primary button starts a drag, and skip when the mousedown itself landed on
      // an interactive control inside the header (e.g. the ✕ close button) so clicking it
      // doesn't also kick off a drag.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select')) return;

      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };

      function onMouseMove(ev: MouseEvent) {
        if (!dragRef.current) return;
        setPosition({
          x: dragRef.current.originX + (ev.clientX - dragRef.current.startX),
          y: dragRef.current.originY + (ev.clientY - dragRef.current.startY),
        });
      }
      function onMouseUp() {
        dragRef.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [position],
  );

  return { position, onHeaderMouseDown };
}
