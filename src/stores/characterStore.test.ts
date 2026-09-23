import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  listCharacters: vi.fn(),
  createCharacter: vi.fn(),
  selectCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  getActiveCharacterProfile: vi.fn(),
}));

import * as charactersApi from '../api/characters';
import { useCharacterStore } from './characterStore';
import type { CharacterProfile, CharacterSummary } from '../types/api';

const summary: CharacterSummary = {
  id: 1,
  name: 'Valerius',
  character_class: 'warrior',
  level: 1,
  current_hp: 100,
  max_hp: 100,
  current_map_id: 1,
};

const profile: CharacterProfile = {
  id: 1,
  user_id: 42,
  name: 'Valerius',
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
  skill_points: 0,
  skill_upgrade_points: 0,
  stat_str: 5,
  stat_dex: 5,
  stat_con: 5,
  stat_int: 5,
  stat_wis: 5,
  skills: [],
  active_quests: [],
  boss_cooldowns: [],
  current_map_id: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  created_at: '2026-09-11T00:00:00Z',
  equipped_items: [],
  inventory: [],
};

describe('characterStore', () => {
  beforeEach(() => {
    useCharacterStore.setState({ characters: [], activeCharacter: null, isLoading: false });
    vi.clearAllMocks();
  });

  it('fetchCharacters stores the items array from the paginated envelope', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue({
      items: [summary],
      page: 1,
      page_size: 20,
      total: 1,
    });

    await useCharacterStore.getState().fetchCharacters();

    expect(useCharacterStore.getState().characters).toEqual([summary]);
    expect(useCharacterStore.getState().isLoading).toBe(false);
  });

  it('createCharacter calls the API then refreshes the list', async () => {
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(summary);
    vi.mocked(charactersApi.listCharacters).mockResolvedValue({
      items: [summary],
      page: 1,
      page_size: 20,
      total: 1,
    });

    await useCharacterStore.getState().createCharacter('Valerius', 'warrior');

    expect(charactersApi.createCharacter).toHaveBeenCalledWith('Valerius', 'warrior');
    expect(useCharacterStore.getState().characters).toEqual([summary]);
  });

  it('selectCharacter calls select then loads the active profile', async () => {
    vi.mocked(charactersApi.selectCharacter).mockResolvedValue(undefined);
    vi.mocked(charactersApi.getActiveCharacterProfile).mockResolvedValue(profile);

    await useCharacterStore.getState().selectCharacter(1);

    expect(charactersApi.selectCharacter).toHaveBeenCalledWith(1);
    expect(useCharacterStore.getState().activeCharacter).toEqual(profile);
  });

  it('deleteCharacter calls the API then refreshes the list', async () => {
    vi.mocked(charactersApi.deleteCharacter).mockResolvedValue(undefined);
    vi.mocked(charactersApi.listCharacters).mockResolvedValue({
      items: [],
      page: 1,
      page_size: 20,
      total: 0,
    });

    await useCharacterStore.getState().deleteCharacter(1);

    expect(charactersApi.deleteCharacter).toHaveBeenCalledWith(1);
    expect(useCharacterStore.getState().characters).toEqual([]);
  });
});
