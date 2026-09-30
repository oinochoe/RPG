/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useCombatStore, type MonsterCombatState } from '../../stores/combatStore';
import { playerPosition } from './playerTransform';
import { attackNearestMonster, castSkillOnTouch, engageMonster, nearestMonster } from './engage';
import * as moveTarget from './moveTarget';

vi.mock('./moveTarget', () => ({
  setAttackMoveTarget: vi.fn(),
  setAttackTargetOnly: vi.fn(),
  setSkillMoveTarget: vi.fn(),
  clearMoveTarget: vi.fn(),
}));

function monster(id: number, x: number, z: number, alive = true): MonsterCombatState {
  return { instanceId: id, name: `몬스터${id}`, alive, position: [x, 0, z] } as unknown as MonsterCombatState;
}

function setWorld(monsters: MonsterCombatState[], attackRange = 2) {
  const state = useCombatStore.getState();
  useCombatStore.setState({
    monsters: Object.fromEntries(monsters.map((m) => [m.instanceId, m])),
    targetId: null,
    armedSkillId: null,
    player: { ...state.player, attackRange },
  });
}

describe('nearestMonster', () => {
  beforeEach(() => {
    playerPosition.x = 0;
    playerPosition.z = 0;
  });

  it('picks the closest living monster in range', () => {
    setWorld([monster(1, 8, 0), monster(2, 3, 0), monster(3, 5, 0)]);
    expect(nearestMonster()?.id).toBe(2);
  });

  it('ignores dead monsters and ones too far away', () => {
    setWorld([monster(1, 1, 0, false), monster(2, 30, 0)]);
    expect(nearestMonster(12)).toBeNull();
    setWorld([monster(1, 1, 0, false), monster(2, 30, 0), monster(3, 9, 0)]);
    expect(nearestMonster(12)?.id).toBe(3);
  });
});

describe('engageMonster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerPosition.x = 0;
    playerPosition.z = 0;
  });

  it('locks the target and attacks in place when already in range', () => {
    setWorld([monster(7, 1.5, 0)], 2);
    engageMonster(7, [1.5, 0, 0]);
    expect(useCombatStore.getState().targetId).toBe(7);
    expect(moveTarget.setAttackTargetOnly).toHaveBeenCalledWith(7);
    expect(moveTarget.setAttackMoveTarget).not.toHaveBeenCalled();
  });

  it('walks to a standoff point on the near side when out of range', () => {
    setWorld([monster(7, 10, 0)], 2);
    engageMonster(7, [10, 0, 0]);
    expect(moveTarget.setAttackMoveTarget).toHaveBeenCalledTimes(1);
    const [x, z, id] = vi.mocked(moveTarget.setAttackMoveTarget).mock.calls[0];
    expect(id).toBe(7);
    expect(x).toBeCloseTo(10 - 2 * 0.85, 6); // attackRange * 0.85 short of the monster, toward the player
    expect(z).toBeCloseTo(0, 6);
  });

  it('fires an armed skill on the spot when in range, and walks first when not', () => {
    const cast = vi.spyOn(useCombatStore.getState(), 'requestCastSkill').mockImplementation(() => undefined);
    setWorld([monster(7, 1, 0)], 2);
    useCombatStore.setState({ armedSkillId: 3 });
    engageMonster(7, [1, 0, 0]);
    expect(moveTarget.clearMoveTarget).toHaveBeenCalled();
    expect(cast).toHaveBeenCalledWith(3);
    expect(useCombatStore.getState().armedSkillId).toBeNull();

    vi.clearAllMocks();
    setWorld([monster(8, 12, 0)], 2);
    useCombatStore.setState({ armedSkillId: 3 });
    engageMonster(8, [12, 0, 0]);
    expect(moveTarget.setSkillMoveTarget).toHaveBeenCalled();
    cast.mockRestore();
  });
});

