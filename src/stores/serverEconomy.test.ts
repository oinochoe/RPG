// Guards the server-authoritative economy against drifting from the client's local prediction and
// from the game's real spawn tables. The server rules live in supabase/functions/api (pure
// modules, imported here); the client shows kill/level-up results instantly and then adopts the
// server's answer, so any mismatch shows up to players as numbers jumping after every kill.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  syncProgress: vi.fn().mockResolvedValue(undefined),
  upgradeSkill: vi.fn(),
}));

import { useCombatStore, statPointCost as clientStatPointCost, BOSS_KEY_BY_NAME } from './combatStore';
import { buildFieldMonsters } from '../components/game/FieldMonsters';
import { buildFloorMonsters, DUNGEON_META, type DungeonId } from '../components/game/dungeonLayout';
import type { CharacterProfile, MonsterInstanceSummary } from '../types/api';
import {
  BOSSES,
  KILL_BATCH_MAX,
  MAX_REGULAR_MONSTER_LEVEL,
  applyExperience,
  checkKill,
  expToNext,
  killExp,
  killGoldRange,
  parseKillBatch,
  statPointCost,
} from '../../supabase/functions/api/economyRules';
import { rollDropEntry } from '../../supabase/functions/api/drops';

const character: CharacterProfile = {
  id: 1, user_id: 1, name: 'T', character_class: 'warrior', level: 1, experience: 0,
  current_hp: 100, max_hp: 100, current_mp: 20, max_mp: 20, attack_power: 10, defense_power: 5,
  gold: 0, skill_points: 0, skill_upgrade_points: 0, current_map_id: 1, position_x: 0,
  position_y: 0, position_z: 0, stat_str: 5, stat_dex: 5, stat_con: 5, stat_int: 5, stat_wis: 5,
  skills: [], active_quests: [], boss_cooldowns: [], created_at: '2026-09-16T00:00:00Z',
  equipped_items: [], inventory: [],
};

function monster(level: number, id = 1): MonsterInstanceSummary {
  return {
    instance_id: id, monster_template_id: 1, name: '슬라임', level,
    current_hp: 1, max_hp: 1, position_x: 0, position_y: 0, position_z: 0,
  };
}

describe('server rules match the client\'s local prediction', () => {
  beforeEach(() => {
    useCombatStore.getState().init(character, [], false);
  });

  it('level-up loop: same level/exp/HP/attack/points as combatStore for many exp amounts', () => {
    for (const gained of [0, 99, 100, 250, 700, 800, 5_000, 123_456]) {
      useCombatStore.getState().init(character, [], false);
      useCombatStore.getState().grantQuestReward(gained, 0);
      const p = useCombatStore.getState().player;
      const { state } = applyExperience(
        { level: 1, experience: 0, maxHp: 100, attackPower: 10, statPoints: 0, skillUpgradePoints: 0 },
        gained,
      );
      expect({ level: p.level, exp: p.experience, maxHp: p.maxHp, atk: p.attackPower, sp: p.skillPoints, sup: p.skillUpgradePoints }, `exp ${gained}`)
        .toEqual({ level: state.level, exp: state.experience, maxHp: state.maxHp, atk: state.attackPower, sp: state.statPoints, sup: state.skillUpgradePoints });
      expect(p.expToNext).toBe(expToNext(p.level));
    }
  });

  it('a kill grants exp = level*20 and gold within the server\'s range', () => {
    for (const level of [1, 3, 7, 12]) {
      useCombatStore.getState().init(character, [monster(level)], false);
      const before = useCombatStore.getState().player;
      const result = useCombatStore.getState().attackNearest(0, 0);
      expect(result.killed).toBe(true);
      const after = useCombatStore.getState().player;
      // (levels up when the exp crosses a threshold, so compare total exp instead of the bar)
      const gainedExp = applyExperience(
        { level: before.level, experience: before.experience, maxHp: before.maxHp, attackPower: before.attackPower, statPoints: 0, skillUpgradePoints: 0 },
        killExp(level),
      ).state;
      expect(after.level).toBe(gainedExp.level);
      expect(after.experience).toBe(gainedExp.experience);
      const [min, max] = killGoldRange(level);
      expect(after.gold - before.gold).toBeGreaterThanOrEqual(min);
      expect(after.gold - before.gold).toBeLessThanOrEqual(max);
    }
  });

  it('stat point cost is the same escalating curve', () => {
    for (let v = 1; v <= 60; v++) expect(statPointCost(v)).toBe(clientStatPointCost(v));
  });
});

