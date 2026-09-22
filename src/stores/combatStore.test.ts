import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  syncProgress: vi.fn().mockResolvedValue(undefined),
  upgradeSkill: vi.fn(),
}));

import * as charactersApi from '../api/characters';
import { useCombatStore, statPointCost } from './combatStore';
import type { CharacterProfile, MonsterInstanceSummary } from '../types/api';

const baseCharacter: CharacterProfile = {
  id: 1,
  user_id: 1,
  name: 'Test',
  character_class: 'warrior',
  level: 1,
  experience: 0,
  current_hp: 100,
  max_hp: 100,
  current_mp: 20,
  max_mp: 20,
  attack_power: 10,
  defense_power: 5,
  gold: 100,
  skill_points: 3,
  skill_upgrade_points: 0,
  current_map_id: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  stat_str: 5,
  stat_dex: 5,
  stat_con: 5,
  stat_int: 5,
  stat_wis: 5,
  skills: [],
  created_at: '2026-09-16T00:00:00Z',
  equipped_items: [],
  inventory: [],
};

// Carries non-zero attack/defense bonuses so payload-shape tests can actually
// discriminate "bonus subtracted out" (correct) from "bonus baked in" (the
// original Critical bug) — with equipped_items: [] the subtraction is always
// against 0 and both behaviors look identical.
const equippedCharacter: CharacterProfile = {
  ...baseCharacter,
  equipped_items: [
    { id: 1, item_template_id: 1, equipped_slot: 'weapon', enchant_level: 0, attack_bonus: 3, defense_bonus: 0 },
    { id: 2, item_template_id: 2, equipped_slot: 'armor', enchant_level: 0, attack_bonus: 0, defense_bonus: 2 },
  ],
};

describe('statPointCost', () => {
  it('costs 1 point for values 1-9', () => {
    expect(statPointCost(1)).toBe(1);
    expect(statPointCost(9)).toBe(1);
  });

  it('costs 2 points starting at value 10', () => {
    expect(statPointCost(10)).toBe(2);
    expect(statPointCost(19)).toBe(2);
  });

  it('costs 3 points starting at value 20', () => {
    expect(statPointCost(20)).toBe(3);
  });
});

describe('combatStore allocateStat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCombatStore.getState().init(baseCharacter, [], false);
  });

  it("increments a warrior's attack_power when STR is spent", () => {
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.statStr).toBe(6);
    expect(player.attackPower).toBe(11);
    expect(player.skillPoints).toBe(2);
  });

  it('does not touch attack_power when a warrior spends on DEX (off-class stat)', () => {
    useCombatStore.getState().allocateStat('dex');
    const { player } = useCombatStore.getState();
    expect(player.statDex).toBe(6);
    expect(player.attackPower).toBe(10);
  });

  it('CON raises max HP and defense, and heals by the HP gained', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentHp: 90 } }));
    useCombatStore.getState().allocateStat('con');
    const { player } = useCombatStore.getState();
    expect(player.maxHp).toBe(108);
    expect(player.currentHp).toBe(98);
    expect(player.defensePower).toBe(6);
  });

  it('WIS raises max MP and restores MP by the amount gained', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentMp: 15 } }));
    useCombatStore.getState().allocateStat('wis');
    const { player } = useCombatStore.getState();
    expect(player.maxMp).toBe(24);
    expect(player.currentMp).toBe(19);
  });

  it('does nothing when skillPoints is below the cost', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillPoints: 0 } }));
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.statStr).toBe(5);
  });

  it('spends the escalating cost once a stat reaches 10', () => {
    useCombatStore.setState((s) => ({
      player: { ...s.player, statStr: 10, skillPoints: 5 },
    }));
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.statStr).toBe(11);
    expect(player.skillPoints).toBe(3);
  });

  it('calls syncProgress after a successful allocation', () => {
    useCombatStore.getState().allocateStat('str');
    expect(charactersApi.syncProgress).toHaveBeenCalledTimes(1);
  });

  it('calls syncProgress with the correct payload shape after allocating', () => {
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(charactersApi.syncProgress).toHaveBeenCalledWith({
      level: player.level,
      experience: player.experience,
      skill_points: player.skillPoints,
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
    });
  });

  it('subtracts the equipment bonus out of the payload when items are equipped', () => {
    useCombatStore.getState().init(equippedCharacter, [], false);
    const { player: initialized } = useCombatStore.getState();
    // Sanity-check the fixture actually produced a non-zero equip bonus, or
    // this test would silently degrade back into the gap it's meant to close.
    expect(initialized.equipAttackBonus).toBe(3);
    expect(initialized.equipDefenseBonus).toBe(2);
    expect(initialized.attackPower).toBe(13); // base 10 + equip bonus 3

    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.attackPower).toBe(14); // 13 + 1 from the STR point

    // Base attack_power (10) + 1 from the STR allocation, with the +3 equip
    // bonus stripped back out. If syncProgress() were reverted to send
    // player.attackPower directly, this call would receive 14, not 11.
    expect(charactersApi.syncProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        attack_power: 11,
        defense_power: 5, // base defense_power (5), equip's +2 stripped out; untouched by STR
      })
    );
  });
});

