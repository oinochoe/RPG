import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { playerPosition } from './playerTransform';
import { clickToTalk, openTalk, currentInteraction, talkToNearby, interact } from './interactions';
import * as engage from './engage';
import * as moveTarget from './moveTarget';

vi.mock('./moveTarget', () => ({
  setTalkMoveTarget: vi.fn(),
  clearMoveTarget: vi.fn(),
  setAttackMoveTarget: vi.fn(),
  setAttackTargetOnly: vi.fn(),
  setSkillMoveTarget: vi.fn(),
}));
vi.mock('./engage', () => ({ attackNearestMonster: vi.fn(() => false) }));
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

describe('discovery interactions (priority shop > quest > discovery > pickup)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(engage.attackNearestMonster).mockClear();
    useUIStore.setState({ nearShopKind: null, nearQuestNpcName: null, nearDiscoveryId: null, nearDropId: null });
  });

  it('a nearby discovery alone is "discovery" and Space opens it', () => {
    useUIStore.setState({ nearDiscoveryId: 'x' });
    const openDiscovery = vi.spyOn(useUIStore.getState(), 'openDiscovery').mockImplementation(() => undefined);
    expect(currentInteraction()).toBe('discovery');
    expect(talkToNearby()).toBe(true);
    expect(openDiscovery).toHaveBeenCalledWith('x');
  });

  it('shop beats quest beats discovery beats pickup', () => {
    useUIStore.setState({ nearDiscoveryId: 'x', nearDropId: 5 });
    expect(currentInteraction()).toBe('discovery');
    useUIStore.setState({ nearQuestNpcName: '노인' });
    expect(currentInteraction()).toBe('quest');
    useUIStore.setState({ nearShopKind: 'merchant' });
    expect(currentInteraction()).toBe('shop');
    useUIStore.setState({ nearShopKind: null, nearQuestNpcName: null, nearDiscoveryId: null });
    expect(currentInteraction()).toBe('pickup');
  });

  it('Space opens the quest instead of the discovery when both are in range', () => {
    useUIStore.setState({ nearDiscoveryId: 'x', nearQuestNpcName: '노인' });
    const openQuest = vi.spyOn(useUIStore.getState(), 'openQuest').mockImplementation(() => undefined);
    const openDiscovery = vi.spyOn(useUIStore.getState(), 'openDiscovery').mockImplementation(() => undefined);
    talkToNearby();
    expect(openQuest).toHaveBeenCalledWith('노인');
    expect(openDiscovery).not.toHaveBeenCalled();
  });

  it('Space opens the shop instead of the discovery when both are in range', () => {
    useUIStore.setState({ nearDiscoveryId: 'x', nearQuestNpcName: '노인', nearShopKind: 'merchant' });
    const openShop = vi.spyOn(useUIStore.getState(), 'openShop').mockImplementation(() => undefined);
    const openDiscovery = vi.spyOn(useUIStore.getState(), 'openDiscovery').mockImplementation(() => undefined);
    talkToNearby();
    expect(openShop).toHaveBeenCalled();
    expect(openDiscovery).not.toHaveBeenCalled();
  });

  it('openTalk opens a discovery', () => {
    const openDiscovery = vi.spyOn(useUIStore.getState(), 'openDiscovery').mockImplementation(() => undefined);
    openTalk({ type: 'discovery', id: 'x' });
    expect(openDiscovery).toHaveBeenCalledWith('x');
  });

  it('the touch action button inspects a nearby discovery before attacking a monster', () => {
    useUIStore.setState({ nearDiscoveryId: 'x' });
    const openDiscovery = vi.spyOn(useUIStore.getState(), 'openDiscovery').mockImplementation(() => undefined);
    expect(interact()).toBe(true);
    expect(openDiscovery).toHaveBeenCalledWith('x');
    expect(engage.attackNearestMonster).not.toHaveBeenCalled();
  });

  it('openDiscovery closes other panels and sets the dialog id', () => {
    useUIStore.setState({ isShopOpen: true });
    useUIStore.getState().openDiscovery('x');
    expect(useUIStore.getState().discoveryDialogId).toBe('x');
    expect(useUIStore.getState().isShopOpen).toBe(false);
    useUIStore.getState().closeDiscovery();
    expect(useUIStore.getState().discoveryDialogId).toBeNull();
  });
});
