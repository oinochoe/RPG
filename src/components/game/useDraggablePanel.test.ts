import { describe, expect, it } from 'vitest';
import { clampPosition, isNarrowFor, panelFrame } from './useDraggablePanel';

const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

describe('isNarrowFor', () => {
  it('a 580px panel does not fit a phone but fits a desktop', () => {
    expect(isNarrowFor(580, phone)).toBe(true);
    expect(isNarrowFor(580, desktop)).toBe(false);
  });
  it('a 320px panel still fits a normal portrait phone', () => {
    expect(isNarrowFor(320, phone)).toBe(false);
    expect(isNarrowFor(320, { width: 340, height: 700 })).toBe(true);
  });
});

describe('panelFrame', () => {
  it('pins to a full-width sheet on a narrow screen', () => {
    const f = panelFrame(580, { x: 500, y: 300 }, phone);
    expect(f.left).toBe(8);
    expect(f.right).toBe(8);
    expect(f.width).toBe('auto');
  });
  it('uses the dragged position (clamped) on a wide screen', () => {
    const f = panelFrame(580, { x: 100, y: 120 }, desktop);
    expect(f.left).toBe(100);
    expect(f.top).toBe(120);
    expect(f.width).toBe(580);
  });
  it('never lets a panel sit off the right/bottom edge', () => {
    const f = panelFrame(580, { x: 5000, y: 5000 }, desktop);
    expect(Number(f.left) + 580).toBeLessThanOrEqual(desktop.width);
    expect(Number(f.top)).toBeLessThan(desktop.height);
  });
});

describe('clampPosition', () => {
  it('keeps the top-left inside the screen', () => {
    expect(clampPosition({ x: -50, y: -50 }, 300, desktop)).toEqual({ x: 8, y: 8 });
  });
});
