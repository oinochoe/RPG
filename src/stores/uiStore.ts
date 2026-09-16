import { create } from 'zustand';

export type ShopNpcKind = 'merchant' | 'blacksmith';

interface UIState {
  isMapOpen: boolean;
  isCharacterPanelOpen: boolean;
  isShopOpen: boolean;
  // F1 menu — keybind list + 캐릭터 선택/로그아웃, replacing the old always-on corner box.
  isSystemMenuOpen: boolean;
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
  toggleSystemMenu: () => void;
  closeSystemMenu: () => void;
  setNearShopKind: (kind: ShopNpcKind | null) => void;
  closeAll: () => void;
}

// Any of the mutually-exclusive full-panel UI states — used to close the others whenever
// one opens, and as the "movement/hotbar/attack should be suspended" guard elsewhere.
function closeOtherPanels() {
  return { isMapOpen: false, isCharacterPanelOpen: false, isShopOpen: false, isSystemMenuOpen: false };
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  isCharacterPanelOpen: false,
  isShopOpen: false,
  isSystemMenuOpen: false,
  shopKind: null,
  nearShopKind: null,
  toggleMap: () => set((s) => ({ ...closeOtherPanels(), isMapOpen: !s.isMapOpen })),
  closeMap: () => set({ isMapOpen: false }),
  toggleCharacterPanel: () => set((s) => ({ ...closeOtherPanels(), isCharacterPanelOpen: !s.isCharacterPanelOpen })),
  closeCharacterPanel: () => set({ isCharacterPanelOpen: false }),
  openShop: (kind) => set({ ...closeOtherPanels(), isShopOpen: true, shopKind: kind }),
  closeShop: () => set({ isShopOpen: false }),
  toggleSystemMenu: () => set((s) => ({ ...closeOtherPanels(), isSystemMenuOpen: !s.isSystemMenuOpen })),
  closeSystemMenu: () => set({ isSystemMenuOpen: false }),
  setNearShopKind: (kind) => set({ nearShopKind: kind }),
  closeAll: () => set(closeOtherPanels()),
}));
