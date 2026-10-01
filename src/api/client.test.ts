import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, configureApiClient } from './client';
import { ApiError } from '../types/api';

describe('apiRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    configureApiClient({
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens: vi.fn(),
      onAuthFailure: vi.fn(),
    });
  });

  it('attaches the bearer token and returns parsed JSON on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<{ ok: boolean }>('/characters/me');

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer access-1');
  });

  it('throws an ApiError with the parsed error envelope on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'not_found',
          reason: 'character_not_found',
          message: 'Character not found.',
        }),
        { status: 404 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/characters/999')).rejects.toMatchObject({
      status: 404,
      error: 'not_found',
      reason: 'character_not_found',
    });
  });

  it('refreshes the token once on 401 and retries the original request', async () => {
    const fetchMock = vi
      .fn()
      // original request -> 401
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }),
      )
      // refresh request -> 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access-2', refresh_token: 'refresh-2' }),
          { status: 200 },
        ),
      )
      // retried original request -> 200
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const setTokens = vi.fn();
    configureApiClient({
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens,
      onAuthFailure: vi.fn(),
    });

    const result = await apiRequest<{ ok: boolean }>('/characters/me');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(setTokens).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('calls onAuthFailure when refresh also fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const onAuthFailure = vi.fn();
    configureApiClient({
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens: vi.fn(),
      onAuthFailure,
    });

    await expect(apiRequest('/characters/me')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFailure).toHaveBeenCalled();
  });

  it('returns undefined for a 204 No Content response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<void>('/auth/logout', { method: 'POST' });

    expect(result).toBeUndefined();
  });

  it('sends x-game-session when the getter returns an id, and omits it otherwise', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const base = {
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens: vi.fn(),
      onAuthFailure: vi.fn(),
    };
    configureApiClient({ ...base, getGameSession: () => 'sess-1' });
    await apiRequest('/characters/me');
    expect(fetchMock.mock.calls[0][1].headers['x-game-session']).toBe('sess-1');

    configureApiClient({ ...base, getGameSession: () => null });
    await apiRequest('/characters/me');
    expect(fetchMock.mock.calls[1][1].headers['x-game-session']).toBeUndefined();
  });

  it('calls onSessionReplaced on 409 session_replaced without refreshing or retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'conflict', reason: 'session_replaced' }), { status: 409 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onSessionReplaced = vi.fn();
    configureApiClient({
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens: vi.fn(),
      onAuthFailure: vi.fn(),
      getGameSession: () => 'sess-1',
      onSessionReplaced,
    });

    await expect(apiRequest('/characters/me')).rejects.toMatchObject({ status: 409 });
    expect(onSessionReplaced).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call onSessionReplaced for a 409 with another reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'conflict', reason: 'other' }), { status: 409 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onSessionReplaced = vi.fn();
    configureApiClient({
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens: vi.fn(),
      onAuthFailure: vi.fn(),
      getGameSession: () => 'sess-1',
      onSessionReplaced,
    });

    await expect(apiRequest('/characters/me')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionReplaced).not.toHaveBeenCalled();
  });

  describe('session_replaced handling', () => {
    const base = {
      getTokens: () => ({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      setTokens: vi.fn(),
      onAuthFailure: vi.fn(),
    };
    const replaced = () =>
      new Response(JSON.stringify({ error: 'conflict', reason: 'session_replaced' }), { status: 409 });

    it('does not call the hook when the request carried no session id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(replaced()));
      const onSessionReplaced = vi.fn();
      configureApiClient({ ...base, getGameSession: () => null, onSessionReplaced });
      await expect(apiRequest('/characters/me')).rejects.toMatchObject({ status: 409 });
      expect(onSessionReplaced).not.toHaveBeenCalled();
    });

    it('does not call the hook when the id changed between send and response', async () => {
      let current: string | null = 'old';
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        current = 'new';
        return replaced();
      }));
      const onSessionReplaced = vi.fn();
      configureApiClient({ ...base, getGameSession: () => current, onSessionReplaced });
      await expect(apiRequest('/characters/me')).rejects.toBeInstanceOf(ApiError);
      expect(onSessionReplaced).not.toHaveBeenCalled();
    });

    it('calls the hook once when the sent id is still current', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(replaced()));
      const onSessionReplaced = vi.fn();
      configureApiClient({ ...base, getGameSession: () => 'sess-1', onSessionReplaced });
      await expect(apiRequest('/characters/me')).rejects.toBeInstanceOf(ApiError);
      expect(onSessionReplaced).toHaveBeenCalledTimes(1);
    });

    it('keeps the session header on the request retried after a 401 refresh', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('{"error":"unauthenticated"}', { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'a2', refresh_token: 'r2' }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      configureApiClient({ ...base, getGameSession: () => 'sess-1' });
      await apiRequest('/characters/me');
      expect(fetchMock.mock.calls[2][1].headers['x-game-session']).toBe('sess-1');
    });

    it('resets omitted session hooks to their defaults on reconfigure', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      configureApiClient({ ...base, getGameSession: () => 'sess-1' });
      configureApiClient({ ...base });
      await apiRequest('/x');
      expect(fetchMock.mock.calls[0][1].headers['x-game-session']).toBeUndefined();
    });
  });
});
