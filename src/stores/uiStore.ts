import { create } from 'zustand';

export type ShopNpcKind = 'merchant' | 'blacksmith';

interface UIState {
  isMapOpen: boolean;
  isCharacterPanelOpen: boolean;
  isInventoryOpen: boolean;
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
  toggleInventory: () => void;
  closeInventory: () => void;
  openShop: (kind: ShopNpcKind) => void;
  closeShop: () => void;
  toggleSystemMenu: () => void;
  closeSystemMenu: () => void;
  setNearShopKind: (kind: ShopNpcKind | null) => void;
  closeAll: () => void;
}

// Full set of panel states — used by closeAll() and by the "movement/hotbar/attack should
// be suspended" guards elsewhere (any of these open means gameplay input is paused).
function allPanelsClosed() {
  return {
    isMapOpen: false,
    isCharacterPanelOpen: false,
    isInventoryOpen: false,
    isShopOpen: false,
    isSystemMenuOpen: false,
  };
}

// Character (C) and inventory (I) are meant to be viewable side by side — 캐창 left, 인창
// right — so opening one must NOT close the other. Map/shop/system-menu are still each
// exclusive against everything (including character+inventory), since those cover most of
// the screen and don't have a docked position of their own.
function closeExclusivePanels() {
  return { isMapOpen: false, isShopOpen: false, isSystemMenuOpen: false };
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  isCharacterPanelOpen: false,
  isInventoryOpen: false,
  isShopOpen: false,
  isSystemMenuOpen: false,
  shopKind: null,
  nearShopKind: null,
  toggleMap: () => set((s) => ({ ...allPanelsClosed(), isMapOpen: !s.isMapOpen })),
  closeMap: () => set({ isMapOpen: false }),
  toggleCharacterPanel: () =>
    set((s) => ({ ...closeExclusivePanels(), isCharacterPanelOpen: !s.isCharacterPanelOpen })),
  closeCharacterPanel: () => set({ isCharacterPanelOpen: false }),
  toggleInventory: () => set((s) => ({ ...closeExclusivePanels(), isInventoryOpen: !s.isInventoryOpen })),
  closeInventory: () => set({ isInventoryOpen: false }),
  openShop: (kind) => set({ ...allPanelsClosed(), isShopOpen: true, shopKind: kind }),
  closeShop: () => set({ isShopOpen: false }),
  toggleSystemMenu: () => set((s) => ({ ...allPanelsClosed(), isSystemMenuOpen: !s.isSystemMenuOpen })),
  closeSystemMenu: () => set({ isSystemMenuOpen: false }),
  setNearShopKind: (kind) => set({ nearShopKind: kind }),
  closeAll: () => set(allPanelsClosed()),
}));
