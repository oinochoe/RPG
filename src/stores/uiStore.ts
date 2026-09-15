import { create } from 'zustand';

interface UIState {
  isMapOpen: boolean;
  isCharacterPanelOpen: boolean;
  toggleMap: () => void;
  closeMap: () => void;
  toggleCharacterPanel: () => void;
  closeCharacterPanel: () => void;
  closeAll: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  isCharacterPanelOpen: false,
  toggleMap: () => set((s) => ({ isMapOpen: !s.isMapOpen, isCharacterPanelOpen: false })),
  closeMap: () => set({ isMapOpen: false }),
  toggleCharacterPanel: () => set((s) => ({ isCharacterPanelOpen: !s.isCharacterPanelOpen, isMapOpen: false })),
  closeCharacterPanel: () => set({ isCharacterPanelOpen: false }),
  closeAll: () => set({ isMapOpen: false, isCharacterPanelOpen: false }),
}));
