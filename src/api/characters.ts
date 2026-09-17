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
  // BackendX (FR-032): POST /characters/position, not our old PATCH /characters/me/position.
  return apiRequest('/characters/position', { method: 'POST', body: position });
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
}

export function syncProgress(progress: CharacterProgressUpdate): Promise<void> {
  // BackendX (FR-031): POST /characters/progress, not our old PATCH /characters/me/progress.
  return apiRequest('/characters/progress', { method: 'POST', body: progress });
}

export function getInventory(): Promise<InventoryListResponse> {
  return apiRequest('/characters/me/inventory');
}

type BackendXInventoryAction = 'equip' | 'unequip' | 'use';

// BackendX (FR-016): a single POST /inventory/action, not our old 3 separate per-action
// routes. Its response is a per-action result summary (action, inventory_item_id,
// is_equipped, equipped_slot, attack_power, defense_power, remaining_quantity), not the
// full inventory — so we refetch afterward to keep returning the InventoryListResponse
// shape every caller (characterStore.ts) already expects. That keeps this adaptation
// confined entirely to this file.
async function performInventoryAction(
  inventoryId: number,
  action: BackendXInventoryAction,
): Promise<InventoryListResponse> {
  await apiRequest('/inventory/action', {
    method: 'POST',
    body: { inventory_item_id: inventoryId, action },
  });
  return getInventory();
}

export function equipItem(inventoryId: number): Promise<InventoryListResponse> {
  return performInventoryAction(inventoryId, 'equip');
}

export function unequipItem(inventoryId: number): Promise<InventoryListResponse> {
  return performInventoryAction(inventoryId, 'unequip');
}

export function useItem(inventoryId: number): Promise<InventoryListResponse> {
  return performInventoryAction(inventoryId, 'use');
}

// BackendX's ShopCatalogItem shape (FR-033) — item_template_id instead of id, and their
// documented model doesn't list equip_slot/heal_hp at all (unconfirmed whether the live
// response actually omits them or the doc summary just didn't mention them).
interface BackendXShopCatalogItem {
  item_template_id: number;
  name: string;
  item_type: string;
  required_level: number;
  required_class: string | null;
  attack_bonus: number;
  defense_bonus: number;
  buy_price: number;
  sell_price: number;
  equip_slot?: string | null;
  heal_hp?: number;
}

export async function getShop(kind: 'merchant' | 'blacksmith'): Promise<ShopListResponse> {
  // BackendX (FR-033): GET /shops/catalog?category=, not our old ?kind= param — normalize
  // the response back into our ShopItem shape so ShopPanel.tsx needs no changes.
  const { items } = await apiRequest<{ items: BackendXShopCatalogItem[] }>(
    `/shops/catalog?category=${kind}`,
  );
  return {
    items: items.map((item) => ({
      id: item.item_template_id,
      name: item.name,
      item_type: item.item_type,
      equip_slot: item.equip_slot ?? null,
      required_level: item.required_level,
      required_class: item.required_class,
      attack_bonus: item.attack_bonus,
      defense_bonus: item.defense_bonus,
      buy_price: item.buy_price,
      sell_price: item.sell_price,
      heal_hp: item.heal_hp ?? 0,
    })),
  };
}

// NOT YET ADAPTED — still calling the old Supabase-shaped routes. BackendX's
// POST /shops/transaction needs an `npc_id` we don't have a source for yet (our client
// only tracks a merchant/blacksmith *category*, not individual NPC entities/IDs — see
// ShopProximity.tsx/Village.tsx's SHOP_NPCS, which never assigns numeric ids). Ask
// BackendX where npc_id comes from (e.g. is it in each ShopCatalogItem row, or a
// separate NPC-listing endpoint?) before wiring these two up.
export function buyItem(itemTemplateId: number): Promise<InventoryListResponse> {
  return apiRequest('/characters/me/inventory/buy', {
    method: 'POST',
    body: { item_template_id: itemTemplateId },
  });
}

export function sellItem(inventoryId: number): Promise<InventoryListResponse> {
  return apiRequest(`/characters/me/inventory/${inventoryId}/sell`, { method: 'POST' });
}
