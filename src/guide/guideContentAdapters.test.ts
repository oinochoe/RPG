import { describe, expect, it } from 'vitest';
import type { DiscoveryDef } from '../components/game/discoveries';
import { QUEST_DEFS } from '../stores/questStore';
import { guideQuests, MAIN_QUEST_UNLOCK_TEXT } from './guideQuests';
import { buildGuideDiscoveries, canRevealWhere, describeRequirement, describeReward, groupByZone, initialStage, roundedCoords } from './guideDiscoveries';

const def = (over: Partial<DiscoveryDef> & { id: string }): DiscoveryDef => ({
  kind: 'inspect', name: over.id, position: [0, 0], radius: 2.5, prop: 'rock', lines: ['x'], ...over,
});
const zoneOf = (x: number) => (x < 0 ? 'village' : 'desert');

describe('guideQuests', () => {
  it('groups every quest by village, story before repeatable before main', () => {
    const groups = guideQuests();
    const all = groups.flatMap((g) => g.quests);
    expect(all.map((q) => q.id).sort((a, b) => a - b)).toEqual(QUEST_DEFS.map((q) => q.id).sort((a, b) => a - b));
    for (const g of groups) {
      const order = g.quests.map((q) => ['스토리', '반복', '메인'].indexOf(q.kind));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
    expect(all.filter((q) => q.kind === '메인').length).toBe(QUEST_DEFS.filter((q) => q.isMainQuest).length);
  });
  it('states what a quest asks for and pays', () => {
    const q = guideQuests().flatMap((g) => g.quests).find((x) => x.id === 1)!;
    expect(q.target).toMatch(/슬라임/);
    expect(q.reward).toMatch(/경험치/);
    expect(q.reward).toMatch(/골드/);
  });
  it('explains how the main quest unlocks, naming the story quests', () => {
    expect(MAIN_QUEST_UNLOCK_TEXT).toContain(QUEST_DEFS.find((q) => q.id === 1)!.title);
  });
  it('tolerates an empty catalog', () => {
    expect(guideQuests([])).toEqual([]);
  });
});

describe('guideDiscoveries helpers', () => {
  it('rounds coordinates to the nearest step', () => {
    expect(roundedCoords([-44, 122])).toBe('x≈-40, z≈120');
    expect(roundedCoords([150, 80], 50)).toBe('x≈150, z≈100');
  });
  it('turns requirements into sentences', () => {
    const nameOf = (id: string) => (id === 'rock' ? '수상한 바위' : id);
    expect(describeRequirement({ type: 'level', min: 5 }, nameOf)).toBe('레벨 5 이상');
    expect(describeRequirement({ type: 'seen', id: 'rock' }, nameOf)).toBe("'수상한 바위'를 먼저 볼 것");
    expect(describeRequirement({ type: 'zone', zone: 'desert' }, nameOf)).toBe('사막 안에서만');
  });
  it('describes rewards: gold/xp, item, and a class-specific item', () => {
    expect(describeReward({ gold: 30, xp: 10 })).toBe('골드 30 · 경험치 10');
    expect(describeReward({ itemTemplateId: 7, itemName: '체력 물약', itemQty: 2 })).toBe('체력 물약 x2');
    expect(describeReward({ itemTemplateId: 9, itemName: '강철 검', itemByClass: { warrior: 9, mage: 10, archer: 11 }, itemNameByClass: { warrior: '강철 검', mage: '대현자의 지팡이', archer: '사냥꾼의 장궁' }, itemQty: 1 })).toMatch(/전사 강철 검.*마법사 대현자의 지팡이.*궁수 사냥꾼의 장궁/);
  });
});

describe('buildGuideDiscoveries / groupByZone / reveal', () => {
  const defs = [
    def({ id: 'rock', position: [-10, 0], hint: 'h1', where: 'w1' }),
    def({ id: 'pit', position: [-20, 0], hidden: true, requires: [{ type: 'seen', id: 'rock' }], hint: 'h2', where: 'w2', reward: { gold: 5 } }),
    def({ id: 'sand', position: [100, 0], hidden: true, hint: 'h3', where: 'w3' }),
  ];
  const list = buildGuideDiscoveries(defs, zoneOf);

  it('keeps hidden/reward flags, previous-in-chain, and sentences for conditions', () => {
    const pit = list.find((d) => d.id === 'pit')!;
    expect(pit.hidden).toBe(true);
    expect(pit.hasReward).toBe(true);
    expect(pit.chainPrev).toBe('rock');
    expect(pit.conditions).toEqual(["'rock'를 먼저 볼 것"]);
  });
  it('shows a chained discovery under the name of its predecessor when known', () => {
    const named = buildGuideDiscoveries([def({ id: 'rock', name: '수상한 바위' }), def({ id: 'pit', requires: [{ type: 'seen', id: 'rock' }] })], zoneOf);
    expect(named.find((d) => d.id === 'pit')!.conditions[0]).toContain('수상한 바위');
  });
  it('groups by zone and puts prerequisites first', () => {
    const groups = groupByZone(list);
    expect(groups.map((g) => g.zone).sort()).toEqual(['desert', 'village']);
    const village = groups.find((g) => g.zone === 'village')!;
    expect(village.items.map((i) => i.id)).toEqual(['rock', 'pit']);
  });
  it('does not hang on a cycle or a self-referencing predecessor, and still returns every item once', () => {
    const cyc = buildGuideDiscoveries(
      [def({ id: 'a', position: [-1, 0], requires: [{ type: 'seen', id: 'b' }] }), def({ id: 'b', position: [-2, 0], requires: [{ type: 'seen', id: 'a' }] }), def({ id: 'c', position: [-3, 0], requires: [{ type: 'seen', id: 'c' }] })],
      zoneOf,
    );
    const items = groupByZone(cyc).flatMap((g) => g.items.map((i) => i.id));
    expect(items.sort()).toEqual(['a', 'b', 'c']);
  });
  it('shows the raw zone string when a zone has no label', () => {
    const odd = buildGuideDiscoveries([def({ id: 'x' })], () => 'moon')[0];
    expect(odd.zoneLabel).toBe('moon');
  });
  it('does not break grouping when the predecessor lives in another zone', () => {
    const cross = buildGuideDiscoveries([def({ id: 'rock', position: [-5, 0] }), def({ id: 'pit', position: [100, 0], requires: [{ type: 'seen', id: 'rock' }] })], zoneOf);
    const groups = groupByZone(cross);
    expect(groups.find((g) => g.zone === 'village')!.items.map((i) => i.id)).toEqual(['rock']);
    expect(groups.find((g) => g.zone === 'desert')!.items.map((i) => i.id)).toEqual(['pit']);
  });
  it('starts hidden ones at stage 0 and visible ones at stage 2', () => {
    expect(initialStage(list.find((d) => d.id === 'rock')!)).toBe(2);
    expect(initialStage(list.find((d) => d.id === 'pit')!)).toBe(0);
  });
  it('lets a chained one reveal its location only after its predecessor is fully revealed', () => {
    const pit = list.find((d) => d.id === 'pit')!;
    expect(canRevealWhere(pit, { rock: 2 })).toBe(false);
    expect(canRevealWhere(pit, { rock: 3 })).toBe(true);
    const sand = list.find((d) => d.id === 'sand')!;
    expect(canRevealWhere(sand, {})).toBe(true);
  });
  it('tolerates an empty list and missing hint/where', () => {
    expect(buildGuideDiscoveries([], zoneOf)).toEqual([]);
    const bare = buildGuideDiscoveries([def({ id: 'x' })], zoneOf)[0];
    expect(bare.hint).toBe('');
    expect(bare.where).toBe('');
  });
});
