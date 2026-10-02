import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../lib/contrast';
import { MAP_GRASS, MAP_LABEL, MAP_ZONE_STYLE, blendHex } from './mapPalette';

describe('map palette', () => {
  it('blends translucent colors', () => {
    expect(blendHex('#000000', 0.5, '#ffffff')).toBe('#808080');
  });

  it.each(Object.entries(MAP_ZONE_STYLE))('%s label is readable on its overlay', (_name, z) => {
    for (const grass of MAP_GRASS) {
      const bg = blendHex(z.fill, z.opacity, grass);
      expect(contrastRatio(MAP_LABEL.fill, bg), `${z.fill} over ${grass} = ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
