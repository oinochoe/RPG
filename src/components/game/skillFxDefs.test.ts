import { describe, expect, it } from 'vitest';
import { SKILLS_BY_CLASS } from '../../stores/combatStore';
import { FALLBACK_FX, SKILL_FX, fxFor } from './skillFxDefs';
import { PART_KINDS, type FxPart } from './skillFxLife';

const allSkills = Object.values(SKILLS_BY_CLASS).flat();
const allParts = (id: number): FxPart[] => [...SKILL_FX[id].cast, ...SKILL_FX[id].impact];

describe('SKILL_FX', () => {
  it('has a definition for every skill the game defines', () => {
    for (const skill of allSkills) expect(SKILL_FX[skill.id], `skill ${skill.id} ${skill.name}`).toBeDefined();
  });

  it('marks exactly the awakening skills (requiredLevel 30) as awakening, and only they shake the camera', () => {
    for (const skill of allSkills) {
      const def = SKILL_FX[skill.id];
      if (skill.requiredLevel >= 30) {
        expect(def.tier, skill.name).toBe('awakening');
        expect(def.shake ?? 0, skill.name).toBeGreaterThan(0);
      } else {
        expect(def.tier, skill.name).toBe('normal');
        expect(def.shake, skill.name).toBeUndefined();
      }
    }
  });

  it('only uses known part kinds, hex-number colors and sane timings', () => {
    for (const skill of allSkills) {
      for (const p of allParts(skill.id)) {
        expect(PART_KINDS, `${skill.name}:${p.kind}`).toContain(p.kind);
        expect(Number.isInteger(p.color) && p.color >= 0 && p.color <= 0xffffff, `${skill.name} color`).toBe(true);
        for (const v of [p.delayMs, p.durationMs, p.staggerMs]) if (v !== undefined) expect(v).toBeGreaterThanOrEqual(0);
        if (p.count !== undefined) expect(p.count).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('gives every skill something to show on impact', () => {
    for (const skill of allSkills) expect(SKILL_FX[skill.id].impact.length, skill.name).toBeGreaterThan(0);
  });

  it('makes an AoE skill show its area with a shockwave', () => {
    for (const skill of allSkills.filter((s) => s.type === 'aoe')) {
      expect(SKILL_FX[skill.id].impact.some((p) => p.kind === 'shockwave'), skill.name).toBe(true);
    }
  });

  it('gives the three classes visibly different signature parts', () => {
    const kinds = (name: string) => new Set(SKILLS_BY_CLASS[name as keyof typeof SKILLS_BY_CLASS].flatMap((s) => allParts(s.id).map((p) => p.kind)));
    expect(kinds('warrior').has('slashArc')).toBe(true);
    expect(kinds('archer').has('trail')).toBe(true);
    expect(kinds('mage').has('orb')).toBe(true);
  });
});

describe('fxFor', () => {
  it('returns the fallback for an unknown skill id so a new skill is never invisible', () => {
    expect(fxFor(99999)).toBe(FALLBACK_FX);
    expect(FALLBACK_FX.impact.length).toBeGreaterThan(0);
  });
  it('returns the real definition for a known id', () => {
    expect(fxFor(1)).toBe(SKILL_FX[1]);
  });
});
