import { create } from 'zustand';
import { configureApiClient } from '../api/client';
import * as authApi from '../api/auth';
import { updateCharacterPosition } from '../api/characters';
import { useSessionStore } from './sessionStore';
import { playerPosition } from '../components/game/playerTransform';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  email: string;
}

const STORAGE_KEY = 'rpg.auth.tokens';

function loadStoredTokens(): StoredTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function persistTokens(tokens: StoredTokens | null): void {
  if (tokens) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  email: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const tokens = await authApi.login(email, password);
    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      email,
      isAuthenticated: true,
    });
    persistTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, email });
  },

  logout: async () => {
    const { refreshToken } = get();
    // Best-effort position save before the token is revoked below — covers the common
    // explicit-logout path without waiting for PositionSync's next periodic tick. Only
    // meaningful if a game session was actually entered (currentMap set); skip otherwise
    // (e.g. logging out from the character-select screen before ever loading the world).
    const currentMap = useSessionStore.getState().currentMap;
    if (currentMap) {
      try {
        await updateCharacterPosition({
          position_x: Math.round(playerPosition.x),
          position_y: Math.round(playerPosition.y),
          position_z: Math.round(playerPosition.z),
          current_map_id: currentMap.map_id,
        });
      } catch {
        // best-effort; don't block logout on this
      }
    }
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // best-effort revoke; always clear local session below
      }
    }
    set({ accessToken: null, refreshToken: null, email: null, isAuthenticated: false });
    persistTokens(null);
  },

  restoreSession: () => {
    const stored = loadStoredTokens();
    if (stored) {
      set({
        accessToken: stored.accessToken,
        refreshToken: stored.refreshToken,
        email: stored.email,
        isAuthenticated: true,
      });
    }
  },
}));

configureApiClient({
  getTokens: () => {
    const { accessToken, refreshToken } = useAuthStore.getState();
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  },
  setTokens: ({ accessToken, refreshToken }) => {
    useAuthStore.setState({ accessToken, refreshToken });
    const { email } = useAuthStore.getState();
    if (email) persistTokens({ accessToken, refreshToken, email });
  },
  onAuthFailure: () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, email: null, isAuthenticated: false });
    persistTokens(null);
  },
});
