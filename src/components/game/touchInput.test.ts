import { describe, expect, it } from 'vitest';
import { computeStick, stickToWorldDir } from './touchInput';

describe('computeStick', () => {
  it('ignores tiny pushes inside the dead zone', () => {
    expect(computeStick(3, 3, 60)).toEqual({ x: 0, y: 0 });
    expect(computeStick(0, 0, 60)).toEqual({ x: 0, y: 0 });
  });

  it('pushing the knob up (negative screen y) reads as +y, right as +x', () => {
    const up = computeStick(0, -60, 60);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    const right = computeStick(60, 0, 60);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
  });

  it('caps at full magnitude when dragged past the ring', () => {
    const v = computeStick(300, -400, 60);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it('scales with how far it is pushed', () => {
    const v = computeStick(0, -30, 60);
    expect(v.y).toBeCloseTo(0.5);
  });
});

describe('stickToWorldDir', () => {
  // forward/right are unit vectors on the ground plane, like CharacterMesh's camera basis.
  const forward: [number, number] = [-0.7071, -0.7071];
  const right: [number, number] = [0.7071, -0.7071];

  it('stick up moves along the camera-forward direction', () => {
    const [x, z] = stickToWorldDir(0, 1, forward, right);
    expect(x).toBeCloseTo(forward[0]);
    expect(z).toBeCloseTo(forward[1]);
  });

  it('stick right moves along camera-right, stick down moves backward', () => {
    const [rx, rz] = stickToWorldDir(1, 0, forward, right);
    expect([rx, rz]).toEqual([right[0], right[1]]);
    const [bx, bz] = stickToWorldDir(0, -1, forward, right);
    expect(bx).toBeCloseTo(-forward[0]);
    expect(bz).toBeCloseTo(-forward[1]);
  });
});
