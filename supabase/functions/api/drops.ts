// Monster drop tables and rolling — SERVER side. This used to live in the client's lootStore.ts,
// where the client decided what dropped and then asked the server to grant "whatever item id I
// say". Now the server rolls here (on a validated kill report), issues a single-use pickup ticket
// (pending_drops) and only grants an item against a ticket — see the design doc
// docs/superpowers/specs/2026-09-29-server-authoritative-economy-design.md.
//
// Pure module, no imports (unit-tested by vitest via src/stores/serverEconomy.test.ts). `rng` is
// injectable so tests can pin rolls. The itemName/itemType fields are documentation only — the
// item name/type sent to the client come from the item_templates table.

export type DropItemType = 'weapon' | 'armor' | 'consumable' | 'scroll' | 'misc';

interface DropTableEntry {
  itemTemplateId: number;
  itemName: string;
  itemType: DropItemType;
  weight: number;
}

// Client-side only, same as combatStore's SKILLS_BY_CLASS/questStore's QUEST_DEFS — the
// monster_drop_templates table exists in the schema but was never populated (nothing reads
// it either), so this is the actual source of truth for what a kill can drop. Keyed by
// monster_template_id (see FieldMonsters.ts/Dungeon.tsx's own comments for that convention:
// 1=슬라임, 2=고블린, 3=스켈레톤, 4=가시선인장, 5=거인 군주, 6=오크, 7=구울, 8=버섯왕, 9=버섯 정령,
// 10=사구 웜, 11=코볼트, 12=오크 궁수, 13=죽음의 기사, 14=유적의 파수병, 15=늑대). Weights
// are relative, not percentages — rollDropEntry below divides by their sum (plus each table's
// own "nothing" weight) to get real probabilities, so they don't need to add up to 100.
// Enchant scrolls are NOT in these tables — see ENCHANT_SCROLL_CHANCES below.
const DROP_TABLE: Record<number, DropTableEntry[]> = {
  1: [
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 45 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 15 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 73, itemName: '동물 가죽', itemType: 'misc', weight: 10 },
  ],
  // 늑대 — a real animal, so 동물 가죽 (Animal Hide) is its own signature drop at a much
  // higher weight than the other species that only nominally carry it.
  15: [
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 15 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 10 },
    { itemTemplateId: 73, itemName: '동물 가죽', itemType: 'misc', weight: 20 },
  ],
  2: [
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 2, itemName: '가죽 방패', itemType: 'armor', weight: 10 },
    { itemTemplateId: 73, itemName: '동물 가죽', itemType: 'misc', weight: 8 },
    { itemTemplateId: 61, itemName: '루비', itemType: 'misc', weight: 4 },
  ],
  3: [
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 7, itemName: '체력 물약', itemType: 'consumable', weight: 25 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    // 스켈레톤's own signature drop, per the Lineage reference's 뼛조각 (Bone Fragment) —
    // higher weight than the other misc drops since this is the thematically "right" loot.
    { itemTemplateId: 74, itemName: '뼛조각', itemType: 'misc', weight: 14 },
    { itemTemplateId: 15, itemName: '순간이동 주문서', itemType: 'scroll', weight: 10 },
  ],
  4: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 64, itemName: '사파이어', itemType: 'misc', weight: 4 },
  ],
  5: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 50 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 15 },
    { itemTemplateId: 60, itemName: '강화 초록 물약', itemType: 'consumable', weight: 5 },
    { itemTemplateId: 14, itemName: '마을 귀환 주문서', itemType: 'scroll', weight: 20 },
    { itemTemplateId: 62, itemName: '상급 루비', itemType: 'misc', weight: 6 },
    { itemTemplateId: 76, itemName: '미스릴', itemType: 'misc', weight: 3 },
  ],
  // 오크 마을's field monster — a real weapon drop (강철 검) alongside the usual potions, since
  // orcs are tougher than anything in the original field short of the dungeon boss. 철 덩어리
  // (Iron Chunk) as its own signature misc drop — thematically "orcs mine/forge metal."
  6: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 9, itemName: '강철 검', itemType: 'weapon', weight: 8 },
    { itemTemplateId: 75, itemName: '철 덩어리', itemType: 'misc', weight: 12 },
  ],
  // 구울 평원's field monster — the hardest of the 4 new zones, so its table leans toward the
  // upper-tier consumables and a real chance at the teleport scroll. 뼛조각/상급 사파이어 as
  // its misc drops (undead + a cold-toned gem, matching the zone's own grim theme).
  7: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 74, itemName: '뼛조각', itemType: 'misc', weight: 10 },
    { itemTemplateId: 65, itemName: '상급 사파이어', itemType: 'misc', weight: 4 },
    { itemTemplateId: 15, itemName: '순간이동 주문서', itemType: 'scroll', weight: 12 },
  ],
  // 요정의 숲's field monster (버섯왕/Mushroom King) — a magic-leaning table (mana potions plus
  // a rare staff) matching the zone's fae/forest theme, even though the monster itself is a
  // mushroom creature rather than a literal fairy. 에메랄드 as its misc drop (nature-toned gem).
  8: [
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 10, itemName: '대현자의 지팡이', itemType: 'weapon', weight: 5 },
    { itemTemplateId: 67, itemName: '에메랄드', itemType: 'misc', weight: 5 },
  ],
  // 버섯 정령 (expand_monster_catalog_v1) — 버섯왕(8)'s weaker sibling gets a thinned-down
  // version of the same table, no weapon chance.
  9: [
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 10 },
    { itemTemplateId: 67, itemName: '에메랄드', itemType: 'misc', weight: 4 },
  ],
  // 사구 웜 (expand_monster_catalog_v1) — the desert's deeper-band monster, one tier up from
  // 가시선인장(4)'s own table.
  10: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 45 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 25 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 64, itemName: '사파이어', itemType: 'misc', weight: 6 },
  ],
  // 코볼트 (expand_monster_catalog_v1) — mixed into 오크 마을; a lighter version of 오크(6)'s
  // table without the weapon chance.
  11: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 75, itemName: '철 덩어리', itemType: 'misc', weight: 10 },
  ],
  // 오크 궁수 (expand_monster_catalog_v1) — the other 오크 마을 mix-in, keeps 오크(6)'s own
  // weapon chance since it's the same rough power tier.
  12: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 35 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 20 },
    { itemTemplateId: 57, itemName: '초록 물약', itemType: 'consumable', weight: 12 },
    { itemTemplateId: 11, itemName: '사냥꾼의 장궁', itemType: 'weapon', weight: 6 },
    { itemTemplateId: 75, itemName: '철 덩어리', itemType: 'misc', weight: 10 },
  ],
  // 죽음의 기사 (expand_monster_catalog_v1) — a real field elite (Lv16/670hp, see
  // FieldMonsters.ts's buildBoneFieldMonsters), so its table sits a clear step above every
  // other DROP_TABLE entry: always drops (see NOTHING_WEIGHT below) and a decent shot at the
  // premium consumables/materials.
  13: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 60, itemName: '강화 초록 물약', itemType: 'consumable', weight: 10 },
    { itemTemplateId: 76, itemName: '미스릴', itemType: 'misc', weight: 8 },
    { itemTemplateId: 65, itemName: '상급 사파이어', itemType: 'misc', weight: 8 },
  ],
  // 유적의 파수병 (see FieldMonsters.ts's buildRuinsGuardian) — another Lv18 field elite, so a
  // similarly strong table to 죽음의 기사's own, minus the boss-exclusive gear pool (that stays
  // reserved for the 5 real tracked bosses so it doesn't get diluted).
  14: [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 25 },
    { itemTemplateId: 60, itemName: '강화 초록 물약', itemType: 'consumable', weight: 8 },
    { itemTemplateId: 76, itemName: '미스릴', itemType: 'misc', weight: 6 },
    { itemTemplateId: 63, itemName: '최상급 루비', itemType: 'misc', weight: 5 },
  ],
};

