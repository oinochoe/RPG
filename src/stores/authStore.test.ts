import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  logout: vi.fn(),
}));

import * as authApi from '../api/auth';
import { useAuthStore } from './authStore';

const STORAGE_KEY = 'rpg.auth.tokens';

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      email: null,
      isAuthenticated: false,
    });
    vi.clearAllMocks();
  });

  it('login stores tokens, marks authenticated, and persists to localStorage', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
    });

    await useAuthStore.getState().login('player@example.com', 'Passw0rd!');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('access-1');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      email: 'player@example.com',
    });
  });

  it('logout clears state and localStorage even if the API call fails', async () => {
    useAuthStore.setState({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      email: 'player@example.com',
      isAuthenticated: true,
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1', email: 'player@example.com' }),
    );
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network error'));

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restoreSession loads persisted tokens on startup', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: 'access-9', refreshToken: 'refresh-9', email: 'saved@example.com' }),
    );

    useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('access-9');
    expect(state.email).toBe('saved@example.com');
  });
});
