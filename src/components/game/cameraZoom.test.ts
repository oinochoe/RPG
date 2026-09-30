import { describe, expect, it } from 'vitest';
import { cameraZoomFor, visibleWorldWidth } from './CameraRig';

describe('cameraZoomFor', () => {
  it('keeps the desktop zoom on wide screens', () => {
    expect(cameraZoomFor(1440)).toBe(110);
    expect(cameraZoomFor(1100)).toBe(110);
  });
  it('zooms out on phones so more of the world is visible', () => {
    expect(cameraZoomFor(844)).toBeLessThan(110);
    expect(cameraZoomFor(390)).toBeLessThan(cameraZoomFor(844));
  });
  it('shows about 11 world units across a phone, not the ~7 it used to', () => {
    expect(visibleWorldWidth(390)).toBeCloseTo(11, 1);
    expect(visibleWorldWidth(360)).toBeCloseTo(11, 1);
    expect(visibleWorldWidth(500)).toBeCloseTo(11, 1);
  });
  it('keeps 10 units across at the desktop breakpoint and never shows less than that on a smaller screen', () => {
    expect(visibleWorldWidth(1100)).toBeCloseTo(10, 5);
    for (const w of [1000, 900, 844, 700, 600, 500, 390, 320]) {
      expect(visibleWorldWidth(w)).toBeGreaterThanOrEqual(10 - 1e-9);
    }
  });
  it('changes smoothly across the breakpoint (no jump)', () => {
    expect(Math.abs(cameraZoomFor(1099) - cameraZoomFor(1100))).toBeLessThan(1.5);
    expect(Math.abs(cameraZoomFor(1101) - cameraZoomFor(1100))).toBeLessThan(1.5);
  });
  it('never zooms out past the floor', () => {
    expect(cameraZoomFor(200)).toBe(28);
  });
});
