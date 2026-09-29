import { describe, expect, it } from 'vitest';
import { clampPosition, isNarrowFor, panelFrame, touchPanelPosition } from './useDraggablePanel';

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

describe('touchPanelPosition', () => {
  it('portrait: opens below the HUD button row, centered', () => {
    const p = touchPanelPosition(320, phone);
    expect(p.y).toBeGreaterThanOrEqual(120);
    expect(p.x).toBe((phone.width - 320) / 2);
  });
  it('landscape: opens to the right of the HUD column, at the top', () => {
    const p = touchPanelPosition(320, { width: 844, height: 390 });
    expect(p.x).toBeGreaterThanOrEqual(200);
    expect(p.y).toBe(8);
  });
  it('landscape on a small phone never pushes the panel off the right edge', () => {
    const p = touchPanelPosition(320, { width: 568, height: 320 });
    expect(p.x + 320).toBeLessThanOrEqual(568);
  });
});

describe('panelFrame topInset', () => {
  it('a narrow sheet starts below the inset and shrinks to fit', () => {
    const f = panelFrame(580, { x: 0, y: 0 }, phone, 132);
    expect(f.top).toBe(132);
    expect(f.maxHeight).toBe(phone.height - 132 - 8);
  });
});
