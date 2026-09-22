import { create } from 'zustand';

export type ShopNpcKind = 'merchant' | 'blacksmith';
type PanelId = 'map' | 'character' | 'inventory' | 'shop' | 'systemMenu' | 'quest';

// The panels that close everything else when opened (they cover most of the screen and
// have no docked position of their own to share space with another panel).
const EXCLUSIVE_PANELS: PanelId[] = ['map', 'shop', 'systemMenu', 'quest'];

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
  isQuestOpen: boolean;
  // Which flavor NPC's quest dialogue is currently open (null while the panel is closed) —
  // an NPC display name (see questStore's findQuestByGiver), same "no numeric NPC id exists
  // anywhere" reasoning as quest_templates.giver_npc_name.
  questNpcName: string | null;
  // Mirrors nearShopKind but for quest-giving flavor NPCs — set every frame by
  // QuestProximity.tsx, read by CharacterMesh's Space handler.
  nearQuestNpcName: string | null;
  // The nearest lootStore world drop's id within pickup range (null if none) — set every
  // frame by LootProximity.tsx, read by CharacterMesh's F4 handler. A plain id rather than a
  // kind/name like the other two, since a drop is a specific instance, not a fixed NPC.
  nearDropId: number | null;
  setNearDropId: (dropId: number | null) => void;
  // Currently-open panels in the order they were opened, most-recent last — lets Escape
  // close just the panel the player opened last (e.g. 캐창+인창 both open -> Escape closes
  // whichever was opened second, not both at once) instead of a single "close everything".
  openPanelStack: PanelId[];
  toggleMap: () => void;
  closeMap: () => void;
  toggleCharacterPanel: () => void;
  closeCharacterPanel: () => void;
  toggleInventory: () => void;
  closeInventory: () => void;
  openShop: (kind: ShopNpcKind) => void;
  closeShop: () => void;
  openQuest: (npcName: string) => void;
  closeQuest: () => void;
  toggleSystemMenu: () => void;
  closeSystemMenu: () => void;
  setNearShopKind: (kind: ShopNpcKind | null) => void;
  setNearQuestNpcName: (npcName: string | null) => void;
  /** Closes the most-recently-opened panel (bound to Escape). No-op if nothing is open. */
  closeTopPanel: () => void;
  /** Closes every panel at once — used when leaving the game screen entirely, not by Escape. */
  closeAll: () => void;
  // Incremented every time something asks CharacterPanel to jump to its 스킬 tab (K key) —
  // a one-shot "request", not persistent state, so CharacterPanel's effect fires even if the
  // player presses K twice in a row while already on that tab. Doesn't affect which tab a
  // normal C-key open/toggle lands on.
  skillTabRequestId: number;
  openSkillTab: () => void;
}

function allPanelsClosedPatch() {
  return {
    isMapOpen: false,
    isCharacterPanelOpen: false,
    isInventoryOpen: false,
    isShopOpen: false,
    isSystemMenuOpen: false,
    isQuestOpen: false,
    openPanelStack: [] as PanelId[],
  };
}

// Pushes `id` to the top of the stack, moving it there if already present rather than
// duplicating — so re-opening (toggle off then on) always makes it the "most recent".
function pushPanel(stack: PanelId[], id: PanelId): PanelId[] {
  return [...stack.filter((p) => p !== id), id];
}

function popPanel(stack: PanelId[], id: PanelId): PanelId[] {
  return stack.filter((p) => p !== id);
}

function closePanelPatch(id: PanelId): Partial<UIState> {
  switch (id) {
    case 'map':
      return { isMapOpen: false };
    case 'character':
      return { isCharacterPanelOpen: false };
    case 'inventory':
      return { isInventoryOpen: false };
    case 'shop':
      return { isShopOpen: false };
    case 'systemMenu':
      return { isSystemMenuOpen: false };
    case 'quest':
      return { isQuestOpen: false };
  }
}

