import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  reportKills: vi.fn(),
  getActiveCharacterProfile: vi.fn(),
  syncProgress: vi.fn().mockResolvedValue(undefined),
  allocateStatOnServer: vi.fn(),
  lootItem: vi.fn(),
}));

import * as charactersApi from '../api/characters';
import { ApiError } from '../types/api';
import type { CharacterProfile, KillReportResponse, ProgressSnapshot } from '../types/api';
import { useCombatStore, type KillInfo } from './combatStore';
import { useCharacterStore } from './characterStore';
import { useLootStore } from './lootStore';
import { useQuestStore } from './questStore';
import { reportKills, resetKillReporter } from './killReporter';

const profile: CharacterProfile = {
  id: 1, user_id: 1, name: 'T', character_class: 'warrior', level: 1, experience: 0,
  current_hp: 100, max_hp: 100, current_mp: 20, max_mp: 20, attack_power: 10, defense_power: 5,
  gold: 100, skill_points: 0, skill_upgrade_points: 0, current_map_id: 1, position_x: 0,
  position_y: 0, position_z: 0, stat_str: 5, stat_dex: 5, stat_con: 5, stat_int: 5, stat_wis: 5,
  skills: [], active_quests: [], boss_cooldowns: [], created_at: '2026-09-16T00:00:00Z',
  equipped_items: [], inventory: [], progress_rev: 0,
};

const snapshot = (over: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  level: 2, experience: 30, gold: 160, skill_points: 3, skill_upgrade_points: 1,
  max_hp: 120, max_mp: 20, attack_power: 12, defense_power: 5,
  stat_str: 5, stat_dex: 5, stat_con: 5, stat_int: 5, stat_wis: 5,
  progress_rev: 1, exp_gained: 40, gold_gained: 60, leveled_up: true, ...over,
});

const kill = (over: Partial<KillInfo> = {}): KillInfo => ({
  instanceId: 1, monsterTemplateId: 1, level: 2, name: '슬라임', position: [10, 0, 20], ...over,
});

const response = (over: Partial<KillReportResponse> = {}): KillReportResponse => ({
  progress: snapshot(),
  results: [{ index: 0, accepted: true }],
  quests_updated: [],
  boss_cooldowns: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetKillReporter();
  useCharacterStore.setState({ activeCharacter: profile });
  useCombatStore.getState().init(profile, [], false);
  useLootStore.setState({ drops: [], nextId: 1 });
  useQuestStore.setState({ quests: {}, ready: true });
});

afterEach(() => {
  resetKillReporter();
  vi.useRealTimers();
});

const flush = () => vi.advanceTimersByTimeAsync(120);

