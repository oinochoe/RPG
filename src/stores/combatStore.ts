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

// Monsters aggro and hit back once the player is standing this close, on their own cooldown
// separate from the player's attack cooldown.
const MONSTER_AGGRO_RANGE = 3.2;
const MONSTER_ATTACK_COOLDOWN_MS = 1200;

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
  respawnAt: number | null;
  lastHitAt: number | null;
  attackPower: number;
  lastAttackAt: number | null;
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
  init: (character: CharacterProfile, monsters: MonsterInstanceSummary[]) => void;
  /**
   * Swaps in a different monster roster without touching player stats — used when
   * traveling between areas that keep separate monster pools (e.g. field vs. dungeon) so
   * neither area's kills/respawn timers leak into the other, and neither resets the
   * player's local level/exp progress the way a second `init` call would.
   */
  loadMonsters: (monsters: MonsterInstanceSummary[]) => void;
  attackNearest: (playerX: number, playerZ: number) => AttackResult;
  monsterAttackTick: (playerX: number, playerZ: number) => MonsterAttackResult;
  respawnPlayer: () => void;
  tickRespawns: () => void;
}

function expToNextForLevel(level: number): number {
  return level * 100;
}

function toMonsterCombatState(monsters: MonsterInstanceSummary[]): Record<number, MonsterCombatState> {
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
      respawnAt: null,
      lastHitAt: null,
      attackPower: monsterAttackPower(monster.level),
      lastAttackAt: null,
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

  init: (character, monsters) => {
    set({
      ready: true,
      monsters: toMonsterCombatState(monsters),
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

  loadMonsters: (monsters) => {
    set({ monsters: toMonsterCombatState(monsters), lastAttackAt: 0 });
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
      const dx = monster.position[0] - playerX;
      const dz = monster.position[2] - playerZ;
      if (Math.hypot(dx, dz) > MONSTER_AGGRO_RANGE) continue;
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
          respawnAt: null,
        };
        changed = true;
      }
    }
    if (changed) set({ monsters: next });
  },
}));
