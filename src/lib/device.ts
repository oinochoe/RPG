import { useEffect, useState } from 'react';

// "Touch device" = the primary pointer is a finger (phones/tablets), not "has a touchscreen
// somewhere" — a touch-screen laptop still has a mouse and keeps the desktop layout.
const COARSE_QUERY = '(pointer: coarse)';

export function detectTouch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COARSE_QUERY).matches;
}

/** Re-evaluates if the primary pointer changes (e.g. a tablet docked to a mouse). */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(detectTouch);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(COARSE_QUERY);
    const onChange = () => setIsTouch(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isTouch;
}

export interface ViewportSize {
  width: number;
  height: number;
}

function readViewport(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Live window size — panels use it to shrink to the screen and to stay inside it. */
export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(readViewport);
  useEffect(() => {
    const onResize = () => setSize(readViewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return size;
}
