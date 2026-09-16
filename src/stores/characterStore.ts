import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import { useCombatStore } from './combatStore';
import type { CharacterClass, CharacterProfile, CharacterSummary, InventorySlot } from '../types/api';

function sumEquippedBonus(items: InventorySlot[]): { attack: number; defense: number } {
  let attack = 0;
  let defense = 0;
  for (const item of items) {
    if (!item.is_equipped) continue;
    attack += item.attack_bonus;
    defense += item.defense_bonus;
  }
  return { attack, defense };
}

interface CharacterState {
  characters: CharacterSummary[];
  activeCharacter: CharacterProfile | null;
  inventory: InventorySlot[];
  isLoading: boolean;
  fetchCharacters: () => Promise<void>;
  createCharacter: (name: string, characterClass: CharacterClass) => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
  fetchInventory: () => Promise<void>;
  equipItem: (inventoryId: number) => Promise<void>;
  unequipItem: (inventoryId: number) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  activeCharacter: null,
  inventory: [],
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
    set({ activeCharacter: profile, inventory: profile.inventory });
  },

  deleteCharacter: async (characterId) => {
    await charactersApi.deleteCharacter(characterId);
    await get().fetchCharacters();
  },

  fetchInventory: async () => {
    const { items } = await charactersApi.getInventory();
    set({ inventory: items });
  },

  equipItem: async (inventoryId) => {
    const before = sumEquippedBonus(get().inventory);
    const { items } = await charactersApi.equipItem(inventoryId);
    const after = sumEquippedBonus(items);
    set({ inventory: items });
    useCombatStore.getState().applyEquipmentDelta(after.attack - before.attack, after.defense - before.defense);
  },

  unequipItem: async (inventoryId) => {
    const before = sumEquippedBonus(get().inventory);
    const { items } = await charactersApi.unequipItem(inventoryId);
    const after = sumEquippedBonus(items);
    set({ inventory: items });
    useCombatStore.getState().applyEquipmentDelta(after.attack - before.attack, after.defense - before.defense);
  },
}));
