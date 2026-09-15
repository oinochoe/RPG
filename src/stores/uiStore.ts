import { create } from 'zustand';

interface UIState {
  isMapOpen: boolean;
  toggleMap: () => void;
  closeMap: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  toggleMap: () => set((s) => ({ isMapOpen: !s.isMapOpen })),
  closeMap: () => set({ isMapOpen: false }),
}));
