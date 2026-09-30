import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsTouch } from '../../lib/device';

// The browser's native `title` attribute waits ~700ms-1s (OS-dependent) before showing —
// fine for a one-off hint, too slow for skimming item names across a full inventory grid.
// This shows almost immediately instead.
const SHOW_DELAY_MS = 120;
// Half of the widest a bubble gets (see the max-w below) — the bubble is centered on the hovered
// element, so its center is kept this far from either screen edge to stay fully visible.
const EDGE_MARGIN = 132;

interface Anchor {
  x: number;
  y: number;
}

/** Spread `handlers` onto the hoverable element and render `tooltip` next to it (as a child, so
 * the hook stays a drop-in). Renders nothing while `label` is falsy (an empty slot has no name to
 * show).
 *
 * The bubble is drawn in a portal at fixed screen coordinates instead of absolutely positioned
 * inside the element. Inside a scrolling panel an absolutely positioned bubble near the edge
 * widens the panel's scrollable area — that was the stray horizontal scrollbar on the shop and
 * inventory windows — and a panel's overflow could also clip it. */
export function useTooltip(label: string | null | undefined): {
  handlers: {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
  };
  tooltip: ReactNode;
} {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // A tap fires an emulated mouseenter with no matching mouseleave, so on a phone a tooltip would
  // stick on screen until the next tap elsewhere. There is no hover on touch — show none.
  const isTouch = useIsTouch();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onMouseEnter(e: MouseEvent<HTMLElement>) {
    if (!label || isTouch) return;
    // The event object is gone by the time the timer fires, so read the position now.
    const rect = e.currentTarget.getBoundingClientRect();
    const next = { x: rect.left + rect.width / 2, y: rect.top };
    timerRef.current = setTimeout(() => setAnchor(next), SHOW_DELAY_MS);
  }

  function onMouseLeave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAnchor(null);
  }

  const tooltip =
    anchor && label
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[2147483647] max-w-[264px] -translate-x-1/2 -translate-y-full whitespace-normal rounded-control border-[3px] border-edge bg-cream px-2.5 py-1 text-center text-xs font-bold leading-snug text-ink shadow-chunk-sm"
            style={{
              left: Math.min(Math.max(anchor.x, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerWidth - EDGE_MARGIN)),
              top: anchor.y - 8,
            }}
          >
            {label}
          </div>,
          document.body,
        )
      : null;

  return { handlers: { onMouseEnter, onMouseLeave }, tooltip };
}
