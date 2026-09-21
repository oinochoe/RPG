import { create } from 'zustand';
import type { CharacterProfile, MonsterInstanceSummary } from '../types/api';
import * as charactersApi from '../api/characters';

// Melee classes need to stand next to a monster; ranged classes should be able to fight
// from a distance instead of awkwardly walking into hugging range with a bow or a staff.
const ATTACK_RANGE_BY_CLASS: Record<CharacterProfile['character_class'], number> = {
  warrior: 2.2,
  mage: 5.5,
  archer: 7,
};
const ATTACK_COOLDOWN_MS = 550;
const RESPAWN_DELAY_MS = 8000;

// Monsters notice the player (and, if already engaged, keep chasing) within this range, but
// have to actually close to MONSTER_ATTACK_REACH before a hit can land — otherwise they'd
// attack from a standstill without ever moving.
const MONSTER_DETECT_RANGE = 6;
const MONSTER_ATTACK_REACH = 1.3;
const MONSTER_ATTACK_COOLDOWN_MS = 1200;
const MONSTER_CHASE_SPEED = 2.4;
const MONSTER_WANDER_SPEED = 1;
// How far a PASSIVE monster will chase from its spawn point before giving up and walking
// back. Aggressive monsters (대장/군주) skip this check entirely and chase as long as the
// player stays within MONSTER_DETECT_RANGE — safe to let them roam their own spawn point
// this way since the player's own movement is already wall-constrained (resolveMovement in
// worldColliders.ts), so an aggressive monster chasing the player can never end up clipping
// through a wall the player themselves couldn't have crossed. Previously this leash applied
// to every monster regardless of aggressive, which made a chasing captain/lord visibly snap
// back and forth right at the 6-unit boundary instead of committing to the chase.
const MONSTER_LEASH_RANGE = 6;
const MONSTER_WANDER_RADIUS = 2.5;
const MONSTER_WANDER_INTERVAL_MS: [number, number] = [2500, 5000];

function monsterAttackPower(level: number): number {
  return 4 + level * 2;
}

export interface MonsterCombatState {
  instanceId: number;
  name: string;
  level: number;
  maxHp: number;
  currentHp: number;
  alive: boolean;
  position: [number, number, number];
  spawnPosition: [number, number, number];
  respawnAt: number | null;
  lastHitAt: number | null;
  attackPower: number;
  lastAttackAt: number | null;
  // Aggressive monsters attack on sight (within MONSTER_DETECT_RANGE); passive ones only
  // fight back once the player has hit them first (see monsterAttackTick).
  aggressive: boolean;
  // Idle wander target/timer — only used while not engaged (see tickMonsterMovement).
  wanderTarget: [number, number] | null;
  nextWanderAt: number | null;
}

interface PlayerCombatState {
  level: number;
  experience: number;
  expToNext: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  attackPower: number;
  defensePower: number;
  // Portion of attackPower/defensePower currently contributed by equipped items — tracked
  // separately so syncProgress can strip it back out before persisting (see the comment
  // above init()'s equipment-bonus loop: the DB columns are base-only, pre-equipment).
  equipAttackBonus: number;
  equipDefenseBonus: number;
  attackRange: number;
  gold: number;
  skillPoints: number;
  skillUpgradePoints: number;
  characterClass: CharacterProfile['character_class'];
  statStr: number;
  statDex: number;
  statCon: number;
  statInt: number;
  statWis: number;
  skillLevel: number;
  skillCooldownUntil: number;
}

// Stat points granted on each level-up, spent via allocateStat.
const SKILL_POINTS_PER_LEVEL = 3;

export type AllocatableStat = 'str' | 'dex' | 'con' | 'int' | 'wis';

const STAT_FIELD: Record<AllocatableStat, 'statStr' | 'statDex' | 'statCon' | 'statInt' | 'statWis'> = {
  str: 'statStr',
  dex: 'statDex',
  con: 'statCon',
  int: 'statInt',
  wis: 'statWis',
};