describe('combatStore attackNearest level-up sync', () => {
  it('calls syncProgress when a kill causes a level-up', () => {
    const highXpCharacter: CharacterProfile = { ...baseCharacter, experience: 95 };
    const monster: MonsterInstanceSummary = {
      instance_id: 1,
      monster_template_id: 1,
      name: 'Slime',
      level: 5,
      current_hp: 1,
      max_hp: 1,
      position_x: 0,
      position_y: 0,
      position_z: 0,
    };
    useCombatStore.getState().init(highXpCharacter, [monster], true);
    useCombatStore.setState({ lastAttackAt: -Infinity });
    vi.clearAllMocks();

    useCombatStore.getState().attackNearest(0, 0);

    expect(charactersApi.syncProgress).toHaveBeenCalledTimes(1);

    const { player } = useCombatStore.getState();
    expect(charactersApi.syncProgress).toHaveBeenCalledWith({
      level: player.level,
      experience: player.experience,
      skill_points: player.skillPoints,
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
    });
  });
});

describe('combatStore castSkill', () => {
  const monster: MonsterInstanceSummary = {
    instance_id: 1,
    monster_template_id: 1,
    name: 'Slime',
    level: 1,
    current_hp: 1000,
    max_hp: 1000,
    position_x: 0,
    position_y: 0,
    position_z: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCombatStore.getState().init(baseCharacter, [monster], true);
  });

  it('does nothing when the skill is unlearned (skillLevel 0)', () => {
    const result = useCombatStore.getState().castSkill(1, 0, 0);
    expect(result.hit).toBe(false);
  });

  it('does nothing when on cooldown', () => {
    useCombatStore.setState((s) => ({
      player: { ...s.player, skillLevels: { 1: 1 }, skillCooldowns: { 1: performance.now() + 10_000 } },
    }));
    const result = useCombatStore.getState().castSkill(1, 0, 0);
    expect(result.hit).toBe(false);
  });

  it('does nothing when MP is below the cost', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 0 } }));
    const result = useCombatStore.getState().castSkill(1, 0, 0);
    expect(result.hit).toBe(false);
  });

  it('does nothing when no target is locked, even with the skill ready', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 20 } }));
    const result = useCombatStore.getState().castSkill(1, 0, 0);
    expect(result.hit).toBe(false);
  });

  it('hits the locked target, deducts MP, and sets a cooldown when ready', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 20 } }));
    useCombatStore.getState().setTarget(1);
    const before = performance.now();
    const result = useCombatStore.getState().castSkill(1, 0, 0);
    const { player } = useCombatStore.getState();
    expect(result.hit).toBe(true);
    expect(result.instanceId).toBe(1);
    expect(player.currentMp).toBe(5); // warrior's 강타 costs 15, started at 20
    expect(player.skillCooldowns[1]).toBeGreaterThan(before);
  });

  it('applies the per-level damage bonus (level 3 hits harder than level 1)', () => {
    // Pin the random damage-variance roll so the two casts are only comparing the
    // per-level multiplier, not noise from the (0.8 + Math.random() * 0.4) band.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 100 } }));
      useCombatStore.getState().setTarget(1);
      useCombatStore.getState().castSkill(1, 0, 0);
      const lowLevelDamage = useCombatStore.getState().monsters[1].maxHp - useCombatStore.getState().monsters[1].currentHp;

      useCombatStore.getState().init(baseCharacter, [monster], true);
      useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 3 }, currentMp: 100 } }));
      useCombatStore.getState().setTarget(1);
      useCombatStore.getState().castSkill(1, 0, 0);
      const highLevelDamage = useCombatStore.getState().monsters[1].maxHp - useCombatStore.getState().monsters[1].currentHp;

      // Level 3 = base multiplier * 1.2 (per the +10%/level formula) vs level 1's bare
      // base multiplier, with the random band now pinned identically for both casts.
      expect(highLevelDamage).toBeGreaterThan(lowLevelDamage);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('a killing skill hit still runs the shared level-up/gold logic', () => {
    const weakMonster: MonsterInstanceSummary = { ...monster, current_hp: 1, max_hp: 1 };
    useCombatStore.getState().init({ ...baseCharacter, experience: 95 }, [weakMonster], true);
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 100 } }));
    useCombatStore.getState().setTarget(1);
    vi.clearAllMocks();

    const result = useCombatStore.getState().castSkill(1, 0, 0);

    expect(result.killed).toBe(true);
    expect(result.leveledUp).toBe(true);
    expect(charactersApi.syncProgress).toHaveBeenCalledTimes(1);
    expect(useCombatStore.getState().player.skillUpgradePoints).toBe(1);
  });
});

