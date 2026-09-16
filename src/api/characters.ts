import { apiRequest } from './client';
import type {
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

export function buyItem(itemTemplateId: number): Promise<InventoryListResponse> {
  return apiRequest('/characters/me/inventory/buy', {
    method: 'POST',
    body: { item_template_id: itemTemplateId },
  });
}

export function sellItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/sell`, { method: 'POST' });
}
