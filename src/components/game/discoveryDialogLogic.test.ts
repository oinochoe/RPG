import { describe, expect, it } from 'vitest';
import type { DiscoveryDef } from './discoveries';
import { advance, linesFor, rewardItemName, startPhase } from './discoveryDialogLogic';

const base: DiscoveryDef = { id: 'x', kind: 'inspect', name: '바위', position: [0, 0], radius: 2, prop: 'rock', lines: ['하나', '둘', '셋'] };
const paying: DiscoveryDef = { ...base, reward: { gold: 30 } };

describe('dialog logic', () => {
  it('walks the lines and then asks for the reward only if there is one', () => {
    let p = startPhase(paying, false);
    expect(p).toEqual({ step: 'lines', index: 0 });
    p = advance(paying, p);
    p = advance(paying, p);
    expect(p).toEqual({ step: 'lines', index: 2 });
    expect(advance(paying, p)).toEqual({ step: 'reward', status: 'idle' });
  });
  it('a reward-less discovery has no reward step: advancing past the last line is "done"', () => {
    const last = { step: 'lines', index: 2 } as const;
    expect(advance(base, last)).toEqual({ step: 'reward', status: 'done' });
  });
  it('an already-seen discovery shows its afterLines (or just the last line) and never asks for a reward', () => {
    expect(linesFor({ ...base, afterLines: ['또 왔네'] }, true)).toEqual(['또 왔네']);
    expect(linesFor(base, true)).toEqual(['셋']);
    expect(advance(paying, startPhase(paying, true))).toEqual({ step: 'reward', status: 'done' });
  });
});

describe('rewardItemName', () => {
  const reward = { itemName: '강철 검', itemNameByClass: { mage: '대현자의 지팡이' } };
  it('uses the class name, else the generic name', () => {
    expect(rewardItemName(reward, 'mage')).toBe('대현자의 지팡이');
    expect(rewardItemName(reward, 'archer')).toBe('강철 검');
    expect(rewardItemName(reward, undefined)).toBe('강철 검');
    expect(rewardItemName(undefined, 'mage')).toBeUndefined();
  });
});
