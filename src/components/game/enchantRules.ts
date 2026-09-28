import type { InventorySlot } from '../../types/api';

// Client-side copy of enchant_item's rules (supabase/migrations/
// 20260928120000_split_weapon_armor_enchant_scrolls.sql), purely for display and for
// blocking obviously invalid attempts — the server still rolls the real outcome.
export const ENCHANT_MAX_LEVEL = 10;

// Below the safe level a weapon/armor scroll always succeeds; at or above it a failed roll
// destroys the item.
const SAFE_LEVEL = { weapon: 6, armor: 4 };
const BLESSED_MIN_LEVEL = { weapon: 1, armor: 3 };
export const CURSED_MIN_LEVEL = 1;

const WEAPON_RISKY_SUCCESS: Record<number, number> = { 6: 0.5, 7: 0.4, 8: 0.3 };
const ARMOR_RISKY_SUCCESS: Record<number, number> = { 4: 0.5, 5: 0.4, 6: 0.35, 7: 0.3, 8: 0.25 };

function kind(target: InventorySlot): 'weapon' | 'armor' {
  return target.equip_slot === 'weapon' ? 'weapon' : 'armor';
}

export function safeEnchantLevel(target: InventorySlot): number {
  return SAFE_LEVEL[kind(target)];
}

export function blessedMinLevel(target: InventorySlot): number {
  return BLESSED_MIN_LEVEL[kind(target)];
}

// Chance a weapon/armor scroll succeeds at the target's current level; the rest destroys it.
export function enchantSuccessChance(target: InventorySlot): number {
  const level = target.enchant_level;
  if (level < safeEnchantLevel(target)) return 1;
  const table = kind(target) === 'weapon' ? WEAPON_RISKY_SUCCESS : ARMOR_RISKY_SUCCESS;
  return table[level] ?? 0.2;
}

// Why a given scroll can't be applied to a given target right now — null means it's valid.
export function scrollIneligibleReason(target: InventorySlot, scroll: InventorySlot): string | null {
  if (target.equip_slot === null) return '장비 아이템에만 사용할 수 있습니다.';
  if (target.enchant_level >= ENCHANT_MAX_LEVEL) return '이미 최대 강화 수치입니다.';
  const targetKind = kind(target);
  if (scroll.enchant_scroll_type === 'weapon' && targetKind !== 'weapon') {
    return '무기 강화 주문서는 무기에만 사용할 수 있습니다.';
  }
  if (scroll.enchant_scroll_type === 'armor' && targetKind !== 'armor') {
    return '방어구 강화 주문서는 방어구에만 사용할 수 있습니다.';
  }
  if (scroll.enchant_scroll_type === 'blessed' && target.enchant_level < blessedMinLevel(target)) {
    return `${targetKind === 'weapon' ? '무기' : '방어구'}는 +${blessedMinLevel(target)} 이상부터 축복 주문서를 사용할 수 있습니다.`;
  }
  if (scroll.enchant_scroll_type === 'cursed' && target.enchant_level < CURSED_MIN_LEVEL) {
    return `+${CURSED_MIN_LEVEL} 이상부터 사용할 수 있는 주문서입니다.`;
  }
  return null;
}
