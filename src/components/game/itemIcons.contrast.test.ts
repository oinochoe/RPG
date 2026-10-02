import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../lib/contrast';
import { THEME } from '../../lib/theme';
import { ITEM_ICON_COLORS, TIERED_ITEM_NAMES } from './itemIcons';

// Icons are shapes on a cream inventory cell (drawn with a dark outline), not text, so the bar is
// far below AA's 4.5. Tiered items (higher tier = brighter) get a lower bar: darkening a pale top
// tier any further would flatten the tier progression.
const MIN = 1.8;
const MIN_TIERED = 1.5;
const BG = THEME.color['cream-deep'];

function luminance(hex: string): number {
  return contrastRatio(hex, '#000000');
}

describe('item icon contrast on cream-deep', () => {
  it.each(Object.entries(ITEM_ICON_COLORS))('%s (%s) stands out from the cell', (name, color) => {
    const bar = TIERED_ITEM_NAMES.has(name) ? MIN_TIERED : MIN;
    expect(contrastRatio(color, BG)).toBeGreaterThanOrEqual(bar);
  });

  it.each(['루비', '사파이어', '에메랄드', '다이아몬드'])('%s tiers keep getting brighter', (gem) => {
    const lum = [gem, `상급 ${gem}`, `최상급 ${gem}`].map((n) => luminance(ITEM_ICON_COLORS[n]));
    expect(lum[0]).toBeLessThan(lum[1]);
    expect(lum[1]).toBeLessThan(lum[2]);
  });

  it('upgraded potions are brighter than their base tier', () => {
    for (const [lo, hi] of [
      ['상급 체력 물약', '최상급 체력 물약'],
      ['상급 마나 물약', '최상급 마나 물약'],
      ['초록 물약', '강화 초록 물약'],
    ]) {
      expect(luminance(ITEM_ICON_COLORS[lo]), lo).toBeLessThan(luminance(ITEM_ICON_COLORS[hi]));
    }
  });
});
