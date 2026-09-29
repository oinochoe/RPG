// Server-side game-economy rules — pure data + functions with NO imports (no Deno globals, no
// supabase client), so the same file is unit-tested by vitest from src/stores/serverEconomy.test.ts.
//
// The numbers here MUST match:
//   * the SQL in supabase/migrations/20260929010000_server_authoritative_economy.sql
//   * the client's local prediction in src/stores/combatStore.ts (applyKill/applyExperienceGain/
//     allocateStat) — the client shows results instantly and then adopts the server's answer, so
//     a mismatch would show up as numbers "jumping" after every kill.
// serverEconomy.test.ts fails if the client and this file drift apart.

export const EXP_PER_MONSTER_LEVEL = 20;
export const GOLD_MIN_PER_MONSTER_LEVEL = 4;
export const GOLD_SPREAD = 8; // gold = level * (4 + 0..7)
export const EXP_TO_NEXT_PER_LEVEL = 100; // need level * 100 exp to go from `level` to `level + 1`
export const LEVEL_UP_MAX_HP = 20;
export const LEVEL_UP_ATTACK = 2;
export const LEVEL_UP_STAT_POINTS = 3;
export const LEVEL_UP_SKILL_UPGRADE_POINTS = 1;
export const MAX_GOLD = 999_999_999;

/** Kill reports: at most this many kills per request (matches apply_kills' SQL guard). */
export const KILL_BATCH_MAX = 25;
/** Token bucket (in SQL): capacity and refill rate. Documented here for tests/readers. */
export const KILL_BUCKET_CAPACITY = 25;
export const KILL_BUCKET_REFILL_PER_SEC = 1.5;

/**
 * The highest level each monster template can legitimately have anywhere in the game (field,
 * dungeon floors). Derived from FieldMonsters.ts / dungeonLayout.ts's spawn builders —
 * serverEconomy.test.ts recomputes it from those builders and fails if a spawn ever exceeds this
 * (which would make legit kills get refused). Template 5 has no regular monsters (bosses only).
 */
export const MAX_REGULAR_MONSTER_LEVEL: Record<number, number> = {
  1: 2, // 슬라임
  2: 20, // 고블린 / 고블린 대장
  3: 20, // 스켈레톤 / 해골 전사
  4: 3, // 가시선인장
  6: 14, // 오크 / 오크 대장
  7: 17, // 구울 / 구울 대장
  8: 14, // 버섯왕
  9: 14, // 버섯 정령 / 버섯 대장
  10: 6, // 사구 웜
  11: 8, // 코볼트
  12: 9, // 오크 궁수
  13: 16, // 죽음의 기사
  14: 18, // 유적의 파수병
  15: 2, // 늑대
};

/** The 5 tracked bosses: key -> the exact monster they are (see combatStore's BOSS_KEY_BY_NAME). */
export const BOSSES: Record<string, { name: string; templateId: number; level: number }> = {
  world_boss: { name: '태고의 거인', templateId: 5, level: 40 },
  ruined_catacombs: { name: '거인 군주', templateId: 5, level: 25 },
  orc_stronghold: { name: '오크 군주', templateId: 6, level: 19 },
  ghoul_crypt: { name: '구울 군주', templateId: 7, level: 22 },
  mushroom_den: { name: '버섯 군주', templateId: 9, level: 19 },
};

export interface KillReport {
  template_id: number;
  level: number;
  boss_key?: string;
}

export type KillCheck = { ok: true; kill: KillReport } | { ok: false; reason: string };

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

/**
 * Is this reported kill something that could have happened in the game? Checks the monster kind
 * exists and the level is not above what that kind can ever be. (It can't know a monster was
 * really killed — see the design doc's "잔여 위험".)
 */
export function checkKill(raw: unknown): KillCheck {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'invalid_shape' };
  const { template_id, level, boss_key } = raw as Record<string, unknown>;
  if (!isPositiveInt(template_id) || !isPositiveInt(level)) return { ok: false, reason: 'invalid_shape' };

  if (boss_key !== undefined && boss_key !== null) {
    if (typeof boss_key !== 'string' || !(boss_key in BOSSES)) return { ok: false, reason: 'unknown_boss' };
    const boss = BOSSES[boss_key];
    if (template_id !== boss.templateId) return { ok: false, reason: 'boss_template_mismatch' };
    // A boss is exactly one level; anything above it is fabricated, anything below just earns less.
    if (level > boss.level) return { ok: false, reason: 'level_too_high' };
    return { ok: true, kill: { template_id, level, boss_key } };
  }

  const cap = MAX_REGULAR_MONSTER_LEVEL[template_id];
  if (cap === undefined) return { ok: false, reason: 'unknown_monster' };
  if (level > cap) return { ok: false, reason: 'level_too_high' };
  return { ok: true, kill: { template_id, level } };
}

/** Validates the request's `kills` array (1..KILL_BATCH_MAX entries, each passing checkKill). */
export function parseKillBatch(raw: unknown): { ok: true; kills: KillReport[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > KILL_BATCH_MAX) return { ok: false, reason: 'invalid_batch' };
  const kills: KillReport[] = [];
  for (const item of raw) {
    const check = checkKill(item);
    if (!check.ok) return { ok: false, reason: check.reason };
    kills.push(check.kill);
  }
  return { ok: true, kills };
}

// ---- reference implementations of the SQL math, used by tests (and as documentation) ----------

export interface ProgressState {
  level: number;
  experience: number;
  maxHp: number;
  attackPower: number;
  statPoints: number; // characters.skill_points
  skillUpgradePoints: number;
}

export function expToNext(level: number): number {
  return level * EXP_TO_NEXT_PER_LEVEL;
}

export function killExp(monsterLevel: number): number {
  return monsterLevel * EXP_PER_MONSTER_LEVEL;
}

/** Gold range for one kill: [min, max] inclusive (the SQL rolls uniformly within it). */
export function killGoldRange(monsterLevel: number): [number, number] {
  return [
    monsterLevel * GOLD_MIN_PER_MONSTER_LEVEL,
    monsterLevel * (GOLD_MIN_PER_MONSTER_LEVEL + GOLD_SPREAD - 1),
  ];
}

/** Same loop as grant_progress in SQL / combatStore.applyExperienceGain. */
export function applyExperience(state: ProgressState, gainedExp: number): { state: ProgressState; leveledUp: boolean } {
  let { level, experience, maxHp, attackPower, statPoints, skillUpgradePoints } = state;
  experience += gainedExp;
  let leveledUp = false;
  while (experience >= expToNext(level)) {
    experience -= expToNext(level);
    level += 1;
    maxHp += LEVEL_UP_MAX_HP;
    attackPower += LEVEL_UP_ATTACK;
    statPoints += LEVEL_UP_STAT_POINTS;
    skillUpgradePoints += LEVEL_UP_SKILL_UPGRADE_POINTS;
    leveledUp = true;
  }
  return { state: { level, experience, maxHp, attackPower, statPoints, skillUpgradePoints }, leveledUp };
}

/** Point cost to raise a stat currently at `currentValue` by 1 (allocate_stat in SQL). */
export function statPointCost(currentValue: number): number {
  return Math.floor(currentValue / 10) + 1;
}
