import { create } from 'zustand';

// The id the server issued when this tab selected its character. Kept per tab (sessionStorage survives a
// reload but is not shared with other tabs), so each tab is its own game session and a newer one replaces it.
const STORAGE_KEY = 'rpg.game-session';

function read(): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage blocked: the in-memory value still works for this page load.
  }
}

interface GameSessionState {
  sessionId: string | null;
  /** True once the server told us another session replaced this one. */
  replaced: boolean;
  setSessionId: (id: string | null) => void;
  markReplaced: () => void;
  reset: () => void;
}

export const useGameSessionStore = create<GameSessionState>((set) => ({
  sessionId: read(),
  replaced: false,
  setSessionId: (id) => {
    write(id);
    // A fresh selection also clears a previous "replaced" state.
    set({ sessionId: id, replaced: false });
  },
  markReplaced: () => set({ replaced: true }),
  reset: () => {
    write(null);
    set({ sessionId: null, replaced: false });
  },
}));