// CON and WIS affect every class the same way; STR/DEX/INT only affect the class whose
// primary attack stat they are (see PRIMARY_ATTACK_STAT below) — spending on an
// off-class attack stat still spends the point and raises the counter, it just has no
// numeric effect yet (design spec's explicit "off-class stats stay allocatable" call).
const STAT_GAIN = {
  con: { maxHp: 8, defensePower: 1 },
  wis: { maxMp: 4 },
} as const;

// Point cost to raise a stat from its current value to the next — Ragnarok-style
// escalating cost: 1~9 costs 1, 10~19 costs 2, 20~29 costs 3, etc.
export function statPointCost(currentValue: number): number {
  return Math.floor(currentValue / 10) + 1;
}

const PRIMARY_ATTACK_STAT: Record<CharacterProfile['character_class'], AllocatableStat> = {
  warrior: 'str',
  archer: 'dex',
  mage: 'int',
};

export const SKILL_MAX_LEVEL = 10;
const SKILL_UPGRADE_POINTS_PER_LEVEL = 1;

export const SKILL_BY_CLASS: Record<
  CharacterProfile['character_class'],
  { name: string; mpCost: number; cooldownMs: number; baseDamageMultiplier: number }
> = {
  warrior: { name: '강타', mpCost: 15, cooldownMs: 4000, baseDamageMultiplier: 2.5 },
  archer: { name: '관통사격', mpCost: 15, cooldownMs: 4000, baseDamageMultiplier: 2.0 },
  mage: { name: '파이어볼', mpCost: 20, cooldownMs: 5000, baseDamageMultiplier: 2.2 },
};

// Each skill level above 1 adds +10% to the template's base multiplier.
function skillDamageMultiplier(baseDamageMultiplier: number, skillLevel: number): number {
  return baseDamageMultiplier * (1 + (skillLevel - 1) * 0.1);
}

interface AttackResult {
  hit: boolean;
  instanceId?: number;
  damage?: number;
  killed?: boolean;
  leveledUp?: boolean;
  goldDropped?: number;
}

interface MonsterAttackResult {
  died: boolean;
}

interface CombatState {
  ready: boolean;
  monsters: Record<number, MonsterCombatState>;
  player: PlayerCombatState;
  lastAttackAt: number;
  // Incremented by Hotbar when a skill-assigned slot is pressed — CharacterMesh (the only
  // place that has both the player's live position and the swing/draw animation refs
  // castSkill's visual needs) watches this and casts on change. A counter rather than a
  // boolean so pressing the slot twice in a row still fires twice even if CharacterMesh's
  // effect hasn't re-run in between.
  castRequestId: number;
  requestCastSkill: () => void;
  init: (character: CharacterProfile, monsters: MonsterInstanceSummary[], aggressive: AggressivePredicate) => void;
  /**
   * Swaps in a different monster roster without touching player stats — used when
   * traveling between areas that keep separate monster pools (e.g. field vs. dungeon) so
   * neither area's kills/respawn timers leak into the other, and neither resets the
   * player's local level/exp progress the way a second `init` call would.
   */
  loadMonsters: (monsters: MonsterInstanceSummary[], aggressive: AggressivePredicate) => void;
  attackNearest: (playerX: number, playerZ: number) => AttackResult;
  castSkill: (playerX: number, playerZ: number) => AttackResult;
  monsterAttackTick: (playerX: number, playerZ: number) => MonsterAttackResult;
  tickMonsterMovement: (playerX: number, playerZ: number, delta: number) => void;
  allocateStat: (stat: AllocatableStat) => void;
  /**
   * Pushes the current progress snapshot (level/experience/stats/HP/MP/skill points) to
   * the server. Called right after allocateStat and right after a level-up inside
   * attackNearest — no periodic/debounced sync (design spec's "simpler" scope
   * decision). Best-effort: a failed save just means a slightly stale resume next
   * login, same as PositionSync.tsx's handling.
   */
  syncProgress: () => void;
  /** Calls the server RPC and adopts its authoritative skill_level/skill_upgrade_points. */
  upgradeSkill: () => Promise<void>;
  respawnPlayer: () => void;
  tickRespawns: () => void;
  /** +1 MP, capped at maxMp — ticked once per elapsed second by MpRegenTicker. */
  tickMpRegen: () => void;
  /**
   * Adjusts the player's attack/defense by the given deltas without touching anything
   * else (HP, level, etc.) — called right after a successful equip/unequip API call with
   * the difference between the old and new total equipped-item bonuses, so mid-combat
   * state isn't disturbed the way a full re-init would be.
   */
  applyEquipmentDelta: (attackDelta: number, defenseDelta: number) => void;
  /** Positive to add gold (sell), negative to spend it (buy) — gold is client-only, see shop. */
  adjustGold: (delta: number) => void;
  /** Heals the player by `amount`, clamped to maxHp — used when a potion is consumed. */
  heal: (amount: number) => void;
}

