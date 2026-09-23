import { useRef, useState } from 'react';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onMouseEnter() {
    if (!label) return;
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
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 6,
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid rgba(232, 201, 122, 0.5)',
          background: 'rgba(15, 17, 13, 0.95)',
          color: '#f4f1e8',
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10000,
        }}
      >
        {label}
      </div>
    ) : null;

  return { handlers: { onMouseEnter, onMouseLeave }, tooltip };
}
