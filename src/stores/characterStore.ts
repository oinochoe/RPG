import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import type { CharacterClass, CharacterProfile, CharacterSummary } from '../types/api';

interface CharacterState {
  characters: CharacterSummary[];
  activeCharacter: CharacterProfile | null;
  isLoading: boolean;
  fetchCharacters: () => Promise<void>;
  createCharacter: (name: string, characterClass: CharacterClass) => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  activeCharacter: null,
  isLoading: false,

  fetchCharacters: async () => {
    set({ isLoading: true });
    const page = await charactersApi.listCharacters();
    set({ characters: page.items, isLoading: false });
  },

  createCharacter: async (name, characterClass) => {
    await charactersApi.createCharacter(name, characterClass);
    await get().fetchCharacters();
  },

  selectCharacter: async (characterId) => {
    await charactersApi.selectCharacter(characterId);
    const profile = await charactersApi.getActiveCharacterProfile();
    set({ activeCharacter: profile });
  },

  deleteCharacter: async (characterId) => {
    await charactersApi.deleteCharacter(characterId);
    await get().fetchCharacters();
  },
}));
