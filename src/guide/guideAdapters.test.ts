import { describe, expect, it } from 'vitest';
import { SKILLS_BY_CLASS } from '../stores/combatStore';
import { dropChancesFor } from '../../supabase/functions/api/drops';
import { guideSkills, CLASS_LABEL } from './guideSkills';
import { guideBosses, guideMonsters } from './guideMonsters';

describe('guideSkills', () => {
  it('lists every skill of every class, sorted by required level, with seconds and an awakening flag', () => {
    const g = guideSkills();
    for (const cls of ['warrior', 'archer', 'mage'] as const) {
      expect(g[cls].map((s) => s.id).sort()).toEqual(SKILLS_BY_CLASS[cls].map((s) => s.id).sort());
      const levels = g[cls].map((s) => s.requiredLevel);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
      expect(CLASS_LABEL[cls]).toBeTruthy();
    }
    const awakening = Object.values(g).flat().filter((s) => s.awakening);
    expect(awakening.length).toBe(3);
    const sample = g.warrior[0];
    expect(sample.cooldownSec).toBeCloseTo(SKILLS_BY_CLASS.warrior.find((s) => s.id === sample.id)!.cooldownMs / 1000, 5);
  });
  it('marks an AoE skill with its radius and a single-target one without', () => {
    const all = Object.values(guideSkills()).flat();
    expect(all.some((s) => s.kind === '광역' && (s.radius ?? 0) > 0)).toBe(true);
    expect(all.filter((s) => s.kind === '단일').every((s) => s.radius === null)).toBe(true);
  });
  it('tolerates an empty source', () => {
    expect(guideSkills({ warrior: [], archer: [], mage: [] })).toEqual({ warrior: [], archer: [], mage: [] });
  });
});

describe('guideMonsters / guideBosses', () => {
  it('names and places every monster template that has drops (ids 1-15)', () => {
    const monsters = guideMonsters();
    for (let id = 1; id <= 15; id++) {
      if (id === 5) continue; // 5 is the giant lord species (bosses only); covered by guideBosses
      const m = monsters.find((x) => x.templateId === id);
      expect(m, `template ${id}`).toBeDefined();
      expect(m!.name.length, `template ${id} name`).toBeGreaterThan(0);
      expect(m!.zones.length, `template ${id} zones`).toBeGreaterThan(0);
      expect(m!.drops).toEqual(dropChancesFor(id, m!.name));
    }
  });
  it('lists the five tracked bosses with their guaranteed drop tables', () => {
    const bosses = guideBosses();
    expect(bosses.map((b) => b.name).sort()).toEqual(['구울 군주', '거인 군주', '버섯 군주', '오크 군주', '태고의 거인'].sort());
    for (const b of bosses) {
      expect(b.level).toBeGreaterThan(0);
      expect(b.drops.reduce((n, c) => n + c.chance, 0)).toBeCloseTo(1, 5);
    }
  });
});