describe('monster level caps cover every monster the game can actually spawn', () => {
  function collect() {
    const all: MonsterInstanceSummary[] = [...buildFieldMonsters()];
    for (const id of Object.keys(DUNGEON_META) as DungeonId[]) {
      for (let floor = 1; floor <= DUNGEON_META[id].maxFloor; floor++) all.push(...buildFloorMonsters(id, floor));
    }
    return all;
  }

  it('no spawned regular monster is above its template cap, and every template has a cap', () => {
    for (const m of collect()) {
      if (m.name in BOSS_KEY_BY_NAME) continue;
      const cap = MAX_REGULAR_MONSTER_LEVEL[m.monster_template_id];
      expect(cap, `template ${m.monster_template_id} (${m.name}) has no cap`).toBeDefined();
      expect(m.level, `${m.name} lv${m.level} exceeds cap ${cap}`).toBeLessThanOrEqual(cap);
    }
  });

  it('the caps are tight (each is reached by a real spawn) so they stay meaningful', () => {
    const maxSeen: Record<number, number> = {};
    for (const m of collect()) {
      if (m.name in BOSS_KEY_BY_NAME) continue;
      maxSeen[m.monster_template_id] = Math.max(maxSeen[m.monster_template_id] ?? 0, m.level);
    }
    for (const [template, cap] of Object.entries(MAX_REGULAR_MONSTER_LEVEL)) {
      expect(maxSeen[Number(template)], `template ${template}`).toBe(cap);
    }
  });

  it('each boss table entry matches the real boss spawn (name, template, level)', () => {
    const bosses = collect().filter((m) => m.name in BOSS_KEY_BY_NAME);
    expect(Object.keys(BOSSES).sort()).toEqual(Object.values(BOSS_KEY_BY_NAME).sort());
    for (const [key, boss] of Object.entries(BOSSES)) {
      const spawn = bosses.find((m) => BOSS_KEY_BY_NAME[m.name] === key);
      expect(spawn, key).toBeDefined();
      expect(spawn!.name).toBe(boss.name);
      expect(spawn!.monster_template_id).toBe(boss.templateId);
      expect(spawn!.level).toBe(boss.level);
    }
  });
});

describe('checkKill / parseKillBatch', () => {
  it('accepts a normal kill and a real boss kill', () => {
    expect(checkKill({ template_id: 1, level: 2 })).toEqual({ ok: true, kill: { template_id: 1, level: 2 } });
    expect(checkKill({ template_id: 5, level: 40, boss_key: 'world_boss' }).ok).toBe(true);
  });

  it.each([
    ['unknown monster', { template_id: 99, level: 1 }],
    ['level above the cap', { template_id: 1, level: 3 }],
    ['level 999', { template_id: 2, level: 999 }],
    ['template 5 without a boss key', { template_id: 5, level: 40 }],
    ['boss with the wrong template', { template_id: 1, level: 40, boss_key: 'world_boss' }],
    ['boss above its level', { template_id: 5, level: 41, boss_key: 'world_boss' }],
    ['unknown boss key', { template_id: 5, level: 1, boss_key: 'nope' }],
    ['non-integer level', { template_id: 1, level: 1.5 }],
    ['level 0', { template_id: 1, level: 0 }],
    ['garbage', 'x'],
    ['null', null],
  ])('refuses %s', (_label, kill) => {
    expect(checkKill(kill).ok).toBe(false);
  });

  it('a batch must be 1..25 valid kills', () => {
    const one = { template_id: 1, level: 1 };
    expect(parseKillBatch([one]).ok).toBe(true);
    expect(parseKillBatch(Array(KILL_BATCH_MAX).fill(one)).ok).toBe(true);
    expect(parseKillBatch([]).ok).toBe(false);
    expect(parseKillBatch(Array(KILL_BATCH_MAX + 1).fill(one)).ok).toBe(false);
    expect(parseKillBatch([one, { template_id: 1, level: 99 }]).ok).toBe(false);
    expect(parseKillBatch('nope').ok).toBe(false);
  });
});

