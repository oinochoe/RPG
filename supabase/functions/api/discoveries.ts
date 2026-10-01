// Server-side discovery rewards — pure module with NO imports so vitest can import it (like drops.ts).
// A client "discovery" is only a place where something funny happens; anything that PAYS OUT must be listed
// here. The client sends just the discovery id; every amount below is read from this table, never from the
// request. Each character can claim each id once (character_discoveries primary key).
//
// Position is deliberately NOT verified: the server only knows the position the client last saved, and the
// kill reports are validated the same way (plausibility, not geometry). The real limits are once-per-
// character, the small amounts below, and the caps enforced by validateRewardTable.

export interface RewardEntry {
  minLevel: number;
  gold?: number;
  xp?: number;
  itemTemplateId?: number;
  itemQty?: number;
}

export const MAX_GOLD_PER_DISCOVERY = 500;
export const MAX_XP_PER_DISCOVERY = 200;
export const MAX_ITEM_QTY = 5;

// Ids match the client's discoveries (src/components/game/discoveryContent.ts); discoveryContent.test.ts keeps the
// two in sync, including minLevel = the client's level requirement. Item rewards are item-only (see below).
// Item template ids: 7 체력 물약, 9 강철 검, 12 마나 물약, 64 사파이어.
export const DISCOVERY_REWARDS: Record<string, RewardEntry> = {
  "fence-stash": { minLevel: 1, gold: 30, xp: 10 },
  "cracked-jar": { minLevel: 5, itemTemplateId: 7, itemQty: 2 },
  "fairy-tip-jar": { minLevel: 8, itemTemplateId: 12, itemQty: 3 },
  "confiscated-sword": { minLevel: 10, itemTemplateId: 9, itemQty: 1 },
  "bone-piggybank": { minLevel: 13, gold: 120, xp: 60 },
  "ghoul-lost-and-found": { minLevel: 14, itemTemplateId: 64, itemQty: 2 },
  "ancient-pension": { minLevel: 18, gold: 150, xp: 80 },
};

export type ClaimCheck = { ok: true; reward: RewardEntry } | { ok: false; reason: "unknown_discovery" | "level_too_low" };

export function checkClaim(
  id: string,
  level: number,
  table: Record<string, RewardEntry> = DISCOVERY_REWARDS,
): ClaimCheck {
  // hasOwn: "constructor"/"__proto__" must not resolve to something on Object.prototype.
  if (!Object.prototype.hasOwnProperty.call(table, id)) return { ok: false, reason: "unknown_discovery" };
  const reward = table[id];
  // NaN-safe: a non-numeric level must fail the gate, not slip past `<`.
  if (!(level >= reward.minLevel)) return { ok: false, reason: "level_too_low" };
  return { ok: true, reward };
}

export function validateRewardTable(table: Record<string, RewardEntry>): string[] {
  const problems: string[] = [];
  for (const [id, r] of Object.entries(table)) {
    if (!(r.minLevel >= 1)) problems.push(`${id}: minLevel must be at least 1`);
    if (r.gold === undefined && r.xp === undefined && r.itemTemplateId === undefined) problems.push(`${id}: empty reward`);
    if (r.gold !== undefined && !(Number.isInteger(r.gold) && r.gold > 0 && r.gold <= MAX_GOLD_PER_DISCOVERY)) {
      problems.push(`${id}: gold must be 1..${MAX_GOLD_PER_DISCOVERY}`);
    }
    if (r.xp !== undefined && !(Number.isInteger(r.xp) && r.xp > 0 && r.xp <= MAX_XP_PER_DISCOVERY)) {
      problems.push(`${id}: xp must be 1..${MAX_XP_PER_DISCOVERY}`);
    }
    if (r.itemTemplateId !== undefined && !(Number.isInteger(r.itemTemplateId) && r.itemTemplateId > 0)) {
      problems.push(`${id}: itemTemplateId must be a positive integer`);
    }
    if (r.itemQty !== undefined && !(Number.isInteger(r.itemQty) && r.itemQty >= 1 && r.itemQty <= MAX_ITEM_QTY)) {
      problems.push(`${id}: itemQty must be 1..${MAX_ITEM_QTY}`);
    }
    // An item grant that fails undoes the claim row but not gold/xp already paid, so a retry would pay those
    // twice. Item rewards are therefore item-only; gold/xp rewards may combine with each other.
    if (r.itemTemplateId !== undefined && (r.gold !== undefined || r.xp !== undefined)) {
      problems.push(`${id}: an item reward cannot also give gold or xp`);
    }
  }
  return problems;
}