function expToNextForLevel(level: number): number {
  return level * 100;
}

// Either a flat boolean applied to every monster, or a predicate deciding per-monster —
// lets a roster mix passive trash with an aggressive elite (e.g. dungeon captain aggros on
// sight, but its escort goblins only fight back once actually hit, so walking into a room
// doesn't instantly pull the entire spawn at once).
export type AggressivePredicate = boolean | ((monster: MonsterInstanceSummary) => boolean);

function resolveAggressive(aggressive: AggressivePredicate, monster: MonsterInstanceSummary): boolean {
  return typeof aggressive === 'function' ? aggressive(monster) : aggressive;
}

function toMonsterCombatState(
  monsters: MonsterInstanceSummary[],
  aggressive: AggressivePredicate,
): Record<number, MonsterCombatState> {
  const monsterState: Record<number, MonsterCombatState> = {};
  for (const monster of monsters) {
    monsterState[monster.instance_id] = {
      instanceId: monster.instance_id,
      name: monster.name,
      level: monster.level,
      maxHp: monster.max_hp,
      currentHp: monster.current_hp,
      alive: true,
      position: [monster.position_x, monster.position_y, monster.position_z],
      spawnPosition: [monster.position_x, monster.position_y, monster.position_z],
      respawnAt: null,
      lastHitAt: null,
      attackPower: monsterAttackPower(monster.level),
      lastAttackAt: null,
      aggressive: resolveAggressive(aggressive, monster),
      wanderTarget: null,
      nextWanderAt: null,
    };
  }
  return monsterState;
}

// Shared by attackNearest and castSkill so a kill always applies identical exp/level-
// up/gold/skill-point logic regardless of which attack type landed the final hit.
function applyKill(
  player: PlayerCombatState,
  nearest: MonsterCombatState,
): { nextPlayer: PlayerCombatState; leveledUp: boolean; goldDropped: number } {
  const goldDropped = nearest.level * (4 + Math.floor(Math.random() * 8));
  const gainedExp = nearest.level * 20;
  let experience = player.experience + gainedExp;
  let level = player.level;
  let maxHp = player.maxHp;
  let currentHp = player.currentHp;
  let attackPower = player.attackPower;
  let skillPoints = player.skillPoints;
  let skillUpgradePoints = player.skillUpgradePoints;
  let expToNext = expToNextForLevel(level);
  let leveledUp = false;

  while (experience >= expToNext) {
    experience -= expToNext;
    level += 1;
    maxHp += 20;
    attackPower += 2;
    currentHp = maxHp;
    skillPoints += SKILL_POINTS_PER_LEVEL;
    skillUpgradePoints += SKILL_UPGRADE_POINTS_PER_LEVEL;
    expToNext = expToNextForLevel(level);
    leveledUp = true;
  }

  const nextPlayer: PlayerCombatState = {
    ...player,
    level,
    experience,
    expToNext,
    currentHp,
    maxHp,
    attackPower,
    gold: player.gold + goldDropped,
    skillPoints,
    skillUpgradePoints,
  };

  return { nextPlayer, leveledUp, goldDropped };
}