describe('attackNearestMonster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerPosition.x = 0;
    playerPosition.z = 0;
  });

  it('engages the nearest monster and reports it', () => {
    setWorld([monster(1, 9, 0), monster(2, 4, 0)]);
    expect(attackNearestMonster()).toBe(true);
    expect(useCombatStore.getState().targetId).toBe(2);
  });

  it('does nothing and reports false when nothing is near', () => {
    setWorld([monster(1, 50, 0)]);
    expect(attackNearestMonster()).toBe(false);
    expect(useCombatStore.getState().targetId).toBeNull();
  });
});

describe('castSkillOnTouch', () => {
  let cast: ReturnType<typeof vi.spyOn>;
  let toggle: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    playerPosition.x = 0;
    playerPosition.z = 0;
    cast = vi.spyOn(useCombatStore.getState(), 'requestCastSkill').mockImplementation(() => undefined);
    // Stand-in for the real guard: arms the skill, or disarms it if it is already armed.
    toggle = vi.spyOn(useCombatStore.getState(), 'toggleAimSkill').mockImplementation((id: number) => {
      useCombatStore.setState({ armedSkillId: useCombatStore.getState().armedSkillId === id ? null : id });
    });
  });

  it('fires the skill at the nearest monster in one tap', () => {
    setWorld([monster(1, 9, 0), monster(2, 1, 0)], 2);
    castSkillOnTouch(5);
    expect(cast).toHaveBeenCalledWith(5);
    expect(useCombatStore.getState().targetId).toBe(2);
    expect(useCombatStore.getState().armedSkillId).toBeNull();
  });

  it('prefers the monster already being fought over a closer one', () => {
    setWorld([monster(1, 9, 0), monster(2, 1, 0)], 12);
    useCombatStore.setState({ targetId: 1 });
    castSkillOnTouch(5);
    expect(useCombatStore.getState().targetId).toBe(1);
    expect(cast).toHaveBeenCalledWith(5);
  });

  it('walks up first when the monster is out of range, casting on arrival', () => {
    setWorld([monster(3, 10, 0)], 2);
    castSkillOnTouch(5);
    expect(cast).not.toHaveBeenCalled();
    expect(moveTarget.setSkillMoveTarget).toHaveBeenCalled();
  });

  it('does nothing when the skill cannot be used (the guard refuses to arm it)', () => {
    toggle.mockImplementation(() => undefined);
    setWorld([monster(1, 1, 0)], 2);
    castSkillOnTouch(5);
    expect(cast).not.toHaveBeenCalled();
    expect(useCombatStore.getState().targetId).toBeNull();
  });

  it('with nothing nearby it stays armed, and a second tap cancels', () => {
    setWorld([monster(1, 80, 0)], 2);
    castSkillOnTouch(5);
    expect(useCombatStore.getState().armedSkillId).toBe(5);
    castSkillOnTouch(5);
    expect(useCombatStore.getState().armedSkillId).toBeNull();
    expect(cast).not.toHaveBeenCalled();
  });

  it('a second tap fires once a monster has come near', () => {
    setWorld([monster(1, 80, 0)], 2);
    castSkillOnTouch(5);
    setWorld([monster(1, 1, 0)], 2);
    useCombatStore.setState({ armedSkillId: 5 });
    castSkillOnTouch(5);
    expect(cast).toHaveBeenCalledWith(5);
  });
});

// three.js cannot read CSS variables: `color="var(--color-x)"` on a material or light silently becomes
// white. That is exactly how the target ring turned into a bright white flash. Colors handed to
// three.js must be hex values (see THEME); `var(--…)` is only for DOM styles.
describe('3D color props', () => {
  it('never pass a CSS variable to a three.js material, light or background', () => {
    const dir = resolve(__dirname);
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      for (const match of source.matchAll(/<(mesh\w*Material|\w*Light|color)\b[^>]*?\b(?:color|args)=(?:"|\{\[?['"`])?[^>]*var\(--/g)) {
        offenders.push(`${file}: ${match[0].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
