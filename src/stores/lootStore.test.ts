import { describe, expect, it, vi } from 'vitest';
import { rollDropEntry } from './lootStore';

vi.mock('../api/characters', () => ({}));

const SCROLL_IDS = new Set([47, 48, 50, 86]);

function scrollRate(templateId: number, name: string, n = 50_000): number {
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const entry = rollDropEntry(templateId, name);
    if (entry && SCROLL_IDS.has(entry.itemTemplateId)) hits++;
  }
  return hits / n;
}

describe('enchant scroll drop rates', () => {
  it('regular monsters drop an enchant scroll ~1% of kills or less', () => {
    expect(scrollRate(1, '슬라임')).toBeLessThan(0.015);
    expect(scrollRate(6, '오크')).toBeLessThan(0.02);
  });

  it('bosses drop them far more often than regular monsters', () => {
    expect(scrollRate(5, '거인 군주')).toBeGreaterThan(0.15);
  });
});
