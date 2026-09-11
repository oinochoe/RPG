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
});
