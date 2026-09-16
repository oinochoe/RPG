import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import { useCombatStore } from './combatStore';
import type { CharacterClass, CharacterProfile, CharacterSummary, InventorySlot, ShopItem } from '../types/api';

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
  shop: ShopItem[];
  isLoading: boolean;
  fetchCharacters: () => Promise<void>;
  createCharacter: (name: string, characterClass: CharacterClass) => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
  fetchInventory: () => Promise<void>;
  equipItem: (inventoryId: number) => Promise<void>;
  unequipItem: (inventoryId: number) => Promise<void>;
  fetchShop: () => Promise<void>;
  buyItem: (itemTemplateId: number, price: number) => Promise<void>;
  sellItem: (inventoryId: number, price: number) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  activeCharacter: null,
  inventory: [],
  shop: [],
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

  fetchShop: async () => {
    const { items } = await charactersApi.getShop();
    set({ shop: items });
  },

  // price is passed in by the caller (already known from the ShopItem/InventorySlot the
  // button was rendered from) rather than looked up here — the server doesn't touch gold
  // at all (see characters.ts's shop routes), so this is purely a local wallet update.
  buyItem: async (itemTemplateId, price) => {
    const { items } = await charactersApi.buyItem(itemTemplateId);
    set({ inventory: items });
    useCombatStore.getState().adjustGold(-price);
  },

  sellItem: async (inventoryId, price) => {
    const before = sumEquippedBonus(get().inventory);
    const { items } = await charactersApi.sellItem(inventoryId);
    const after = sumEquippedBonus(items);
    set({ inventory: items });
    useCombatStore.getState().applyEquipmentDelta(after.attack - before.attack, after.defense - before.defense);
    useCombatStore.getState().adjustGold(price);
  },
}));
