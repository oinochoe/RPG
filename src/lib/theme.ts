// The game's design tokens as plain values, for the places CSS can't reach: R3F/three.js materials,
// canvas drawing, inline styles built at runtime. The same values are declared as CSS variables in
// src/index.css (`@theme`) — theme.test.ts fails if the two drift apart, and also checks that every
// text/background pair used in the UI keeps a readable contrast.

export const THEME = {
  color: {
    // Surfaces
    cream: '#FFF8E7',
    'cream-deep': '#F3E4BF',
    // Accents
    sky: '#CDE9FF',
    'sky-deep': '#7DBCEF',
    mint: '#C4EBD3',
    'mint-deep': '#4FB984',
    gold: '#F5B833',
    'gold-deep': '#C98A10',
    // Text — the decorative accent colors above are too light to read as text on cream, so text
    // gets its own darker siblings.
    ink: '#3A2E2A',
    'ink-soft': '#6B5A4C',
    'gold-ink': '#8A5300',
    'sky-ink': '#1F5F99',
    'danger-ink': '#B5233F',
    // Outlines, status, alerts
    edge: '#8B6A46',
    hp: '#F3849E',
    mp: '#4C9DF2',
    xp: '#6FCF7F',
    danger: '#C93450',
    night: '#1E2A3A',
  },
  // Item rarity, common → legendary.
  rarity: ['#9AA0A6', '#4FB984', '#4C9DF2', '#A66BE8', '#F58A2E'],
} as const;

export type ThemeColor = keyof typeof THEME.color;
export type Rarity = 1 | 2 | 3 | 4 | 5;

/** Border/name color for an item of the given rarity (1 = common … 5 = legendary). */
export function rarityColor(rarity: Rarity): string {
  return THEME.rarity[rarity - 1];
}
