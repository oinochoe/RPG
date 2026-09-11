import { apiRequest } from './client';
import type { EnterMapResponse } from '../types/api';

export function enterMap(mapId: number): Promise<EnterMapResponse> {
  return apiRequest('/exploration/enter-map', {
    method: 'POST',
    body: { map_id: mapId },
  });
}
