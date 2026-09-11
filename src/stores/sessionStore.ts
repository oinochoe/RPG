import { create } from 'zustand';
import * as mapsApi from '../api/maps';
import type { EnterMapResponse } from '../types/api';

interface SessionState {
  currentMap: EnterMapResponse | null;
  enterMap: (mapId: number) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  currentMap: null,
  enterMap: async (mapId) => {
    const result = await mapsApi.enterMap(mapId);
    set({ currentMap: result });
  },
}));
