import type { SkillFxDef } from './skillFxLife';

// Each skill is a recipe of parts (see skillFxLife.FxPart): `cast` plays when the skill leaves the
// caster, `impact` plays when it lands (after the projectile's flight time for ranged classes).
// Colors are hex numbers — three.js materials cannot read CSS variables.

const GOLD = 0xffcf5c;
const AMBER = 0xff9f4a;
const EARTH = 0xc26a2b;
const CRIMSON = 0xff3c3c;
const PALE_LIME = 0xeaffb0;
const MINT = 0xbfffd8;
const LIME = 0xd8ff7a;
const JADE = 0x8affc1;
const FIRE = 0xff6a2b;
const VIOLET = 0xc08bff;
const ICE = 0x9ad8ff;
const METEOR = 0xff4d1a;
const SPARK_WHITE = 0xffffff;
const SPARK_GOLD = 0xffd54a;

export const SKILL_FX: Record<number, SkillFxDef> = {
  // --- warrior: slash arcs ---
  1: {
    // 강타
    tier: 'normal',
    cast: [{ kind: 'flash', color: GOLD, scale: 1.1 }],
    impact: [
      { kind: 'slashArc', color: GOLD, scale: 1.6, angle: -0.5 },
      { kind: 'sparks', color: SPARK_GOLD, count: 14, scale: 1.2 },
    ],
  },
  4: {
    // 연속베기
    tier: 'normal',
    cast: [],
    impact: [
      { kind: 'slashArc', color: AMBER, scale: 1.1, angle: -0.8 },
      { kind: 'slashArc', color: AMBER, scale: 1.1, angle: 0.8, delayMs: 90 },
      { kind: 'sparks', color: SPARK_WHITE, count: 8 },
    ],
  },
  5: {
    // 대지진동
    tier: 'normal',
    cast: [{ kind: 'flash', color: EARTH, scale: 1.2 }],
    impact: [
      { kind: 'shockwave', color: EARTH, scale: 1 },
      { kind: 'sparks', color: EARTH, count: 18, scale: 1.3 },
    ],
  },
  10: {
    // 필살의 일격 (awakening)
    tier: 'awakening',
    shake: 0.18,
    cast: [
      { kind: 'pillar', color: CRIMSON, scale: 1.4, at: 'from' },
      { kind: 'flash', color: CRIMSON, scale: 1.8 },
    ],
    impact: [
      { kind: 'slashArc', color: CRIMSON, scale: 2.6, angle: -0.4 },
      { kind: 'shockwave', color: CRIMSON, scale: 1.2 },
      { kind: 'sparks', color: SPARK_GOLD, count: 28, scale: 1.6 },
    ],
  },
  // --- archer: light-arrow trails ---
  2: {
    // 관통사격
    tier: 'normal',
    cast: [{ kind: 'trail', color: PALE_LIME, scale: 1.4 }],
    impact: [
      { kind: 'sparks', color: PALE_LIME, count: 10 },
      { kind: 'flash', color: PALE_LIME, scale: 0.8 },
    ],
  },
  6: {
    // 속사
    tier: 'normal',
    cast: [{ kind: 'trail', color: MINT, scale: 0.8, count: 3, staggerMs: 40, spread: 0.06 }],
    impact: [{ kind: 'sparks', color: MINT, count: 6 }],
  },
  7: {
    // 산탄사격
    tier: 'normal',
    cast: [{ kind: 'trail', color: LIME, scale: 0.9, count: 3, spread: 0.35 }],
    impact: [
      { kind: 'shockwave', color: LIME, scale: 1 },
      { kind: 'sparks', color: LIME, count: 14 },
    ],
  },
  11: {
    // 폭풍의 화살 (awakening)
    tier: 'awakening',
    shake: 0.16,
    cast: [
      { kind: 'flash', color: JADE, scale: 1.4 },
      { kind: 'fall', color: JADE, scale: 0.5, count: 9, staggerMs: 25, durationMs: 260 },
    ],
    impact: [
      { kind: 'shockwave', color: JADE, scale: 1, delayMs: 150 },
      { kind: 'sparks', color: JADE, count: 24, scale: 1.4, delayMs: 150 },
    ],
  },
  // --- mage: orbs, pillars, falling fire ---
  3: {
    // 파이어볼
    tier: 'normal',
    cast: [{ kind: 'orb', color: FIRE, scale: 1.2 }],
    impact: [
      { kind: 'sparks', color: FIRE, count: 14, scale: 1.2 },
      { kind: 'shockwave', color: FIRE, scale: 0.6 },
      { kind: 'flash', color: FIRE, scale: 1.2 },
    ],
  },
  8: {
    // 매직미사일
    tier: 'normal',
    cast: [{ kind: 'orb', color: VIOLET, scale: 0.6, count: 3, staggerMs: 40, spread: 0.25 }],
    impact: [{ kind: 'sparks', color: VIOLET, count: 8 }],
  },
  9: {
    // 블리자드
    tier: 'normal',
    cast: [{ kind: 'flash', color: ICE, scale: 1.2 }],
    impact: [
      { kind: 'pillar', color: ICE, scale: 1.2 },
      { kind: 'shockwave', color: ICE, scale: 1 },
      { kind: 'sparks', color: 0xbfe9ff, count: 20 },
    ],
  },
  12: {
    // 메테오 (awakening)
    tier: 'awakening',
    shake: 0.24,
    cast: [
      { kind: 'flash', color: METEOR, scale: 1.6 },
      { kind: 'fall', color: METEOR, scale: 2, durationMs: 330 },
    ],
    impact: [
      { kind: 'shockwave', color: METEOR, scale: 1.3, delayMs: 130 },
      { kind: 'pillar', color: 0xff8a3c, scale: 1.6, delayMs: 130 },
      { kind: 'sparks', color: METEOR, count: 36, scale: 1.8, delayMs: 130 },
    ],
  },
};

/** What an unknown skill id looks like — a plain flash and a burst, so a new skill is never invisible. */
export const FALLBACK_FX: SkillFxDef = {
  tier: 'normal',
  cast: [{ kind: 'flash', color: SPARK_WHITE }],
  impact: [{ kind: 'sparks', color: SPARK_WHITE, count: 10 }],
};

export function fxFor(skillId: number): SkillFxDef {
  return SKILL_FX[skillId] ?? FALLBACK_FX;
}