export const useCombatStore = create<CombatState>((set, get) => ({
  ready: false,
  monsters: {},
  player: {
    level: 1,
    experience: 0,
    expToNext: 100,
    currentHp: 1,
    maxHp: 1,
    currentMp: 1,
    maxMp: 1,
    attackPower: 10,
    defensePower: 0,
    equipAttackBonus: 0,
    equipDefenseBonus: 0,
    attackRange: ATTACK_RANGE_BY_CLASS.warrior,
    gold: 0,
    skillPoints: 0,
    skillUpgradePoints: 0,
    characterClass: 'warrior',
    statStr: 5,
    statDex: 5,
    statCon: 5,
    statInt: 5,
    statWis: 5,
    skillLevel: 0,
    skillCooldownUntil: 0,
  },
  lastAttackAt: 0,
  castRequestId: 0,
  requestCastSkill: () => set((s) => ({ castRequestId: s.castRequestId + 1 })),

  init: (character, monsters, aggressive) => {
    // character.attack_power/defense_power are the character's base stats (never touched
    // by equipping — see the inventory/equipment design doc); equipped items' bonuses are
    // layered on top here, the same way allocateStat layers local stat-point spending on
    // top during a session.
    let attackBonus = 0;
    let defenseBonus = 0;
    for (const item of character.equipped_items) {
      attackBonus += item.attack_bonus;
      defenseBonus += item.defense_bonus;
    }
    set({
      ready: true,
      monsters: toMonsterCombatState(monsters, aggressive),
      player: {
        level: character.level,
        experience: character.experience,
        expToNext: expToNextForLevel(character.level),
        currentHp: character.current_hp,
        maxHp: character.max_hp,
        currentMp: character.current_mp,
        maxMp: character.max_mp,
        attackPower: character.attack_power + attackBonus,
        defensePower: character.defense_power + defenseBonus,
        equipAttackBonus: attackBonus,
        equipDefenseBonus: defenseBonus,
        attackRange: ATTACK_RANGE_BY_CLASS[character.character_class],
        gold: character.gold,
        skillPoints: character.skill_points,
        skillUpgradePoints: character.skill_upgrade_points,
        characterClass: character.character_class,
        statStr: character.stat_str,
        statDex: character.stat_dex,
        statCon: character.stat_con,
        statInt: character.stat_int,
        statWis: character.stat_wis,
        // character.skills contains exactly 0 or 1 rows for the caller's own character
        // (one skill per class, and the array is scoped to this character already) — no
        // need to match by skill_template_id, just take the one row if it exists.
        skillLevel: character.skills[0]?.skill_level ?? 0,
        skillCooldownUntil: 0,
      },
      lastAttackAt: 0,
    });
  },

  loadMonsters: (monsters, aggressive) => {
    set({ monsters: toMonsterCombatState(monsters, aggressive), lastAttackAt: 0 });
  },

  attackNearest: (playerX, playerZ) => {
    const now = performance.now();
    const { monsters, lastAttackAt, player } = get();
    if (now - lastAttackAt < ATTACK_COOLDOWN_MS) return { hit: false };

    let nearest: MonsterCombatState | null = null;
    let nearestDist = Infinity;
    for (const monster of Object.values(monsters)) {
      if (!monster.alive) continue;
      const dx = monster.position[0] - playerX;
      const dz = monster.position[2] - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist <= player.attackRange && dist < nearestDist) {
        nearest = monster;
        nearestDist = dist;
      }
    }
    if (!nearest) return { hit: false };

    const damage = Math.max(1, Math.round(player.attackPower * (0.8 + Math.random() * 0.4)));
    const nextHp = Math.max(0, nearest.currentHp - damage);
    const killed = nextHp === 0;

    const updatedMonster: MonsterCombatState = {
      ...nearest,
      currentHp: nextHp,
      alive: !killed,
      respawnAt: killed ? now + RESPAWN_DELAY_MS : null,
      lastHitAt: now,
    };

    const { nextPlayer, leveledUp, goldDropped } = killed
      ? applyKill(player, nearest)
      : { nextPlayer: player, leveledUp: false, goldDropped: undefined as number | undefined };

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
      lastAttackAt: now,
    });

    if (leveledUp) get().syncProgress();

    return { hit: true, instanceId: nearest.instanceId, damage, killed, leveledUp, goldDropped };
  },

  castSkill: (playerX, playerZ) => {
    const now = performance.now();
    const { monsters, player } = get();
    if (player.skillLevel <= 0 || now < player.skillCooldownUntil) return { hit: false };

    const skill = SKILL_BY_CLASS[player.characterClass];
    if (player.currentMp < skill.mpCost) return { hit: false };

    let nearest: MonsterCombatState | null = null;
    let nearestDist = Infinity;
    for (const monster of Object.values(monsters)) {
      if (!monster.alive) continue;
      const dx = monster.position[0] - playerX;
      const dz = monster.position[2] - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist <= player.attackRange && dist < nearestDist) {
        nearest = monster;
        nearestDist = dist;
      }
    }
    if (!nearest) return { hit: false };

    const multiplier = skillDamageMultiplier(skill.baseDamageMultiplier, player.skillLevel);
    const damage = Math.max(1, Math.round(player.attackPower * multiplier * (0.8 + Math.random() * 0.4)));
    const nextHp = Math.max(0, nearest.currentHp - damage);
    const killed = nextHp === 0;

    const updatedMonster: MonsterCombatState = {
      ...nearest,
      currentHp: nextHp,
      alive: !killed,
      respawnAt: killed ? now + RESPAWN_DELAY_MS : null,
      lastHitAt: now,
    };

    const { nextPlayer: afterKill, leveledUp, goldDropped } = killed
      ? applyKill(player, nearest)
      : { nextPlayer: player, leveledUp: false, goldDropped: undefined as number | undefined };

    const nextPlayer: PlayerCombatState = {
      ...afterKill,
      currentMp: afterKill.currentMp - skill.mpCost,
      skillCooldownUntil: now + skill.cooldownMs,
    };

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
    });

    if (leveledUp) get().syncProgress();

    return { hit: true, instanceId: nearest.instanceId, damage, killed, leveledUp, goldDropped };
  },

  monsterAttackTick: (playerX, playerZ) => {
    const now = performance.now();
    const { monsters, player } = get();
    // Player is already at 0 HP waiting for the respawn effect to run — ignore further hits
    // until respawnPlayer() heals them back up, so we don't double-trigger death handling.
    if (player.currentHp <= 0) return { died: false };

    let nextMonsters: Record<number, MonsterCombatState> | null = null;
    let currentHp = player.currentHp;

    for (const monster of Object.values(monsters)) {
      if (!monster.alive) continue;
      // Passive monsters (e.g. field slimes) leave the player alone until hit first —
      // only aggressive ones (e.g. dungeon goblins) or anything already provoked engage.
      if (!monster.aggressive && monster.lastHitAt === null) continue;
      const dx = monster.position[0] - playerX;
      const dz = monster.position[2] - playerZ;
      // Has to actually be standing next to the player — see tickMonsterMovement, which
      // closes this distance by chasing.
      if (Math.hypot(dx, dz) > MONSTER_ATTACK_REACH) continue;
      if (now - (monster.lastAttackAt ?? 0) < MONSTER_ATTACK_COOLDOWN_MS) continue;

      const rawDamage = Math.round(monster.attackPower * (0.7 + Math.random() * 0.5));
      const damage = Math.max(1, rawDamage - player.defensePower);
      currentHp = Math.max(0, currentHp - damage);
      if (!nextMonsters) nextMonsters = { ...monsters };
      nextMonsters[monster.instanceId] = { ...monster, lastAttackAt: now };
      if (currentHp <= 0) break;
    }

    if (!nextMonsters) return { died: false };
    set({ monsters: nextMonsters, player: { ...player, currentHp } });
    return { died: currentHp <= 0 };
  },

  tickMonsterMovement: (playerX, playerZ, delta) => {
    const now = performance.now();
    const { monsters } = get();
    let next: Record<number, MonsterCombatState> | null = null;

    for (const monster of Object.values(monsters)) {
      if (!monster.alive) continue;
      const [sx, , sz] = monster.spawnPosition;
      const [mx, my, mz] = monster.position;
      const distToPlayer = Math.hypot(playerX - mx, playerZ - mz);
      const distFromSpawn = Math.hypot(mx - sx, mz - sz);

      let lastHitAt = monster.lastHitAt;
      // Passive monsters only chase because they were provoked (lastHitAt) — once they've
      // fully made it back home and the player isn't around anymore, let that provocation
      // expire so they're genuinely passive again, not permanently "in combat" from one hit.
      if (!monster.aggressive && lastHitAt !== null && distFromSpawn <= 0.2 && distToPlayer > MONSTER_DETECT_RANGE) {
        lastHitAt = null;
      }
      const engaged = monster.aggressive || lastHitAt !== null;

      let targetX = mx;
      let targetZ = mz;
      let speed = 0;
      let wanderTarget = monster.wanderTarget;
      let nextWanderAt = monster.nextWanderAt;

      if (engaged && distToPlayer <= MONSTER_DETECT_RANGE && (monster.aggressive || distFromSpawn <= MONSTER_LEASH_RANGE)) {
        wanderTarget = null;
        nextWanderAt = null;
        if (distToPlayer > MONSTER_ATTACK_REACH) {
          targetX = playerX;
          targetZ = playerZ;
          speed = MONSTER_CHASE_SPEED;
        }
      } else if (distFromSpawn > MONSTER_WANDER_RADIUS) {
        // Outside its home turf (gave up a chase, or got pushed out) — walk back before
        // resuming normal wandering, rather than picking a wander target from way out here.
        wanderTarget = null;
        nextWanderAt = null;
        targetX = sx;
        targetZ = sz;
        speed = MONSTER_CHASE_SPEED;
      } else {
        if (!wanderTarget || now >= (nextWanderAt ?? 0)) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * MONSTER_WANDER_RADIUS;
          wanderTarget = [sx + Math.cos(angle) * radius, sz + Math.sin(angle) * radius];
          const [minMs, maxMs] = MONSTER_WANDER_INTERVAL_MS;
          nextWanderAt = now + minMs + Math.random() * (maxMs - minMs);
        }
        targetX = wanderTarget[0];
        targetZ = wanderTarget[1];
        speed = MONSTER_WANDER_SPEED;
      }

      const dx = targetX - mx;
      const dz = targetZ - mz;
      const dist = Math.hypot(dx, dz);
      let nx = mx;
      let nz = mz;
      if (dist > 0.02 && speed > 0) {
        const step = Math.min(dist, speed * delta);
        nx = mx + (dx / dist) * step;
        nz = mz + (dz / dist) * step;
      }

      if (
        nx !== mx ||
        nz !== mz ||
        wanderTarget !== monster.wanderTarget ||
        nextWanderAt !== monster.nextWanderAt ||
        lastHitAt !== monster.lastHitAt
      ) {
        if (!next) next = { ...monsters };
        next[monster.instanceId] = { ...monster, position: [nx, my, nz], wanderTarget, nextWanderAt, lastHitAt };
      }
    }

    if (next) set({ monsters: next });
  },

  allocateStat: (stat) => {
    const { player } = get();
    const field = STAT_FIELD[stat];
    const currentValue = player[field];
    const cost = statPointCost(currentValue);
    if (player.skillPoints < cost) return;

    const nextPlayer: PlayerCombatState = {
      ...player,
      skillPoints: player.skillPoints - cost,
      [field]: currentValue + 1,
    };

    if (stat === PRIMARY_ATTACK_STAT[player.characterClass]) {
      nextPlayer.attackPower = player.attackPower + 1;
    }
    if (stat === 'con') {
      // Spending into CON heals by the HP gained, rather than leaving the player at the
      // same currentHp/maxHp ratio they had before allocating.
      nextPlayer.maxHp = player.maxHp + STAT_GAIN.con.maxHp;
      nextPlayer.currentHp = player.currentHp + STAT_GAIN.con.maxHp;
      nextPlayer.defensePower = player.defensePower + STAT_GAIN.con.defensePower;
    }
    if (stat === 'wis') {
      nextPlayer.maxMp = player.maxMp + STAT_GAIN.wis.maxMp;
      nextPlayer.currentMp = player.currentMp + STAT_GAIN.wis.maxMp;
    }

    set({ player: nextPlayer });
    get().syncProgress();
  },

  syncProgress: () => {
    const { player } = get();
    charactersApi
      .syncProgress({
        level: player.level,
        experience: player.experience,
        skill_points: player.skillPoints,
        // Strip the equipment bonus back out — the DB column is a base value, pre-equipment
        // (see the comment above init()'s equipment-bonus loop). Sending attackPower/
        // defensePower as-is would permanently bake the currently-equipped bonus into the
        // base on every sync, compounding further on each subsequent login.
        attack_power: player.attackPower - player.equipAttackBonus,
        defense_power: player.defensePower - player.equipDefenseBonus,
        max_hp: player.maxHp,
        current_hp: player.currentHp,
        max_mp: player.maxMp,
        current_mp: player.currentMp,
        stat_str: player.statStr,
        stat_dex: player.statDex,
        stat_con: player.statCon,
        stat_int: player.statInt,
        stat_wis: player.statWis,
        gold: player.gold,
        skill_upgrade_points: player.skillUpgradePoints,
      })
      .catch(() => {
        // Best-effort — a missed save just means a slightly stale resume next login,
        // not worth surfacing to the player (same handling as PositionSync.tsx).
      });
  },

  upgradeSkill: async () => {
    const { skill_level, skill_upgrade_points } = await charactersApi.upgradeSkill();
    const { player } = get();
    set({ player: { ...player, skillLevel: skill_level, skillUpgradePoints: skill_upgrade_points } });
  },

  respawnPlayer: () => {
    const { player } = get();
    set({ player: { ...player, currentHp: player.maxHp } });
  },

  applyEquipmentDelta: (attackDelta, defenseDelta) => {
    if (attackDelta === 0 && defenseDelta === 0) return;
    const { player } = get();
    set({
      player: {
        ...player,
        attackPower: player.attackPower + attackDelta,
        defensePower: player.defensePower + defenseDelta,
        equipAttackBonus: player.equipAttackBonus + attackDelta,
        equipDefenseBonus: player.equipDefenseBonus + defenseDelta,
      },
    });
  },

  adjustGold: (delta) => {
    if (delta === 0) return;
    const { player } = get();
    set({ player: { ...player, gold: Math.max(0, player.gold + delta) } });
  },

  heal: (amount) => {
    if (amount === 0) return;
    const { player } = get();
    set({ player: { ...player, currentHp: Math.min(player.maxHp, player.currentHp + amount) } });
  },

  tickRespawns: () => {
    const now = performance.now();
    const { monsters } = get();
    let changed = false;
    const next = { ...monsters };
    for (const monster of Object.values(monsters)) {
      if (!monster.alive && monster.respawnAt !== null && now >= monster.respawnAt) {
        next[monster.instanceId] = {
          ...monster,
          alive: true,
          currentHp: monster.maxHp,
          position: monster.spawnPosition,
          respawnAt: null,
          lastHitAt: null,
          wanderTarget: null,
          nextWanderAt: null,
        };
        changed = true;
      }
    }
    if (changed) set({ monsters: next });
  },

  tickMpRegen: () => {
    const { player } = get();
    if (player.currentMp >= player.maxMp) return;
    set({ player: { ...player, currentMp: Math.min(player.maxMp, player.currentMp + 1) } });
  },
}));
