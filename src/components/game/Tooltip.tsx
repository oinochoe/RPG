import { useRef, useState } from 'react';
import { useIsTouch } from '../../lib/device';

// The browser's native `title` attribute waits ~700ms-1s (OS-dependent) before showing —
// fine for a one-off hint, too slow for skimming item names across a full inventory grid.
// This shows almost immediately instead.
const SHOW_DELAY_MS = 120;

/** Spread `handlers` onto the hoverable element (it must be `position: relative` — every
 * caller here already is, for their own absolutely-positioned badges/labels) and render
 * `tooltip` as a child of that same element so it anchors correctly. Renders nothing while
 * `label` is falsy (an empty slot has no name to show). */
export function useTooltip(label: string | null | undefined): {
  handlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  tooltip: React.ReactNode;
} {
  const [visible, setVisible] = useState(false);
  // A tap fires an emulated mouseenter with no matching mouseleave, so on a phone a tooltip would
  // stick on screen until the next tap elsewhere. There is no hover on touch — show none.
  const isTouch = useIsTouch();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onMouseEnter() {
    if (!label || isTouch) return;
    timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  }

  function onMouseLeave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }

  const tooltip =
    visible && label ? (
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-[10000] mb-2 -translate-x-1/2 whitespace-nowrap rounded-control border-[3px] border-edge bg-cream px-2.5 py-1 text-xs font-bold text-ink shadow-chunk-sm"
      >
        {label}
      </div>
    ) : null;

  return { handlers: { onMouseEnter, onMouseLeave }, tooltip };
}
