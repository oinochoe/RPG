import { describe, expect, it } from 'vitest';
import { shadowMapSizeFor } from './LightRig';

describe('shadowMapSizeFor', () => {
  it('keeps 2048 on desktop and halves the edge on touch devices', () => {
    expect(shadowMapSizeFor(false)).toBe(2048);
    expect(shadowMapSizeFor(true)).toBe(1024);
  });
});