describe('killReporter', () => {
  it('batches kills made within 100ms into one request', async () => {
    vi.mocked(charactersApi.reportKills).mockResolvedValue(response({ results: [{ index: 0, accepted: true }, { index: 1, accepted: true }] }));
    reportKills([kill()]);
    reportKills([kill({ instanceId: 2, monsterTemplateId: 4, level: 3, name: '가시선인장' })]);
    expect(useCombatStore.getState().pendingReports).toBe(2);
    await flush();
    expect(charactersApi.reportKills).toHaveBeenCalledTimes(1);
    expect(charactersApi.reportKills).toHaveBeenCalledWith([
      { template_id: 1, level: 2 },
      { template_id: 4, level: 3 },
    ]);
  });

  it("adopts the server's snapshot after the response and clears the pending count", async () => {
    vi.mocked(charactersApi.reportKills).mockResolvedValue(response());
    reportKills([kill()]);
    await flush();
    const { player, pendingReports, progressRev } = useCombatStore.getState();
    expect(pendingReports).toBe(0);
    expect(progressRev).toBe(1);
    expect(player).toMatchObject({ level: 2, experience: 30, gold: 160 });
  });

  it('draws each issued drop at the position of the kill it belongs to', async () => {
    vi.mocked(charactersApi.reportKills).mockResolvedValue(
      response({
        results: [
          { index: 0, accepted: true },
          { index: 1, accepted: true, drop: { drop_id: 'ticket-b', item_template_id: 12, item_name: '마나 물약', item_type: 'consumable' } },
        ],
      }),
    );
    reportKills([kill({ position: [1, 0, 1] }), kill({ instanceId: 2, position: [50, 0, 60] })]);
    await flush();
    const drops = useLootStore.getState().drops;
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ serverDropId: 'ticket-b', itemTemplateId: 12, itemName: '마나 물약' });
    // spawned near the second monster, not the first (tiny random jitter only)
    expect(Math.abs(drops[0].position[0] - 50)).toBeLessThan(1);
    expect(Math.abs(drops[0].position[2] - 60)).toBeLessThan(1);
  });

  it('merges quest progress and applies boss cooldowns with the killed boss\'s name', async () => {
    vi.mocked(charactersApi.reportKills).mockResolvedValue(
      response({
        quests_updated: [{ quest_template_id: 9, status: 'in_progress', progress_count: 3 }],
        boss_cooldowns: [{ boss_key: 'world_boss', available_at: '2099-01-01T00:00:00Z' }],
      }),
    );
    reportKills([kill({ monsterTemplateId: 5, level: 40, name: '태고의 거인' })]);
    await flush();
    expect(charactersApi.reportKills).toHaveBeenCalledWith([{ template_id: 5, level: 40, boss_key: 'world_boss' }]);
    expect(useQuestStore.getState().quests[9]).toMatchObject({ progress_count: 3 });
    expect(useCharacterStore.getState().bossKillNotice).toEqual({ bossName: '태고의 거인', availableAt: '2099-01-01T00:00:00Z' });
    expect(useCharacterStore.getState().activeCharacter?.boss_cooldowns[0].boss_key).toBe('world_boss');
  });

  it('a refused batch (429/400) is not retried; local rewards are taken back via a resync', async () => {
    vi.mocked(charactersApi.reportKills).mockRejectedValue(new ApiError(429, { error: 'rate_limited', reason: 'kill_rate_limited' }));
    vi.mocked(charactersApi.getActiveCharacterProfile).mockResolvedValue({ ...profile, gold: 100, progress_rev: 5 });
    // local prediction ran ahead
    useCombatStore.setState((s) => ({ player: { ...s.player, gold: 5000 } }));
    reportKills([kill()]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(charactersApi.reportKills).toHaveBeenCalledTimes(1);
    expect(charactersApi.getActiveCharacterProfile).toHaveBeenCalledTimes(1);
    expect(useCombatStore.getState().pendingReports).toBe(0);
    expect(useCombatStore.getState().player.gold).toBe(100);
  });

  it('a server error is retried and then succeeds', async () => {
    vi.mocked(charactersApi.reportKills)
      .mockRejectedValueOnce(new ApiError(500, { error: 'internal_error' }))
      .mockResolvedValueOnce(response());
    reportKills([kill()]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(charactersApi.reportKills).toHaveBeenCalledTimes(2);
    expect(useCombatStore.getState().player.level).toBe(2);
  });

  it('gives up after the retries and resyncs', async () => {
    vi.mocked(charactersApi.reportKills).mockRejectedValue(new Error('network down'));
    vi.mocked(charactersApi.getActiveCharacterProfile).mockResolvedValue(profile);
    reportKills([kill()]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(charactersApi.reportKills).toHaveBeenCalledTimes(3); // 1 try + 2 retries
    expect(useCombatStore.getState().pendingReports).toBe(0);
    expect(charactersApi.getActiveCharacterProfile).toHaveBeenCalled();
  });

  it("never sends a kill made by a character the player has since switched away from", async () => {
    vi.mocked(charactersApi.reportKills).mockResolvedValue(response());
    reportKills([kill()]);
    useCharacterStore.setState({ activeCharacter: { ...profile, id: 2 } });
    await flush();
    expect(charactersApi.reportKills).not.toHaveBeenCalled();
    expect(useCombatStore.getState().pendingReports).toBe(0);
  });

  it('does not adopt a snapshot while more kills are queued, only after the last one is confirmed', async () => {
    let resolveFirst!: (r: KillReportResponse) => void;
    vi.mocked(charactersApi.reportKills)
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockResolvedValueOnce(response({ progress: snapshot({ gold: 300, progress_rev: 2 }) }));
    reportKills([kill()]);
    await flush(); // first request now in flight
    reportKills([kill({ instanceId: 2 })]); // a second kill happens while it is out
    resolveFirst(response({ progress: snapshot({ gold: 200, progress_rev: 1 }) }));
    await vi.advanceTimersByTimeAsync(0);
    // first response arrived but a kill is still unconfirmed -> local numbers untouched
    expect(useCombatStore.getState().player.gold).toBe(100);
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(useCombatStore.getState().player.gold).toBe(300);
    expect(useCombatStore.getState().pendingReports).toBe(0);
  });
});
