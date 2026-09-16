import { create } from 'zustand';

interface UIState {
  isMapOpen: boolean;
  isCharacterPanelOpen: boolean;
  isShopOpen: boolean;
  // Whether the player is currently standing close enough to a shop NPC to open the shop
  // with E — set every frame by ShopProximity.tsx, read by GamePage's keydown handler.
  isNearShop: boolean;
  toggleMap: () => void;
  closeMap: () => void;
  toggleCharacterPanel: () => void;
  closeCharacterPanel: () => void;
  openShop: () => void;
  closeShop: () => void;
  setNearShop: (near: boolean) => void;
  closeAll: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  isCharacterPanelOpen: false,
  isShopOpen: false,
  isNearShop: false,
  toggleMap: () => set((s) => ({ isMapOpen: !s.isMapOpen, isCharacterPanelOpen: false, isShopOpen: false })),
  closeMap: () => set({ isMapOpen: false }),
  toggleCharacterPanel: () =>
    set((s) => ({ isCharacterPanelOpen: !s.isCharacterPanelOpen, isMapOpen: false, isShopOpen: false })),
  closeCharacterPanel: () => set({ isCharacterPanelOpen: false }),
  openShop: () => set({ isShopOpen: true, isMapOpen: false, isCharacterPanelOpen: false }),
  closeShop: () => set({ isShopOpen: false }),
  setNearShop: (near) => set({ isNearShop: near }),
  closeAll: () => set({ isMapOpen: false, isCharacterPanelOpen: false, isShopOpen: false }),
}));
