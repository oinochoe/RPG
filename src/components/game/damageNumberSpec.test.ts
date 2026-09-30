import { describe, expect, it } from 'vitest';
import { MAX_NUMBERS, numberSpec, pushCapped } from './damageNumberSpec';
import type { HitEvent } from './combatFx';

const ev = (over: Partial<HitEvent>): HitEvent => ({ kind: 'hit', position: [0, 0, 0], damage: 7, heavy: false, ...over });

describe('numberSpec', () => {
  it('shows a plain hit small and white', () => {
    expect(numberSpec(ev({}))).toMatchObject({ text: '7', color: '#ffffff' });
  });
  it('shows a heavy hit larger and gold', () => {
    const plain = numberSpec(ev({}));
    const heavy = numberSpec(ev({ heavy: true }));
    expect(heavy.color).toBe('#ffd54a');
    expect(heavy.fontSize).toBeGreaterThan(plain.fontSize);
  });
  it('shows damage taken as a red minus', () => {
    expect(numberSpec(ev({ kind: 'playerHit', damage: 12 }))).toMatchObject({ text: '-12', color: '#ff5a5a' });
  });
});

describe('pushCapped', () => {
  it('drops the oldest entries beyond the cap', () => {
    let list: number[] = [];
    for (let i = 0; i < MAX_NUMBERS + 5; i++) list = pushCapped(list, i, MAX_NUMBERS);
    expect(list).toHaveLength(MAX_NUMBERS);
    expect(list[0]).toBe(5);
    expect(list[list.length - 1]).toBe(MAX_NUMBERS + 4);
  });
});
