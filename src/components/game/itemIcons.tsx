// Flat, hand-drawn cartoon icons for the item roster — the inventory/equipment/shop panels
// previously showed only the item's name as text, which made "장착하는 맛" (the satisfaction
// of gearing up) pretty much nonexistent. Not worth pulling in the downloaded Shikashi icon
// packs for this: those are single uncropped sprite sheets with no per-icon coordinate data
// (see MEMORY notes from the earlier UI-redesign attempt), impossible to slice correctly
// without a live browser to verify crops against. A dozen or so simple SVG shapes, one per
// item, is small enough to just draw directly and get right without that risk.

type IconShape = 'sword' | 'staff' | 'bow' | 'shield' | 'armor' | 'potion';

interface IconConfig {
  shape: IconShape;
  color: string;
}

// Starter gear and its upgrade share a shape but not a color — the upgrade is meant to look
// like a real reward, not a reskin, so each item gets its own hand-picked color rather than
// deriving it from equip_slot/item_type.
const ITEM_ICON: Record<string, IconConfig> = {
  '녹슨 검': { shape: 'sword', color: '#8a7458' },
  '강철 검': { shape: 'sword', color: '#d7e3ee' },
  '나무 지팡이': { shape: 'staff', color: '#a5764f' },
  '대현자의 지팡이': { shape: 'staff', color: '#9be7ff' },
  '나무 활': { shape: 'bow', color: '#a5764f' },
  '사냥꾼의 장궁': { shape: 'bow', color: '#d7f79b' },
  '가죽 방패': { shape: 'shield', color: '#9a6a3e' },
  '천리안의 로브': { shape: 'armor', color: '#7f95e0' },
  '가죽 조끼': { shape: 'armor', color: '#8a6a44' },
  '체력 물약': { shape: 'potion', color: '#e0538a' },
  '상급 체력 물약': { shape: 'potion', color: '#ff8a3d' },
  '마나 물약': { shape: 'potion', color: '#5ea8ff' },
  '상급 마나 물약': { shape: 'potion', color: '#9b6bff' },
};

function IconShapeSvg({ shape, color }: { shape: IconShape; color: string }) {
  switch (shape) {
    case 'sword':
      return (
        <g strokeLinecap="round">
          <line x1="9" y1="27" x2="25" y2="9" stroke={color} strokeWidth="3.4" />
          <line x1="16" y1="20" x2="21" y2="15" stroke="#3a3a36" strokeWidth="3.4" />
          <line x1="9" y1="27" x2="6" y2="30" stroke="#5c4a34" strokeWidth="3" />
        </g>
      );
    case 'staff':
      return (
        <g strokeLinecap="round">
          <line x1="16" y1="9" x2="16" y2="29" stroke="#7a5a3a" strokeWidth="3" />
          <circle cx="16" cy="7" r="4" fill={color} />
        </g>
      );
    case 'bow':
      return (
        <g strokeLinecap="round" fill="none">
          <path d="M 21 5 Q 8 16 21 27" stroke={color} strokeWidth="2.6" />
          <line x1="21" y1="5" x2="21" y2="27" stroke="#cfcfc8" strokeWidth="1.4" />
          <line x1="10" y1="16" x2="24" y2="16" stroke="#cfcfc8" strokeWidth="1.4" />
        </g>
      );
    case 'shield':
      return (
        <path
          d="M 16 4 L 25 7.5 L 25 16 Q 25 24.5 16 29 Q 7 24.5 7 16 L 7 7.5 Z"
          fill={color}
          stroke="#2a2a26"
          strokeWidth="1.4"
        />
      );
    case 'armor':
      return (
        <path
          d="M 12 5 L 20 5 L 24 12 L 22 28 L 10 28 L 8 12 Z"
          fill={color}
          stroke="#2a2a26"
          strokeWidth="1.2"
        />
      );
    case 'potion':
      return (
        <g>
          <rect x="14" y="3" width="4" height="5" rx="1" fill="#7a6a52" />
          <path
            d="M 11 8 L 21 8 L 23.5 15 Q 24 27 16 27 Q 8 27 8.5 15 Z"
            fill={color}
            stroke="#2a2a26"
            strokeWidth="1.2"
          />
          <ellipse cx="13" cy="16" rx="1.6" ry="3" fill="rgba(255,255,255,0.35)" />
        </g>
      );
  }
}

/** Renders null (caller falls back to the item's name text) when the item has no icon yet. */
export function ItemIcon({ itemName, size = 32 }: { itemName: string; size?: number }) {
  const config = ITEM_ICON[itemName];
  if (!config) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block', flexShrink: 0 }}>
      <IconShapeSvg shape={config.shape} color={config.color} />
    </svg>
  );
}

export type ItemRarity = 'normal' | 'rare';

// No rarity column exists (or is needed) server-side — required_level is already a good
// enough proxy: every item requiring more than the starting level is a meaningfully better
// upgrade (the 3 class weapon upgrades, all required_level 5), so it gets the "rare" frame.
export function itemRarity(requiredLevel: number): ItemRarity {
  return requiredLevel > 1 ? 'rare' : 'normal';
}

export const RARITY_SLOT_FRAME: Record<ItemRarity, string | null> = {
  normal: null,
  rare: '/image/fantasy-inventory/slot_rare.png',
};
