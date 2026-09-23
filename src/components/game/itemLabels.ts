// Shared between CharacterPanel's equipment paper-doll and InventoryPanel's item details.
export const EQUIP_SLOT_LABEL: Record<string, string> = {
  weapon: '무기',
  shield: '방패',
  helmet: '투구',
  body_armor: '갑옷',
  boots: '신발',
  ring: '반지',
  necklace: '목걸이',
};

// Gold amounts got large enough (boss scroll prices now run up to 300,000) that an unbroken
// digit string is hard to read at a glance — every gold display (wallet, shop prices, the
// floating pickup popup) goes through this instead of a bare template literal.
export function formatGold(amount: number): string {
  return amount.toLocaleString('ko-KR');
}
