import { describe, expect, it } from 'vitest';
import type { DiscoveryDef } from './discoveries';
import { RENDER_RADIUS, selectMapMarkers, selectRenderable, selectTriggered } from './discoveryRender';

const def = (over: Partial<DiscoveryDef> & { id: string }): DiscoveryDef => ({
  kind: 'inspect',
  name: '테스트',
  position: [0, 0],
  radius: 2,
  prop: 'rock',
  lines: ['...'],
  ...over,
});
const ctx = (over: Partial<{ level: number; seen: string[] }> = {}) => ({
  level: over.level ?? 1,
  seen: new Set(over.seen ?? []),
  zoneAt: () => 'field',
});

describe('selectRenderable', () => {
  it('includes only those within RENDER_RADIUS', () => {
    const near = def({ id: 'near', position: [RENDER_RADIUS - 1, 0] });
    const far = def({ id: 'far', position: [RENDER_RADIUS + 1, 0] });
    expect(selectRenderable([near, far], 0, 0, ctx()).map((d) => d.id)).toEqual(['near']);
  });
  it('excludes unmet requirements', () => {
    const d = def({ id: 'a', requires: [{ type: 'level', min: 5 }] });
    expect(selectRenderable([d], 0, 0, ctx({ level: 4 }))).toEqual([]);
    expect(selectRenderable([d], 0, 0, ctx({ level: 5 }))).toHaveLength(1);
  });
  it('excludes prop none unless it is an npc', () => {
    const trig = def({ id: 't', kind: 'trigger', prop: 'none' });
    const npc = def({ id: 'n', kind: 'npc', prop: 'none', npcKind: 'villager' });
    expect(selectRenderable([trig, npc], 0, 0, ctx()).map((d) => d.id)).toEqual(['n']);
  });
});

describe('selectMapMarkers', () => {
  it('shows non-hidden always, hidden only once seen', () => {
    const a = def({ id: 'a' });
    const h = def({ id: 'h', hidden: true });
    expect(selectMapMarkers([a, h], new Set()).map((d) => d.id)).toEqual(['a']);
    expect(selectMapMarkers([a, h], new Set(['h'])).map((d) => d.id)).toEqual(['a', 'h']);
  });
});

describe('selectTriggered', () => {
  const t = def({ id: 't', kind: 'trigger', prop: 'none', radius: 3, position: [10, 0] });
  it('fires for an available, unseen, unfired trigger inside its radius', () => {
    expect(selectTriggered([t], 10, 2, ctx(), new Set()).map((d) => d.id)).toEqual(['t']);
  });
  it('skips outside radius, seen, already fired, and non-triggers', () => {
    expect(selectTriggered([t], 0, 0, ctx(), new Set())).toEqual([]);
    expect(selectTriggered([t], 10, 0, ctx({ seen: ['t'] }), new Set())).toEqual([]);
    expect(selectTriggered([t], 10, 0, ctx(), new Set(['t']))).toEqual([]);
    expect(selectTriggered([def({ id: 'i', position: [10, 0] })], 10, 0, ctx(), new Set())).toEqual([]);
  });
});