export const useUIStore = create<UIState>((set) => ({
  isMapOpen: false,
  isCharacterPanelOpen: false,
  isInventoryOpen: false,
  isShopOpen: false,
  isSystemMenuOpen: false,
  shopKind: null,
  nearShopKind: null,
  isQuestOpen: false,
  questNpcName: null,
  nearQuestNpcName: null,
  nearDropId: null,
  openPanelStack: [],
  skillTabRequestId: 0,

  toggleMap: () =>
    set((s) => {
      if (s.isMapOpen) return { isMapOpen: false, openPanelStack: popPanel(s.openPanelStack, 'map') };
      return { ...allPanelsClosedPatch(), isMapOpen: true, openPanelStack: ['map'] };
    }),
  closeMap: () => set((s) => ({ isMapOpen: false, openPanelStack: popPanel(s.openPanelStack, 'map') })),

  toggleCharacterPanel: () =>
    set((s) => {
      if (s.isCharacterPanelOpen) {
        return { isCharacterPanelOpen: false, openPanelStack: popPanel(s.openPanelStack, 'character') };
      }
      // Character/inventory are meant to be viewable side by side (캐창 left, 인창 right), so
      // opening one only clears the exclusive panels, not inventory.
      return {
        isMapOpen: false,
        isShopOpen: false,
        isSystemMenuOpen: false,
        isCharacterPanelOpen: true,
        openPanelStack: pushPanel(
          s.openPanelStack.filter((p) => !EXCLUSIVE_PANELS.includes(p)),
          'character',
        ),
      };
    }),
  closeCharacterPanel: () =>
    set((s) => ({ isCharacterPanelOpen: false, openPanelStack: popPanel(s.openPanelStack, 'character') })),

  toggleInventory: () =>
    set((s) => {
      if (s.isInventoryOpen) {
        return { isInventoryOpen: false, openPanelStack: popPanel(s.openPanelStack, 'inventory') };
      }
      return {
        isMapOpen: false,
        isShopOpen: false,
        isSystemMenuOpen: false,
        isInventoryOpen: true,
        openPanelStack: pushPanel(
          s.openPanelStack.filter((p) => !EXCLUSIVE_PANELS.includes(p)),
          'inventory',
        ),
      };
    }),
  closeInventory: () =>
    set((s) => ({ isInventoryOpen: false, openPanelStack: popPanel(s.openPanelStack, 'inventory') })),

  openShop: (kind) => set({ ...allPanelsClosedPatch(), isShopOpen: true, shopKind: kind, openPanelStack: ['shop'] }),
  closeShop: () => set((s) => ({ isShopOpen: false, openPanelStack: popPanel(s.openPanelStack, 'shop') })),

  openQuest: (npcName) =>
    set({ ...allPanelsClosedPatch(), isQuestOpen: true, questNpcName: npcName, openPanelStack: ['quest'] }),
  closeQuest: () => set((s) => ({ isQuestOpen: false, openPanelStack: popPanel(s.openPanelStack, 'quest') })),

  toggleSystemMenu: () =>
    set((s) => {
      if (s.isSystemMenuOpen) {
        return { isSystemMenuOpen: false, openPanelStack: popPanel(s.openPanelStack, 'systemMenu') };
      }
      return { ...allPanelsClosedPatch(), isSystemMenuOpen: true, openPanelStack: ['systemMenu'] };
    }),
  closeSystemMenu: () =>
    set((s) => ({ isSystemMenuOpen: false, openPanelStack: popPanel(s.openPanelStack, 'systemMenu') })),

  setNearShopKind: (kind) => set({ nearShopKind: kind }),
  setNearQuestNpcName: (npcName) => set({ nearQuestNpcName: npcName }),
  setNearDropId: (dropId) => set({ nearDropId: dropId }),

  closeTopPanel: () =>
    set((s) => {
      const top = s.openPanelStack[s.openPanelStack.length - 1];
      if (!top) return {};
      return { ...closePanelPatch(top), openPanelStack: s.openPanelStack.slice(0, -1) };
    }),

  closeAll: () => set(allPanelsClosedPatch()),

  openSkillTab: () =>
    set((s) => ({
      isMapOpen: false,
      isShopOpen: false,
      isSystemMenuOpen: false,
      isCharacterPanelOpen: true,
      openPanelStack: pushPanel(
        s.openPanelStack.filter((p) => !EXCLUSIVE_PANELS.includes(p)),
        'character',
      ),
      skillTabRequestId: s.skillTabRequestId + 1,
    })),
}));
