import { create } from 'zustand';
import type { CharacterProfile, MonsterInstanceSummary } from '../types/api';

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
// How far a monster will chase from its spawn point before giving up and walking back —
// keeps dungeon goblins from chasing straight through the far wall of their room.
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
  attackPower: number;
  defensePower: number;
  attackRange: number;
  gold: number;
  skillPoints: number;
}

// Stat points granted on each level-up, spent via allocateStat.
const SKILL_POINTS_PER_LEVEL = 3;
const STAT_GAIN = {
  attack: { attackPower: 1 },
  defense: { defensePower: 1 },
  hp: { maxHp: 8 },
} as const;
export type AllocatableStat = keyof typeof STAT_GAIN;

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
  init: (character: CharacterProfile, monsters: MonsterInstanceSummary[], aggressive: AggressivePredicate) => void;
  /**
   * Swaps in a different monster roster without touching player stats — used when
   * traveling between areas that keep separate monster pools (e.g. field vs. dungeon) so
   * neither area's kills/respawn timers leak into the other, and neither resets the
   * player's local level/exp progress the way a second `init` call would.
   */
  loadMonsters: (monsters: MonsterInstanceSummary[], aggressive: AggressivePredicate) => void;
  attackNearest: (playerX: number, playerZ: number) => AttackResult;
  monsterAttackTick: (playerX: number, playerZ: number) => MonsterAttackResult;
  tickMonsterMovement: (playerX: number, playerZ: number, delta: number) => void;
  allocateStat: (stat: AllocatableStat) => void;
  respawnPlayer: () => void;
  tickRespawns: () => void;
  /**
   * Adjusts the player's attack/defense by the given deltas without touching anything
   * else (HP, level, etc.) — called right after a successful equip/unequip API call with
   * the difference between the old and new total equipped-item bonuses, so mid-combat
   * state isn't disturbed the way a full re-init would be.
   */
  applyEquipmentDelta: (attackDelta: number, defenseDelta: number) => void;
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

export const useCombatStore = create<CombatState>((set, get) => ({
  ready: false,
  monsters: {},
  player: {
    level: 1,
    experience: 0,
    expToNext: 100,
    currentHp: 1,
    maxHp: 1,
    attackPower: 10,
    defensePower: 0,
    attackRange: ATTACK_RANGE_BY_CLASS.warrior,
    gold: 0,
    skillPoints: 0,
  },
  lastAttackAt: 0,

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
        attackPower: character.attack_power + attackBonus,
        defensePower: character.defense_power + defenseBonus,
        attackRange: ATTACK_RANGE_BY_CLASS[character.character_class],
        gold: character.gold,
        skillPoints: character.skill_points,
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

    let nextPlayer = player;
    let leveledUp = false;
    let goldDropped: number | undefined;
    if (killed) {
      goldDropped = nearest.level * (4 + Math.floor(Math.random() * 8));
      const gainedExp = nearest.level * 20;
      let experience = player.experience + gainedExp;
      let level = player.level;
      let maxHp = player.maxHp;
      let currentHp = player.currentHp;
      let attackPower = player.attackPower;
      let skillPoints = player.skillPoints;
      let expToNext = expToNextForLevel(level);

      while (experience >= expToNext) {
        experience -= expToNext;
        level += 1;
        maxHp += 20;
        attackPower += 2;
        currentHp = maxHp;
        skillPoints += SKILL_POINTS_PER_LEVEL;
        expToNext = expToNextForLevel(level);
        leveledUp = true;
      }

      nextPlayer = {
        level,
        experience,
        expToNext,
        currentHp,
        maxHp,
        attackPower,
        defensePower: player.defensePower,
        attackRange: player.attackRange,
        gold: player.gold + goldDropped,
        skillPoints,
      };
    }

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
      lastAttackAt: now,
    });

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

      if (engaged && distToPlayer <= MONSTER_DETECT_RANGE && distFromSpawn <= MONSTER_LEASH_RANGE) {
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
    if (player.skillPoints <= 0) return;
    const skillPoints = player.skillPoints - 1;
    if (stat === 'attack') {
      set({ player: { ...player, skillPoints, attackPower: player.attackPower + STAT_GAIN.attack.attackPower } });
    } else if (stat === 'defense') {
      set({ player: { ...player, skillPoints, defensePower: player.defensePower + STAT_GAIN.defense.defensePower } });
    } else {
      // Spending a point into max HP heals by the same amount, rather than leaving the
      // player at the same currentHp/maxHp ratio they had before allocating.
      const gain = STAT_GAIN.hp.maxHp;
      set({
        player: { ...player, skillPoints, maxHp: player.maxHp + gain, currentHp: player.currentHp + gain },
      });
    }
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
      },
    });
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
}));
