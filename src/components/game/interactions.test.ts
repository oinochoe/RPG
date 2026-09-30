import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { playerPosition } from './playerTransform';
import { clickToTalk, openTalk } from './interactions';
import * as moveTarget from './moveTarget';

vi.mock('./moveTarget', () => ({
  setTalkMoveTarget: vi.fn(),
  clearMoveTarget: vi.fn(),
  setAttackMoveTarget: vi.fn(),
  setAttackTargetOnly: vi.fn(),
  setSkillMoveTarget: vi.fn(),
}));
vi.mock('../../stores/lootStore', () => ({ pickupDrop: vi.fn(() => Promise.resolve(false)) }));

describe('openTalk', () => {
  it('opens the shop or the quest dialogue depending on the NPC', () => {
    const openShop = vi.spyOn(useUIStore.getState(), 'openShop').mockImplementation(() => undefined);
    const openQuest = vi.spyOn(useUIStore.getState(), 'openQuest').mockImplementation(() => undefined);
    openTalk({ type: 'shop', kind: 'blacksmith', villageIndex: 1 });
    expect(openShop).toHaveBeenCalledWith('blacksmith', 1);
    openTalk({ type: 'quest', name: '파수꾼' });
    expect(openQuest).toHaveBeenCalledWith('파수꾼');
  });
});

describe('clickToTalk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerPosition.x = 0;
    playerPosition.z = 0;
  });

  it('talks right away when already next to the NPC', () => {
    const openShop = vi.spyOn(useUIStore.getState(), 'openShop').mockImplementation(() => undefined);
    clickToTalk({ type: 'shop', kind: 'merchant', villageIndex: 0 }, [1.5, 0]);
    expect(openShop).toHaveBeenCalledWith('merchant', 0);
    expect(moveTarget.clearMoveTarget).toHaveBeenCalled();
    expect(moveTarget.setTalkMoveTarget).not.toHaveBeenCalled();
  });

  it('walks to a point beside the NPC (on the near side) when farther away, and talks on arrival', () => {
    const openQuest = vi.spyOn(useUIStore.getState(), 'openQuest').mockImplementation(() => undefined);
    clickToTalk({ type: 'quest', name: '노인' }, [10, 0]);
    expect(openQuest).not.toHaveBeenCalled();
    const [x, z, target] = vi.mocked(moveTarget.setTalkMoveTarget).mock.calls[0];
    expect(x).toBeCloseTo(10 - 1.6, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(target).toEqual({ type: 'quest', name: '노인' });
  });
});
