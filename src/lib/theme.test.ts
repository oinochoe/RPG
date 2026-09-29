/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME, rarityColor, type ThemeColor } from './theme';
import { contrastRatio } from './contrast';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const c = (name: ThemeColor) => THEME.color[name];

describe('theme tokens', () => {
  it('every token in theme.ts is declared with the same value in index.css', () => {
    for (const [name, hex] of Object.entries(THEME.color)) {
      const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
      expect(match, `--color-${name} missing from index.css`).not.toBeNull();
      expect(match![1].toLowerCase(), `--color-${name}`).toBe(hex.toLowerCase());
    }
  });

  it('every color declared in index.css exists in theme.ts', () => {
    const declared = [...css.matchAll(/--color-([a-z-]+):\s*#[0-9a-fA-F]{6}/g)].map((m) => m[1]);
    for (const name of declared) {
      expect(Object.keys(THEME.color), `--color-${name} has no theme.ts entry`).toContain(name);
    }
  });

  it('maps a rarity to its color', () => {
    expect(rarityColor(1)).toBe(THEME.rarity[0]);
    expect(rarityColor(5)).toBe(THEME.rarity[4]);
  });
});

// The UI only ever puts these colors on these backgrounds. Body text needs WCAG AA (4.5:1).
const AA = 4.5;
const PAIRS: [text: ThemeColor, background: ThemeColor][] = [
  ['ink', 'cream'],
  ['ink', 'cream-deep'],
  ['ink', 'sky'],
  ['ink', 'sky-deep'],
  ['ink', 'mint'],
  ['ink', 'mint-deep'],
  ['ink', 'gold'],
  ['ink', 'hp'],
  ['ink', 'mp'],
  ['ink', 'xp'],
  ['ink-soft', 'cream'],
  ['ink-soft', 'cream-deep'],
  ['ink-soft', 'sky'],
  ['gold-ink', 'cream'],
  ['gold-ink', 'cream-deep'],
  ['sky-ink', 'cream'],
  ['sky-ink', 'cream-deep'],
  ['sky-ink', 'sky'],
  ['danger-ink', 'cream'],
  ['danger-ink', 'cream-deep'],
  ['cream', 'danger'],
];

describe('theme contrast', () => {
  it.each(PAIRS)('%s on %s is readable (AA)', (text, background) => {
    expect(contrastRatio(c(text), c(background))).toBeGreaterThanOrEqual(AA);
  });

  it('ink stays readable on the brightest rarity color', () => {
    expect(contrastRatio(c('ink'), THEME.rarity[4])).toBeGreaterThanOrEqual(AA);
  });
});
