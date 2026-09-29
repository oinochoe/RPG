import { describe, expect, it } from 'vitest';
import { cameraZoomFor } from './CameraRig';

describe('cameraZoomFor', () => {
  it('keeps the desktop zoom on wide screens', () => {
    expect(cameraZoomFor(1440)).toBe(110);
    expect(cameraZoomFor(1100)).toBe(110);
  });
  it('zooms out on phones so more of the world is visible', () => {
    expect(cameraZoomFor(844)).toBeLessThan(110);
    expect(cameraZoomFor(390)).toBeLessThan(cameraZoomFor(844));
  });
  it('never zooms out past the floor', () => {
    expect(cameraZoomFor(200)).toBe(55);
  });
});