// The remaining share of each table's total roll that means "no drop" — e.g. slime's 40
// against its own 60 (45+15) of real entries means a 40% chance of nothing, 45% health
// potion, 15% mana potion. The boss (5) always drops something.
const NOTHING_WEIGHT: Record<number, number> = {
  1: 40,
  2: 35,
  3: 35,
  4: 40,
  5: 0,
  6: 40,
  7: 35,
  8: 40,
  9: 45,
  10: 35,
  11: 35,
  12: 35,
  // 죽음의 기사/유적의 파수병 — field elites always drop something, same as the tracked bosses' 0.
  13: 0,
  14: 0,
  15: 38,
};

// The 6 boss-exclusive weapon/armor items (see the boss_exclusive_gear migration) — never
// sold in the shop (buy_price 0), only reachable through this pool. Low weight each so a
// single boss kill only has a modest chance at any specific one; shared verbatim across all
// 5 boss tables below so every boss can drop any class's gear (a warrior who only ever fights
// 오크 군주 shouldn't be locked out of 태고의 파쇄검 just because that's nominally a "different"
// boss's table).
const BOSS_EXCLUSIVE_GEAR_ENTRIES: DropTableEntry[] = [
  { itemTemplateId: 51, itemName: '태고의 파쇄검', itemType: 'weapon', weight: 3 },
  { itemTemplateId: 52, itemName: '거인 군주의 판금 갑주', itemType: 'armor', weight: 3 },
  { itemTemplateId: 53, itemName: '태고의 심판 지팡이', itemType: 'weapon', weight: 3 },
  { itemTemplateId: 54, itemName: '태고의 대현자 로브', itemType: 'armor', weight: 3 },
  { itemTemplateId: 55, itemName: '태고의 관통궁', itemType: 'weapon', weight: 3 },
  { itemTemplateId: 56, itemName: '그림자 군주의 은신 갑옷', itemType: 'armor', weight: 3 },
];

