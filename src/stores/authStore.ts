import { create } from 'zustand';
import { configureApiClient } from '../api/client';
import * as authApi from '../api/auth';

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
