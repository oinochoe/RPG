import { ApiError } from '../types/api';
import type { ApiErrorBody } from '../types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type TokenGetter = () => TokenPair | null;
type TokenSetter = (tokens: TokenPair) => void;
type AuthFailureHandler = () => void;

let getTokens: TokenGetter = () => null;
let setTokens: TokenSetter = () => {};
let handleAuthFailure: AuthFailureHandler = () => {};

export function configureApiClient(hooks: {
  getTokens: TokenGetter;
  setTokens: TokenSetter;
  onAuthFailure: AuthFailureHandler;
}): void {
  getTokens = hooks.getTokens;
  setTokens = hooks.setTokens;
  handleAuthFailure = hooks.onAuthFailure;
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try {
    body = await response.json();
  } catch {
    body = { error: 'unknown_error', message: response.statusText };
  }
  return new ApiError(response.status, body);
}

function rawFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;

  const response = await rawFetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  });
  if (!response.ok) return false;

  const data = (await response.json()) as { access_token: string; refresh_token: string };
  setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
  return true;
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  /** Attach the bearer token. Defaults to true. */
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      const tokens = getTokens();
      if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return headers;
  };

  const init: RequestInit = { method, headers: buildHeaders() };
  if (body !== undefined) init.body = JSON.stringify(body);

  let response = await rawFetch(path, init);

  if (response.status === 401 && auth) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      handleAuthFailure();
      throw await parseError(response);
    }
    response = await rawFetch(path, { ...init, headers: buildHeaders() });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
