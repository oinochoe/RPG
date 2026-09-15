import { apiRequest } from './client';
import type {
  CharacterClass,
  CharacterProfile,
  CharacterSummary,
  PaginatedResponse,
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