describe('combatStore toggleAimSkill', () => {
  beforeEach(() => {
    useCombatStore.getState().init(baseCharacter, [], true);
  });

  it('does nothing when the skill is unlearned', () => {
    useCombatStore.getState().toggleAimSkill(1);
    expect(useCombatStore.getState().armedSkillId).toBeNull();
  });

  it('does nothing when MP is below the cost', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 0 } }));
    useCombatStore.getState().toggleAimSkill(1);
    expect(useCombatStore.getState().armedSkillId).toBeNull();
  });

  it('arms aiming when the skill is castable', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 20 } }));
    useCombatStore.getState().toggleAimSkill(1);
    expect(useCombatStore.getState().armedSkillId).toBe(1);
  });

  it('does nothing while the skill is on cooldown', () => {
    useCombatStore.setState((s) => ({
      player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 20, skillCooldowns: { 1: performance.now() + 10_000 } },
    }));
    useCombatStore.getState().toggleAimSkill(1);
    expect(useCombatStore.getState().armedSkillId).toBeNull();
  });

  it('disarms aiming on a second press, without re-checking castability', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 20 } }));
    useCombatStore.getState().toggleAimSkill(1);
    useCombatStore.setState({ armedSkillId: 1, player: { ...useCombatStore.getState().player, currentMp: 0 } });
    useCombatStore.getState().toggleAimSkill(1);
    expect(useCombatStore.getState().armedSkillId).toBeNull();
  });

  it('cancelAimSkill always disarms', () => {
    useCombatStore.setState({ armedSkillId: 1 });
    useCombatStore.getState().cancelAimSkill();
    expect(useCombatStore.getState().armedSkillId).toBeNull();
  });
});

describe('combatStore targeting', () => {
  const nearMonster: MonsterInstanceSummary = {
    instance_id: 1,
    monster_template_id: 1,
    name: 'Slime',
    level: 1,
    current_hp: 100,
    max_hp: 100,
    position_x: 1,
    position_y: 0,
    position_z: 0,
  };
  const lockedMonster: MonsterInstanceSummary = {
    instance_id: 2,
    monster_template_id: 1,
    name: 'Goblin',
    level: 1,
    current_hp: 100,
    max_hp: 100,
    position_x: 2,
    position_y: 0,
    position_z: 0,
  };

  beforeEach(() => {
    useCombatStore.getState().init(baseCharacter, [nearMonster, lockedMonster], true);
  });

  it('attacks the locked target instead of whichever monster is nearest', () => {
    useCombatStore.getState().setTarget(2);
    useCombatStore.setState({ lastAttackAt: -Infinity });

    const result = useCombatStore.getState().attackNearest(0, 0);

    expect(result.hit).toBe(true);
    expect(result.instanceId).toBe(2);
    expect(useCombatStore.getState().monsters[1].currentHp).toBe(100);
  });

  it('misses instead of redirecting to another monster when the locked target is out of range', () => {
    useCombatStore.setState((s) => ({
      monsters: { ...s.monsters, 2: { ...s.monsters[2], position: [50, 0, 0] } },
    }));
    useCombatStore.getState().setTarget(2);
    useCombatStore.setState({ lastAttackAt: -Infinity });

    const result = useCombatStore.getState().attackNearest(0, 0);

    expect(result.hit).toBe(false);
    expect(useCombatStore.getState().monsters[1].currentHp).toBe(100);
  });

  it('falls back to nearest-in-range when nothing is locked', () => {
    useCombatStore.setState({ lastAttackAt: -Infinity });

    const result = useCombatStore.getState().attackNearest(0, 0);

    expect(result.hit).toBe(true);
    expect(result.instanceId).toBe(1);
  });

  it('clears the lock automatically once the locked target dies', () => {
    useCombatStore.setState((s) => ({
      monsters: { ...s.monsters, 2: { ...s.monsters[2], currentHp: 1 } },
    }));
    useCombatStore.getState().setTarget(2);
    useCombatStore.setState({ lastAttackAt: -Infinity });

    const result = useCombatStore.getState().attackNearest(0, 0);

    expect(result.killed).toBe(true);
    expect(useCombatStore.getState().targetId).toBeNull();
  });

  it('castSkill also honors the lock', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevels: { 1: 1 }, currentMp: 100 } }));
    useCombatStore.getState().setTarget(2);

    const result = useCombatStore.getState().castSkill(1, 0, 0);

    expect(result.hit).toBe(true);
    expect(result.instanceId).toBe(2);
  });
});

describe('combatStore tickMpRegen', () => {
  beforeEach(() => {
    useCombatStore.getState().init(baseCharacter, [], false);
  });

  it('adds 1 MP', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentMp: 10, maxMp: 20 } }));
    useCombatStore.getState().tickMpRegen();
    expect(useCombatStore.getState().player.currentMp).toBe(11);
  });

  it('caps at maxMp', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentMp: 20, maxMp: 20 } }));
    useCombatStore.getState().tickMpRegen();
    expect(useCombatStore.getState().player.currentMp).toBe(20);
  });
});
