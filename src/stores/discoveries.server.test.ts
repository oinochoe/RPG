import { describe, expect, it } from 'vitest';
import { MAX_GOLD_PER_DISCOVERY, MAX_ITEM_QTY, MAX_XP_PER_DISCOVERY, checkClaim, pickRewardItem, validateRewardTable } from '../../supabase/functions/api/discoveries';

const table = {
  'sulky-rock': { minLevel: 1, gold: 40 },
  'deep-pit': { minLevel: 10, gold: 120, xp: 60 },
  jar: { minLevel: 5, itemTemplateId: 12, itemQty: 2 },
};

describe('checkClaim', () => {
  it('accepts a known discovery at or above its level', () => {
    expect(checkClaim('sulky-rock', 1, table)).toEqual({ ok: true, reward: table['sulky-rock'] });
    expect(checkClaim('deep-pit', 10, table).ok).toBe(true);
  });
  it('rejects an unknown id (including prototype keys) and a too-low level', () => {
    expect(checkClaim('nope', 99, table)).toEqual({ ok: false, reason: 'unknown_discovery' });
    expect(checkClaim('constructor', 99, table)).toEqual({ ok: false, reason: 'unknown_discovery' });
    expect(checkClaim('__proto__', 99, table)).toEqual({ ok: false, reason: 'unknown_discovery' });
    expect(checkClaim('deep-pit', 9, table)).toEqual({ ok: false, reason: 'level_too_low' });
  });
  it('treats a NaN level as too low', () => {
    expect(checkClaim('sulky-rock', Number.NaN, table)).toEqual({ ok: false, reason: 'level_too_low' });
  });
});

describe('validateRewardTable', () => {
  it('accepts a sane table', () => {
    expect(validateRewardTable(table)).toEqual([]);
  });
  it('rejects empty, negative and over-cap rewards', () => {
    const bad = validateRewardTable({
      a: { minLevel: 1 },
      b: { minLevel: 1, gold: -1 },
      c: { minLevel: 1, gold: MAX_GOLD_PER_DISCOVERY + 1 },
      d: { minLevel: 1, xp: MAX_XP_PER_DISCOVERY + 1 },
      e: { minLevel: 1, itemTemplateId: 12, itemQty: MAX_ITEM_QTY + 1 },
      f: { minLevel: 0, gold: 1 },
    });
    const text = bad.join('\n');
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(text).toContain(id + ':');
  });
  it('rejects non-integer gold/xp and non-positive or fractional item template ids', () => {
    expect(validateRewardTable({ g: { minLevel: 1, gold: 1.5 } }).join()).toMatch(/g:/);
    expect(validateRewardTable({ x: { minLevel: 1, xp: 2.5 } }).join()).toMatch(/x:/);
    expect(validateRewardTable({ i: { minLevel: 1, itemTemplateId: 0 } }).join()).toMatch(/i:/);
    expect(validateRewardTable({ j: { minLevel: 1, itemTemplateId: 1.5 } }).join()).toMatch(/j:/);
  });
  it('requires an item quantity of at least 1 whenever an item is given (defaults to 1 when omitted)', () => {
    expect(validateRewardTable({ x: { minLevel: 1, itemTemplateId: 7 } })).toEqual([]);
    expect(validateRewardTable({ x: { minLevel: 1, itemTemplateId: 7, itemQty: 0 } }).join()).toMatch(/x:/);
  });
  it('forbids an item reward that also pays gold or xp (a failed item grant would leave gold/xp paid twice on retry)', () => {
    expect(validateRewardTable({ mixg: { minLevel: 1, gold: 10, itemTemplateId: 7 } }).join()).toMatch(/mixg:/);
    expect(validateRewardTable({ mixx: { minLevel: 1, xp: 10, itemTemplateId: 7, itemQty: 2 } }).join()).toMatch(/mixx:/);
    expect(validateRewardTable({ gx: { minLevel: 1, gold: 10, xp: 10 } })).toEqual([]);
  });
});

describe('class-specific item rewards', () => {
  const r = { minLevel: 10, itemTemplateId: 9, itemByClass: { warrior: 9, mage: 10 }, itemQty: 1 };
  it('pickRewardItem picks the class entry, falls back to itemTemplateId, else undefined', () => {
    expect(pickRewardItem(r, 'mage')).toBe(10);
    expect(pickRewardItem(r, 'warrior')).toBe(9);
    expect(pickRewardItem(r, 'archer')).toBe(9);
    expect(pickRewardItem({ minLevel: 1, itemByClass: { mage: 10 } }, 'archer')).toBeUndefined();
    expect(pickRewardItem({ minLevel: 1, gold: 5 }, 'mage')).toBeUndefined();
  });
  it('validateRewardTable accepts itemByClass alone or with a fallback', () => {
    expect(validateRewardTable({ a: { minLevel: 1, itemByClass: { warrior: 9, mage: 10, archer: 11 } } })).toEqual([]);
    expect(validateRewardTable({ b: r })).toEqual([]);
  });
  it('rejects itemByClass combined with gold or xp', () => {
    expect(validateRewardTable({ g: { minLevel: 1, gold: 5, itemByClass: { mage: 10 } } }).join()).toMatch(/g:/);
    expect(validateRewardTable({ x: { minLevel: 1, xp: 5, itemByClass: { mage: 10 } } }).join()).toMatch(/x:/);
  });
  it('rejects non-positive or non-integer ids in itemByClass', () => {
    expect(validateRewardTable({ z: { minLevel: 1, itemByClass: { mage: 0 } } }).join()).toMatch(/z:/);
    expect(validateRewardTable({ n: { minLevel: 1, itemByClass: { mage: -3 } } }).join()).toMatch(/n:/);
    expect(validateRewardTable({ f: { minLevel: 1, itemByClass: { mage: 1.5 } } }).join()).toMatch(/f:/);
  });
});