describe('server drop rolling', () => {
  const SCROLLS = new Set([47, 48, 50, 86]);
  const rate = (templateId: number, name: string, n = 40_000) => {
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const e = rollDropEntry(templateId, name);
      if (e && SCROLLS.has(e.itemTemplateId)) hits++;
    }
    return hits / n;
  };

  it('regular monsters drop an enchant scroll ~1% of kills or less', () => {
    expect(rate(1, '슬라임')).toBeLessThan(0.015);
    expect(rate(6, '오크')).toBeLessThan(0.02);
  });

  it('bosses drop them far more often', () => {
    expect(rate(5, '거인 군주')).toBeGreaterThan(0.15);
  });

  // rollDropEntry draws twice: first the scroll roll, then the weighted table roll.
  const sequence = (...values: number[]) => {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  };

  it('is deterministic for a pinned rng', () => {
    // no scroll (0.9), then the very bottom of the table = the "nothing" band
    expect(rollDropEntry(1, '슬라임', sequence(0.9, 0))).toBeNull();
    // no scroll, then the very top of the table = the last entry (a real item)
    expect(rollDropEntry(1, '슬라임', sequence(0.9, 0.999))).not.toBeNull();
    // a scroll roll under the weapon-scroll chance wins before the table is consulted
    expect(rollDropEntry(1, '슬라임', sequence(0))?.itemTemplateId).toBe(50);
  });

  it('bosses always drop something', () => {
    for (let i = 0; i < 300; i++) expect(rollDropEntry(5, '거인 군주')).not.toBeNull();
  });

  it('an unknown monster drops nothing', () => {
    expect(rollDropEntry(9999, '???')).toBeNull();
  });
});

describe('drop rates', () => {
  // Measures the real roll path: the scroll roll (first rng call) is forced to miss, then the
  // table roll sweeps the whole [0, 1) range, so the fractions below are exact to the step size.
  const STEPS = 4000;
  function measure(templateId: number, name: string) {
    let drops = 0;
    let mana = 0;
    for (let i = 0; i < STEPS; i++) {
      const r = (i + 0.5) / STEPS;
      let call = 0;
      const entry = rollDropEntry(templateId, name, () => (call++ === 0 ? 0.99 : r));
      if (entry) {
        drops++;
        if (entry.itemTemplateId === 12 || entry.itemTemplateId === 13) mana++;
      }
    }
    return { drop: drops / STEPS, mana: mana / STEPS };
  }

  const REGULAR = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 15];
  const ELITE = [5, 13, 14];

  it.each(REGULAR)('a regular monster (template %i) drops something about 25% of the time', (id) => {
    const { drop } = measure(id, `m${id}`);
    expect(drop).toBeGreaterThan(0.23);
    expect(drop).toBeLessThan(0.27);
  });

  it.each(ELITE)('an elite (template %i) drops something about 60% of the time', (id) => {
    const { drop } = measure(id, `m${id}`);
    expect(drop).toBeGreaterThan(0.57);
    expect(drop).toBeLessThan(0.63);
  });

  it('keeps mana potions from dominating any kill: at most about 12% per kill', () => {
    for (const id of [...REGULAR, ...ELITE]) {
      expect(measure(id, `m${id}`).mana, `template ${id}`).toBeLessThan(0.13);
    }
  });

  it('never returns nothing for a tracked boss', () => {
    for (const boss of ['태고의 거인', '거인 군주', '오크 군주', '구울 군주', '버섯 군주']) {
      for (let i = 0; i < 2000; i++) {
        const r = (i + 0.5) / 2000;
        let call = 0;
        expect(rollDropEntry(5, boss, () => (call++ === 0 ? 0.99 : r)), `${boss} @ ${r}`).not.toBeNull();
      }
    }
  });

  it('still rolls a scroll before the table when the scroll roll hits', () => {
    // rng 0 is below every non-zero scroll chance, so the first scroll in order (weapon) wins for a tier that has one.
    const entry = rollDropEntry(13, 'm13', () => 0);
    expect(entry?.itemType).toBe('scroll');
  });

  it('returns null for a template with no drop table', () => {
    expect(rollDropEntry(9999, 'nobody', () => 0.5)).toBeNull();
  });
});
