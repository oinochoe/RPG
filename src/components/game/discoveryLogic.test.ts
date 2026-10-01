import { describe, expect, it } from 'vitest';
import type { DiscoveryDef } from './discoveries';
import { buildGrid, isAvailable, nearestInRange, queryGrid, requirementMet, validateDefs } from './discoveryLogic';

const def = (over: Partial<DiscoveryDef> & { id: string }): DiscoveryDef => ({
  kind: 'inspect',
  name: '테스트',
  position: [0, 0],
  radius: 2,
  prop: 'rock',
  lines: ['...'],
  ...over,
});
const ctx = (over: Partial<{ level: number; seen: string[]; zone: string }> = {}) => ({
  level: over.level ?? 1,
  seen: new Set(over.seen ?? []),
  zoneAt: () => over.zone ?? 'field',
});

describe('requirementMet / isAvailable', () => {
  it('checks level, seen and zone requirements', () => {
    expect(requirementMet({ type: 'level', min: 5 }, ctx({ level: 4 }), [0, 0])).toBe(false);
    expect(requirementMet({ type: 'level', min: 5 }, ctx({ level: 5 }), [0, 0])).toBe(true);
    expect(requirementMet({ type: 'seen', id: 'a' }, ctx({ seen: ['a'] }), [0, 0])).toBe(true);
    expect(requirementMet({ type: 'seen', id: 'a' }, ctx(), [0, 0])).toBe(false);
    expect(requirementMet({ type: 'zone', zone: 'desert' }, ctx({ zone: 'desert' }), [0, 0])).toBe(true);
    expect(requirementMet({ type: 'zone', zone: 'desert' }, ctx({ zone: 'field' }), [0, 0])).toBe(false);
  });
  it('a discovery with no requirements is always available; all requirements must hold', () => {
    expect(isAvailable(def({ id: 'x' }), ctx())).toBe(true);
    const d = def({ id: 'y', requires: [{ type: 'level', min: 3 }, { type: 'seen', id: 'x' }] });
    expect(isAvailable(d, ctx({ level: 3 }))).toBe(false);
    expect(isAvailable(d, ctx({ level: 3, seen: ['x'] }))).toBe(true);
  });
});

describe('grid search', () => {
  const defs = [def({ id: 'a', position: [0, 0] }), def({ id: 'b', position: [100, 100] }), def({ id: 'c', position: [3, 0], radius: 4 })];
  const grid = buildGrid(defs);
  it('finds only entries near the query point', () => {
    expect(queryGrid(grid, 0, 0, 10).map((d) => d.id).sort()).toEqual(['a', 'c']);
    expect(queryGrid(grid, 100, 100, 10).map((d) => d.id)).toEqual(['b']);
    expect(queryGrid(grid, -500, -500, 10)).toEqual([]);
  });
  it('picks the nearest in-range, available inspect/npc discovery', () => {
    expect(nearestInRange(grid, 2.5, 0, ctx())?.id).toBe('c'); // c is closer (0.5) than a (2.5)
    expect(nearestInRange(grid, 50, 50, ctx())).toBeNull();
  });
  it('ignores trigger discoveries and unavailable ones', () => {
    const g = buildGrid([def({ id: 't', kind: 'trigger' }), def({ id: 'locked', requires: [{ type: 'level', min: 9 }] })]);
    expect(nearestInRange(g, 0, 0, ctx())).toBeNull();
  });
  it('only counts a discovery when the player is within its own radius', () => {
    const g = buildGrid([def({ id: 'small', radius: 1 })]);
    expect(nearestInRange(g, 1.5, 0, ctx())).toBeNull();
    expect(nearestInRange(g, 0.9, 0, ctx())?.id).toBe('small');
  });
  it('skipSeen ignores already-seen discoveries so the next unseen one wins', () => {
    const g = buildGrid([def({ id: 'near', position: [0, 0] }), def({ id: 'far', position: [1.5, 0] })]);
    const c = ctx({ seen: ['near'] });
    expect(nearestInRange(g, 0, 0, c)?.id).toBe('near');
    expect(nearestInRange(g, 0, 0, c, { skipSeen: true })?.id).toBe('far');
    expect(nearestInRange(buildGrid([def({ id: 'near' })]), 0, 0, c, { skipSeen: true })).toBeNull();
  });
});

describe('validateDefs', () => {
  it('accepts a clean list', () => {
    expect(validateDefs([def({ id: 'a' }), def({ id: 'b', requires: [{ type: 'seen', id: 'a' }] })])).toEqual([]);
  });
  it('rejects duplicate ids, bad radius, empty lines, bad id characters', () => {
    const problems = validateDefs([def({ id: 'a' }), def({ id: 'a' }), def({ id: 'Bad_Id' }), def({ id: 'r', radius: 0 }), def({ id: 'l', lines: [] })]);
    expect(problems.join('\n')).toMatch(/duplicate/i);
    expect(problems.join('\n')).toMatch(/Bad_Id/);
    expect(problems.join('\n')).toMatch(/radius/i);
    expect(problems.join('\n')).toMatch(/lines/i);
  });
  it('rejects a seen-requirement that points nowhere or forms a cycle', () => {
    expect(validateDefs([def({ id: 'a', requires: [{ type: 'seen', id: 'ghost' }] })]).join()).toMatch(/ghost/);
    const cyc = validateDefs([def({ id: 'a', requires: [{ type: 'seen', id: 'b' }] }), def({ id: 'b', requires: [{ type: 'seen', id: 'a' }] })]);
    expect(cyc.join()).toMatch(/cycle/i);
  });
  it('requires an npc discovery to name its model kind, and rewards to be positive', () => {
    expect(validateDefs([def({ id: 'n', kind: 'npc' })]).join()).toMatch(/npcKind/);
    expect(validateDefs([def({ id: 'g', reward: { gold: -5 } })]).join()).toMatch(/reward/i);
    expect(validateDefs([def({ id: 'e', reward: {} })]).join()).toMatch(/reward/i);
  });
});
