import { describe, expect, it } from 'vitest';
import { chooseDefaultCharacter, mergeFound, withFoundStages } from './guideProgress';

describe('chooseDefaultCharacter', () => {
  const list = [{ id: 4 }, { id: 9 }];
  it('keeps the remembered id while it is still in the list', () => expect(chooseDefaultCharacter(list, 9)).toBe(9));
  it('falls back to the first character', () => {
    expect(chooseDefaultCharacter(list, 77)).toBe(4);
    expect(chooseDefaultCharacter(list, null)).toBe(4);
  });
  it('is null for an empty list', () => expect(chooseDefaultCharacter([], 4)).toBeNull());
});

describe('mergeFound', () => {
  it('unions server-claimed and locally seen ids', () => {
    expect([...mergeFound(['a', 'b'], ['b', 'c'])].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('withFoundStages', () => {
  it('forces found ids to stage 3 and leaves the rest alone', () => {
    expect(withFoundStages({ a: 0, b: 1 }, new Set(['a', 'x']))).toEqual({ a: 3, b: 1, x: 3 });
  });
});
