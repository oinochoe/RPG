import { describe, expect, it } from 'vitest';
import { isFieldBossAggressive } from './FieldMonsters';
import type { MonsterInstanceSummary } from '../../types/api';

function monster(name: string): MonsterInstanceSummary {
  return {
    instance_id: 1,
    monster_template_id: 1,
    name,
    level: 1,
    current_hp: 1,
    max_hp: 1,
    position_x: 0,
    position_y: 0,
    position_z: 0,
  };
}

describe('isFieldBossAggressive', () => {
  it('the world boss aggros on sight', () => {
    expect(isFieldBossAggressive(monster('태고의 거인'))).toBe(true);
  });

  it('죽음의 기사 and 유적의 파수병 aggro on sight (a passive "guardian" would be a contradiction)', () => {
    expect(isFieldBossAggressive(monster('죽음의 기사'))).toBe(true);
    expect(isFieldBossAggressive(monster('유적의 파수병'))).toBe(true);
  });

  it('regular field monsters stay passive', () => {
    expect(isFieldBossAggressive(monster('슬라임'))).toBe(false);
    expect(isFieldBossAggressive(monster('늑대'))).toBe(false);
    expect(isFieldBossAggressive(monster('코볼트'))).toBe(false);
  });
});
