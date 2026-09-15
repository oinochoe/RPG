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
  attackRange: number;
  gold: number;
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
  init: (character: CharacterProfile, monsters: MonsterInstanceSummary[], aggressive: boolean) => void;
  /**
   * Swaps in a different monster roster without touching player stats — used when
   * traveling between areas that keep separate monster pools (e.g. field vs. dungeon) so
   * neither area's kills/respawn timers leak into the other, and neither resets the
   * player's local level/exp progress the way a second `init` call would.
   */
  loadMonsters: (monsters: MonsterInstanceSummary[], aggressive: boolean) => void;
  attackNearest: (playerX: number, playerZ: number) => AttackResult;
  monsterAttackTick: (playerX: number, playerZ: number) => MonsterAttackResult;
  tickMonsterMovement: (playerX: number, playerZ: number, delta: number) => void;
  respawnPlayer: () => void;
  tickRespawns: () => void;
}

function expToNextForLevel(level: number): number {
  return level * 100;
}

function toMonsterCombatState(
  monsters: MonsterInstanceSummary[],
  aggressive: boolean,
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
      aggressive,
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
    attackRange: ATTACK_RANGE_BY_CLASS.warrior,
    gold: 0,
  },
  lastAttackAt: 0,

  init: (character, monsters, aggressive) => {
    set({
      ready: true,
      monsters: toMonsterCombatState(monsters, aggressive),
      player: {
        level: character.level,
        experience: character.experience,
        expToNext: expToNextForLevel(character.level),
        currentHp: character.current_hp,
        maxHp: character.max_hp,
        attackPower: character.attack_power,
        attackRange: ATTACK_RANGE_BY_CLASS[character.character_class],
        gold: character.gold,
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
      let expToNext = expToNextForLevel(level);

      while (experience >= expToNext) {
        experience -= expToNext;
        level += 1;
        maxHp += 20;
        attackPower += 2;
        currentHp = maxHp;
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
        attackRange: player.attackRange,
        gold: player.gold + goldDropped,
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

      const damage = Math.max(1, Math.round(monster.attackPower * (0.7 + Math.random() * 0.5)));
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
      const engaged = monster.aggressive || monster.lastHitAt !== null;
      const distToPlayer = Math.hypot(playerX - mx, playerZ - mz);
      const distFromSpawn = Math.hypot(mx - sx, mz - sz);

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

      if (nx !== mx || nz !== mz || wanderTarget !== monster.wanderTarget || nextWanderAt !== monster.nextWanderAt) {
        if (!next) next = { ...monsters };
        next[monster.instanceId] = { ...monster, position: [nx, my, nz], wanderTarget, nextWanderAt };
      }
    }

    if (next) set({ monsters: next });
  },

  respawnPlayer: () => {
    const { player } = get();
    set({ player: { ...player, currentHp: player.maxHp } });
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