// The top tier of each gem line plus 미스릴/강화 초록 물약 — same "shared across all 5 boss
// tables" reasoning as BOSS_EXCLUSIVE_GEAR_ENTRIES above, just for the catalog's premium
// misc/consumable loot rather than the class gear.
const BOSS_PREMIUM_LOOT_ENTRIES: DropTableEntry[] = [
  { itemTemplateId: 60, itemName: '강화 초록 물약', itemType: 'consumable', weight: 8 },
  { itemTemplateId: 63, itemName: '최상급 루비', itemType: 'misc', weight: 5 },
  { itemTemplateId: 66, itemName: '최상급 사파이어', itemType: 'misc', weight: 5 },
  { itemTemplateId: 69, itemName: '최상급 에메랄드', itemType: 'misc', weight: 5 },
  { itemTemplateId: 72, itemName: '최상급 다이아몬드', itemType: 'misc', weight: 4 },
  { itemTemplateId: 76, itemName: '미스릴', itemType: 'misc', weight: 6 },
];

// Keyed by monster NAME rather than monster_template_id — templates 5/6/7/9 are each shared
// between a boss and a regular/captain-tier monster (see FieldMonsters.ts/Dungeon.tsx's own
// comments on this), so a template-keyed table would leak the boss-exclusive gear pool to
// every regular kill of that species too. Only the 5 tracked unique bosses (see combatStore's
// BOSS_KEY_BY_NAME) get a table here; everything else still resolves through DROP_TABLE by
// monster_template_id as before.
const BOSS_DROP_TABLE: Record<string, DropTableEntry[]> = {
  '태고의 거인': [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 50 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 14, itemName: '마을 귀환 주문서', itemType: 'scroll', weight: 20 },
    ...BOSS_EXCLUSIVE_GEAR_ENTRIES,
    ...BOSS_PREMIUM_LOOT_ENTRIES,
  ],
  '거인 군주': [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 50 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 14, itemName: '마을 귀환 주문서', itemType: 'scroll', weight: 20 },
    ...BOSS_EXCLUSIVE_GEAR_ENTRIES,
    ...BOSS_PREMIUM_LOOT_ENTRIES,
  ],
  '오크 군주': [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 50 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 9, itemName: '강철 검', itemType: 'weapon', weight: 8 },
    ...BOSS_EXCLUSIVE_GEAR_ENTRIES,
    ...BOSS_PREMIUM_LOOT_ENTRIES,
  ],
  '구울 군주': [
    { itemTemplateId: 8, itemName: '상급 체력 물약', itemType: 'consumable', weight: 40 },
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 30 },
    { itemTemplateId: 15, itemName: '순간이동 주문서', itemType: 'scroll', weight: 12 },
    ...BOSS_EXCLUSIVE_GEAR_ENTRIES,
    ...BOSS_PREMIUM_LOOT_ENTRIES,
  ],
  // 버섯 군주 — 요정의 버섯굴's final boss, a magic-leaning table matching 버섯왕(8)'s own field
  // table (mana potions + a rare staff) rather than 구울 군주's grimmer one.
  '버섯 군주': [
    { itemTemplateId: 13, itemName: '상급 마나 물약', itemType: 'consumable', weight: 50 },
    { itemTemplateId: 12, itemName: '마나 물약', itemType: 'consumable', weight: 25 },
    { itemTemplateId: 10, itemName: '대현자의 지팡이', itemType: 'weapon', weight: 8 },
    ...BOSS_EXCLUSIVE_GEAR_ENTRIES,
    ...BOSS_PREMIUM_LOOT_ENTRIES,
  ],
};

