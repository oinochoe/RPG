import { apiRequest } from './client';
import type {
  ActiveQuest,
  CharacterClass,
  CharacterProfile,
  CharacterSummary,
  ClaimDiscoveryResponse,
  EnchantItemResponse,
  InventoryListResponse,
  KillReport,
  KillReportResponse,
  PaginatedResponse,
  ProgressSnapshot,
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

export function selectCharacter(characterId: number): Promise<{ game_session_id: string | null }> {
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

export function updateCharacterPosition(
  position: CharacterPositionUpdate,
  options?: { keepalive?: boolean },
): Promise<void> {
  return apiRequest('/characters/me/position', { method: 'PATCH', body: position, keepalive: options?.keepalive });
}

/**
 * The only progress the client still writes: current HP/MP (the server clamps to its own maxima).
 * Level, exp, gold, stats and the derived attack/HP/MP maxima are server-owned — they change through
 * reportKills, quest claims, shop calls and allocateStat (see the design doc).
 */
export interface CharacterVitalsUpdate {
  current_hp: number;
  current_mp: number;
}

export function syncProgress(vitals: CharacterVitalsUpdate): Promise<void> {
  return apiRequest('/characters/me/progress', { method: 'PATCH', body: vitals });
}

/** Reports monsters the client killed; the server validates and returns the authoritative result. */
export function reportKills(kills: KillReport[]): Promise<KillReportResponse> {
  return apiRequest('/characters/me/kills', { method: 'POST', body: { kills } });
}

export function allocateStatOnServer(stat: 'str' | 'dex' | 'con' | 'int' | 'wis'): Promise<{ progress: ProgressSnapshot }> {
  return apiRequest('/characters/me/stats/allocate', { method: 'POST', body: { stat } });
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

export function sellItem(inventoryId: number, quantity = 1): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/sell`, {
    method: 'POST',
    body: { quantity },
  });
}

export function useItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/use`, { method: 'POST' });
}

export function enchantItem(inventoryId: number, scrollInventoryId: number): Promise<EnchantItemResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/enchant`, {
    method: 'POST',
    body: { scroll_inventory_id: scrollInventoryId },
  });
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

export interface ClaimQuestResponse {
  reward_xp: number;
  reward_gold: number;
  reward_item_id: number | null;
  inventory: InventoryListResponse['items'];
  progress: ProgressSnapshot;
}

export function claimQuest(questTemplateId: number): Promise<ClaimQuestResponse> {
  return apiRequest(`/characters/me/quests/${questTemplateId}/claim`, { method: 'POST' });
}

export function listClaimedDiscoveries(): Promise<{ claimed: string[] }> {
  return apiRequest('/characters/me/discoveries');
}

/** Read-only: claimed discovery ids of one of the caller's own characters (works without a game session). */
export function listClaimedDiscoveriesFor(characterId: number): Promise<{ claimed: string[] }> {
  return apiRequest(`/characters/${characterId}/discoveries`);
}

export function claimDiscovery(id: string): Promise<ClaimDiscoveryResponse> {
  return apiRequest(`/characters/me/discoveries/${encodeURIComponent(id)}/claim`, { method: 'POST' });
}

/** Picks up a world drop by the ticket the server issued when it rolled that drop. */
export function lootItem(dropId: string): Promise<InventoryListResponse> {
  return apiRequest('/characters/me/inventory/loot', {
    method: 'POST',
    body: { drop_id: dropId },
  });
}
