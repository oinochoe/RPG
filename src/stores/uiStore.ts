import { create } from 'zustand';

export type ShopNpcKind = 'merchant' | 'blacksmith';

interface UIState {
  isMapOpen: boolean;
  isCharacterPanelOpen: boolean;
  isShopOpen: boolean;
  // Which shop NPC's catalog is currently open (null while the panel is closed).
  shopKind: ShopNpcKind | null;
  // Which shop NPC the player is currently standing close enough to talk to (null if
  // none) — set every frame by ShopProximity.tsx, read by CharacterMesh's Space handler.
  nearShopKind: ShopNpcKind | null;
  toggleMap: () => void;
  closeMap: () => void;
  toggleCharacterPanel: () => void;
  closeCharacterPanel: () => void;
  openShop: (kind: ShopNpcKind) => void;
  closeShop: () => void;
  setNearShopKind: (kind: ShopNpcKind | null) => void;
  closeAll: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  isCharacterPanelOpen: false,
  isShopOpen: false,
  shopKind: null,
  nearShopKind: null,
  toggleMap: () => set((s) => ({ isMapOpen: !s.isMapOpen, isCharacterPanelOpen: false, isShopOpen: false })),
  closeMap: () => set({ isMapOpen: false }),
  toggleCharacterPanel: () =>
    set((s) => ({ isCharacterPanelOpen: !s.isCharacterPanelOpen, isMapOpen: false, isShopOpen: false })),
  closeCharacterPanel: () => set({ isCharacterPanelOpen: false }),
  openShop: (kind) => set({ isShopOpen: true, shopKind: kind, isMapOpen: false, isCharacterPanelOpen: false }),
  closeShop: () => set({ isShopOpen: false }),
  setNearShopKind: (kind) => set({ nearShopKind: kind }),
  closeAll: () => set({ isMapOpen: false, isCharacterPanelOpen: false, isShopOpen: false }),
}));
