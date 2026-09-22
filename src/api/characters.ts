import { apiRequest } from './client';
import type {
  ActiveQuest,
  CharacterClass,
  CharacterProfile,
  CharacterSummary,
  InventoryListResponse,
  PaginatedResponse,
  ShopListResponse,
} from '../types/api';

export function listCharacters(
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<CharacterSummary>> {
  return apiRequest(`/characters?page=${page}&page_size=${pageSize}`);
}

export function createCharacter(
  name: string,
  characterClass: CharacterClass,
): Promise<CharacterSummary> {
  return apiRequest('/characters', {
    method: 'POST',
    body: { name, character_class: characterClass },
  });
}

export function selectCharacter(characterId: number): Promise<void> {
  return apiRequest(`/characters/${characterId}/select`, { method: 'POST' });
}

export function deleteCharacter(characterId: number): Promise<void> {
  return apiRequest(`/characters/${characterId}`, { method: 'DELETE' });
}

export function getActiveCharacterProfile(): Promise<CharacterProfile> {
  return apiRequest('/characters/me');
}

export interface CharacterPositionUpdate {
  position_x: number;
  position_y: number;
  position_z: number;
  current_map_id?: number;
}

export function updateCharacterPosition(position: CharacterPositionUpdate): Promise<void> {
  return apiRequest('/characters/me/position', { method: 'PATCH', body: position });
}

export interface CharacterProgressUpdate {
  level: number;
  experience: number;
  skill_points: number;
  attack_power: number;
  defense_power: number;
  max_hp: number;
  current_hp: number;
  max_mp: number;
  current_mp: number;
  stat_str: number;
  stat_dex: number;
  stat_con: number;
  stat_int: number;
  stat_wis: number;
  gold: number;
  skill_upgrade_points: number;
}

export function syncProgress(progress: CharacterProgressUpdate): Promise<void> {
  return apiRequest('/characters/me/progress', { method: 'PATCH', body: progress });
}

export function getInventory(): Promise<InventoryListResponse> {
  return apiRequest('/characters/me/inventory');
}

export function equipItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/equip`, { method: 'POST' });
}

export function unequipItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/unequip`, { method: 'POST' });
}

export function getShop(kind: 'merchant' | 'blacksmith'): Promise<ShopListResponse> {
  return apiRequest(`/characters/me/shop?kind=${kind}`);
}

export function buyItem(itemTemplateId: number, quantity = 1): Promise<InventoryListResponse> {
  return apiRequest('/characters/me/inventory/buy', {
    method: 'POST',
    body: { item_template_id: itemTemplateId, quantity },
  });
}

export function sellItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/sell`, { method: 'POST' });
}

export function useItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/use`, { method: 'POST' });
}

export function upgradeSkill(skillTemplateId: number): Promise<{ skill_level: number; skill_upgrade_points: number }> {
  return apiRequest('/characters/me/skills/upgrade', {
    method: 'POST',
    body: { skill_template_id: skillTemplateId },
  });
}

export function acceptQuest(questTemplateId: number): Promise<ActiveQuest> {
  return apiRequest(`/characters/me/quests/${questTemplateId}/accept`, { method: 'POST' });
}

export function reportQuestKill(monsterTemplateId: number): Promise<{ updated: ActiveQuest[] }> {
  return apiRequest('/characters/me/quests/progress', {
    method: 'POST',
    body: { monster_template_id: monsterTemplateId },
  });
}

export interface ClaimQuestResponse {
  reward_xp: number;
  reward_gold: number;
  reward_item_id: number | null;
  inventory: InventoryListResponse['items'];
}

export function claimQuest(questTemplateId: number): Promise<ClaimQuestResponse> {
  return apiRequest(`/characters/me/quests/${questTemplateId}/claim`, { method: 'POST' });
}
