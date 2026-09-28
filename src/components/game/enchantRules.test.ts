import { describe, expect, it } from 'vitest';
import { enchantSuccessChance, scrollIneligibleReason } from './enchantRules';
import type { InventorySlot } from '../../types/api';

function slot(overrides: Partial<InventorySlot>): InventorySlot {
  return { equip_slot: null, enchant_level: 0, enchant_scroll_type: null, ...overrides } as InventorySlot;
}
const weapon = (lv: number) => slot({ equip_slot: 'weapon', enchant_level: lv });
const armor = (lv: number) => slot({ equip_slot: 'body_armor', enchant_level: lv });
const scroll = (t: InventorySlot['enchant_scroll_type']) => slot({ enchant_scroll_type: t });

describe('enchantSuccessChance', () => {
  it('weapons are safe through +6, then risky', () => {
    expect(enchantSuccessChance(weapon(5))).toBe(1);
    expect(enchantSuccessChance(weapon(6))).toBeLessThan(1);
  });
  it('armor is safe through +4, then risky', () => {
    expect(enchantSuccessChance(armor(3))).toBe(1);
    expect(enchantSuccessChance(armor(4))).toBeLessThan(1);
  });
});

describe('scrollIneligibleReason', () => {
  it('weapon and armor scrolls only fit their own kind', () => {
    expect(scrollIneligibleReason(weapon(0), scroll('weapon'))).toBeNull();
    expect(scrollIneligibleReason(armor(0), scroll('weapon'))).not.toBeNull();
    expect(scrollIneligibleReason(armor(0), scroll('armor'))).toBeNull();
    expect(scrollIneligibleReason(weapon(0), scroll('armor'))).not.toBeNull();
  });
  it('blessed works from +0 on both weapons and armor', () => {
    expect(scrollIneligibleReason(weapon(0), scroll('blessed'))).toBeNull();
    expect(scrollIneligibleReason(armor(0), scroll('blessed'))).toBeNull();
  });
});
