import { THEME } from '../../lib/theme';

// World-map zone overlays: a hue per zone, drawn translucent over the grass, with dark ink labels
// (plus a cream halo) on top. Kept as data so a test can check the label stays readable.
const C = THEME.color;

export const MAP_ZONE_STYLE = {
  fairyForest: { fill: C['mint-deep'], opacity: 0.6 },
  orcVillage: { fill: C.hp, opacity: 0.7 },
  boneField: { fill: C['cream-deep'], opacity: 0.85 },
  ghoulPlain: { fill: C.sky, opacity: 0.75 },
} as const;

export const MAP_LABEL = { fill: C.ink, halo: C.cream } as const;

/** Grass gradient end stops the zone overlays sit on (darkest case first). */
export const MAP_GRASS = ['#4f9a3a', '#7ccd58'] as const;

/** Alpha-composite `fg` at `opacity` over `bg` (both #rrggbb). */
export function blendHex(fg: string, opacity: number, bg: string): string {
  const f = parseInt(fg.slice(1), 16);
  const b = parseInt(bg.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((f >> shift) & 255) * opacity + ((b >> shift) & 255) * (1 - opacity));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}
