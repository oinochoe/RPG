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
}

interface PlayerCombatState {
  level: number;
  experience: number;
  expToNext: number;
  currentHp: number;
  maxHp: number;
  attackPower: number;
  attackRange: number;
}

interface AttackResult {
  hit: boolean;
  instanceId?: number;
  damage?: number;
  killed?: boolean;
  leveledUp?: boolean;
}

interface CombatState {
  ready: boolean;
  monsters: Record<number, MonsterCombatState>;
  player: PlayerCombatState;
  lastAttackAt: number;
  init: (character: CharacterProfile, monsters: MonsterInstanceSummary[]) => void;
  attackNearest: (playerX: number, playerZ: number) => AttackResult;
  tickRespawns: () => void;
}

function expToNextForLevel(level: number): number {
  return level * 100;
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
  },
  lastAttackAt: 0,

  init: (character, monsters) => {
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
      };
    }
    set({
      ready: true,
      monsters: monsterState,
      player: {
        level: character.level,
        experience: character.experience,
        expToNext: expToNextForLevel(character.level),
        currentHp: character.current_hp,
        maxHp: character.max_hp,
        attackPower: character.attack_power,
        attackRange: ATTACK_RANGE_BY_CLASS[character.character_class],
      },
      lastAttackAt: 0,
    });
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
    if (killed) {
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

      nextPlayer = { level, experience, expToNext, currentHp, maxHp, attackPower, attackRange: player.attackRange };
    }

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
      lastAttackAt: now,
    });

    return { hit: true, instanceId: nearest.instanceId, damage, killed, leveledUp };
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