// Enchant scrolls use absolute per-kill chances (0.005 = 0.5%) rolled BEFORE the regular
// table, instead of relative weights inside it — with weights they came out at ~7-8% per
// regular kill, far too common for a 75,000-gold item. A hit replaces that kill's regular
// drop; a miss falls through to DROP_TABLE/BOSS_DROP_TABLE as usual.
interface ScrollChances {
  weapon?: number;
  armor?: number;
  blessed?: number;
  cursed?: number;
}

const SCROLL_ITEMS: Record<keyof ScrollChances, Omit<DropTableEntry, 'weight'>> = {
  weapon: { itemTemplateId: 50, itemName: '무기 강화 주문서', itemType: 'scroll' },
  armor: { itemTemplateId: 86, itemName: '방어구 강화 주문서', itemType: 'scroll' },
  blessed: { itemTemplateId: 47, itemName: '축복의 강화 주문서', itemType: 'scroll' },
  cursed: { itemTemplateId: 48, itemName: '저주의 강화 주문서', itemType: 'scroll' },
};

const LOW_TIER: ScrollChances = { weapon: 0.003, armor: 0.005 };
const MID_TIER: ScrollChances = { weapon: 0.005, armor: 0.008 };
const ELITE_TIER: ScrollChances = { weapon: 0.03, armor: 0.04, blessed: 0.01 };
const BOSS_TIER: ScrollChances = { weapon: 0.08, armor: 0.1, blessed: 0.05 };

const SCROLL_CHANCES_BY_TEMPLATE: Record<number, ScrollChances> = {
  1: LOW_TIER,
  2: LOW_TIER,
  4: LOW_TIER,
  9: LOW_TIER,
  15: LOW_TIER,
  3: { ...MID_TIER, cursed: 0.003 },
  6: { ...MID_TIER, cursed: 0.003 },
  7: { ...MID_TIER, blessed: 0.001 },
  8: MID_TIER,
  10: MID_TIER,
  11: MID_TIER,
  12: MID_TIER,
  5: ELITE_TIER,
  13: ELITE_TIER,
  14: ELITE_TIER,
};

const SCROLL_CHANCES_BY_BOSS: Record<string, ScrollChances> = {
  '태고의 거인': BOSS_TIER,
  '거인 군주': BOSS_TIER,
  '오크 군주': { ...BOSS_TIER, blessed: 0.03, cursed: 0.03 },
  '구울 군주': { ...BOSS_TIER, blessed: 0.03 },
  '버섯 군주': BOSS_TIER,
};

export function scrollChancesFor(monsterTemplateId: number, monsterName: string): ScrollChances {
  return SCROLL_CHANCES_BY_BOSS[monsterName] ?? SCROLL_CHANCES_BY_TEMPLATE[monsterTemplateId] ?? {};
}

function rollScroll(chances: ScrollChances, rng: () => number): DropTableEntry | null {
  let roll = rng();
  for (const key of Object.keys(SCROLL_ITEMS) as (keyof ScrollChances)[]) {
    const chance = chances[key] ?? 0;
    if (roll < chance) return { ...SCROLL_ITEMS[key], weight: 0 };
    roll -= chance;
  }
  return null;
}

function rollWeighted(entries: DropTableEntry[], nothingWeight: number, rng: () => number): DropTableEntry | null {
  const totalWeight = nothingWeight + entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * totalWeight;
  if (roll < nothingWeight) return null;
  roll -= nothingWeight;
  for (const entry of entries) {
    if (roll < entry.weight) return entry;
    roll -= entry.weight;
  }
  return null;
}

export function rollDropEntry(monsterTemplateId: number, monsterName: string, rng: () => number = Math.random): DropTableEntry | null {
  const scroll = rollScroll(scrollChancesFor(monsterTemplateId, monsterName), rng);
  if (scroll) return scroll;

  // Bosses always drop something, same as template 5's own NOTHING_WEIGHT of 0.
  const bossEntries = BOSS_DROP_TABLE[monsterName];
  if (bossEntries) return rollWeighted(bossEntries, 0, rng);

  const entries = DROP_TABLE[monsterTemplateId];
  if (!entries) return null;
  return rollWeighted(entries, NOTHING_WEIGHT[monsterTemplateId] ?? 0, rng);
}
