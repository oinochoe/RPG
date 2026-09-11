# R3F RPG Client — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite+React+TypeScript client (React Three Fiber for the 3D
scene) that lets a player register, verify email, log in, create/select a
character, and enter a field map — talking to the real BackendX-generated
API.

**Architecture:** Auth/character screens are plain DOM React components
behind React Router; only the `/game` route mounts an R3F `<Canvas>`. Zustand
holds auth/character/session state. A single `apiRequest()` fetch wrapper
handles the `/api/v1` base URL, bearer auth, and transparent 401→refresh.
Since BackendX has not published a public base URL yet, local development
and verification run against an MSW mock server that implements the
confirmed contract.

**Tech Stack:** Vite, React 18, TypeScript, React Router v6, Zustand,
React Three Fiber + drei, Vitest + React Testing Library, MSW.

**Spec:** `docs/superpowers/specs/2026-09-11-r3f-client-phase1-design.md`

## Global Constraints

- All API calls go through `/api/v1` (base URL from `VITE_API_BASE_URL`).
- Error responses follow `{ error, trace_id, message, field?, reason? }`; UI
  text must come from a `reason`→Korean-message mapping, not the raw
  (English) `message`.
- `GET /characters` returns `{ items, page, page_size, total }`, not a bare
  array.
- Max 4 active characters per account, enforced server-side — client just
  surfaces the `max_characters_reached` error, it does not duplicate the rule.
- No real 3D art assets in Phase 1 — placeholder primitive meshes only.
- No combat/inventory/quest/shop screens in Phase 1.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`

**Interfaces:**
- Produces: a running Vite dev server and `npm run build`/`npm run test`
  scripts that every later task relies on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rpg-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@react-three/drei": "^9.114.0",
    "@react-three/fiber": "^8.17.10",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "three": "^0.167.1",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.167.2",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "msw": "^2.4.9",
    "typescript": "^5.5.4",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`vitest/config`'s `defineConfig` re-exports Vite's config type extended with
the `test` field, so this avoids a type error that plain `vite`'s
`defineConfig` would raise on the `test` key.

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RPG</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
dist
.env
```

- [ ] **Step 7: Create `.env.example`**

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

- [ ] **Step 8: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 9: Create placeholder `src/App.tsx`**

```tsx
export function App() {
  return <div>RPG client scaffold</div>;
}
```

- [ ] **Step 10: Create `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 11: Install dependencies**

Run: `npm install`
Expected: installs without errors, creates `package-lock.json`.

- [ ] **Step 12: Verify the dev server boots**

Run: `npm run build`
Expected: `tsc -b` and `vite build` both succeed, producing `dist/`.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html .gitignore .env.example src/main.tsx src/App.tsx src/vite-env.d.ts
git commit -m "chore: scaffold Vite+React+TS client"
```

---

## Task 2: Test setup, shared types, and API client

**Files:**
- Create: `src/test/setup.ts`
- Create: `src/types/api.ts`
- Create: `src/api/client.ts`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Consumes: nothing (foundation layer).
- Produces:
  - `ApiError` class (`status`, `error`, `reason?`, `field?`, `traceId?`, `message`)
  - `apiRequest<T>(path: string, options?: { method?: string; body?: unknown; auth?: boolean }): Promise<T>`
  - `configureApiClient(hooks: { getTokens: () => TokenPair | null; setTokens: (t: TokenPair) => void; onAuthFailure: () => void }): void`
  - `TokenPair = { accessToken: string; refreshToken: string }`
  - Domain types: `AuthTokens`, `CharacterClass`, `CharacterSummary`,
    `CharacterProfile`, `EquippedItem`, `InventorySlot`,
    `PaginatedResponse<T>`, `MonsterInstanceSummary`, `EnterMapResponse`
  - Used by every later `src/api/*` and `src/stores/*` module.

- [ ] **Step 1: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Create `src/types/api.ts`**

```ts
export interface ApiErrorBody {
  error: string;
  trace_id?: string;
  message?: string;
  field?: string;
  reason?: string;
}

export class ApiError extends Error {
  status: number;
  error: string;
  reason?: string;
  field?: string;
  traceId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? 'Unknown API error');
    this.status = status;
    this.error = body.error;
    this.reason = body.reason;
    this.field = body.field;
    this.traceId = body.trace_id;
  }
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export type CharacterClass = 'warrior' | 'mage' | 'archer';

export interface CharacterSummary {
  id: number;
  name: string;
  character_class: CharacterClass;
  level: number;
  current_hp: number;
  max_hp: number;
  current_map_id: number;
}

export interface EquippedItem {
  id: number;
  item_template_id: number;
  equipped_slot: string;
  enchant_level: number;
}

export interface InventorySlot {
  id: number;
  item_template_id: number;
  slot_index: number;
  quantity: number;
  enchant_level: number;
  is_equipped: boolean;
  equipped_slot: string | null;
}

export interface CharacterProfile {
  id: number;
  user_id: number;
  name: string;
  character_class: CharacterClass;
  level: number;
  experience: number;
  current_hp: number;
  max_hp: number;
  current_mp: number;
  max_mp: number;
  attack_power: number;
  defense_power: number;
  gold: number;
  skill_points: number;
  current_map_id: number;
  position_x: number;
  position_y: number;
  position_z: number;
  created_at: string;
  equipped_items: EquippedItem[];
  inventory: InventorySlot[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface MonsterInstanceSummary {
  instance_id: number;
  monster_template_id: number;
  name: string;
  level: number;
  current_hp: number;
  max_hp: number;
  position_x: number;
  position_y: number;
  position_z: number;
}

export interface EnterMapResponse {
  map_id: number;
  map_name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  dungeon_instance_id: number | null;
  monsters: MonsterInstanceSummary[];
}
```

- [ ] **Step 3: Write the failing test for the API client**

Create `src/api/client.test.ts`:

```ts
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
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test -- src/api/client.test.ts`
Expected: FAIL — `src/api/client.ts` does not exist yet.

- [ ] **Step 5: Implement `src/api/client.ts`**

```ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- src/api/client.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/test/setup.ts src/types/api.ts src/api/client.ts src/api/client.test.ts vite.config.ts
git commit -m "feat: add API client with bearer auth and 401 refresh"
```

---

## Task 3: Auth API + authStore

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/stores/authStore.ts`
- Test: `src/stores/authStore.test.ts`

**Interfaces:**
- Consumes: `apiRequest`, `configureApiClient` (Task 2), `AuthTokens` type.
- Produces:
  - `authApi.register(email, password): Promise<void>`
  - `authApi.login(email, password): Promise<AuthTokens>`
  - `authApi.verifyEmail(token): Promise<void>`
  - `authApi.logout(refreshToken): Promise<void>`
  - `useAuthStore` zustand hook with state
    `{ accessToken, refreshToken, email, isAuthenticated }` and actions
    `login(email, password)`, `logout()`, `restoreSession()`. Later tasks
    (route guards, pages) read `isAuthenticated` and call `login`/`logout`.

- [ ] **Step 1: Create `src/api/auth.ts`**

```ts
import { apiRequest } from './client';
import type { AuthTokens } from '../types/api';

export function register(email: string, password: string): Promise<void> {
  return apiRequest<void>('/auth/register', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function login(email: string, password: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function verifyEmail(token: string): Promise<void> {
  return apiRequest<void>('/auth/verify-email', {
    method: 'POST',
    body: { token },
    auth: false,
  });
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}
```

- [ ] **Step 2: Write the failing test for `authStore`**

Create `src/stores/authStore.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/stores/authStore.test.ts`
Expected: FAIL — `src/stores/authStore.ts` does not exist yet.

- [ ] **Step 4: Add `zustand` create import and implement `src/stores/authStore.ts`**

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/stores/authStore.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/auth.ts src/stores/authStore.ts src/stores/authStore.test.ts
git commit -m "feat: add auth API bindings and authStore"
```

---

## Task 4: Characters API + characterStore

**Files:**
- Create: `src/api/characters.ts`
- Create: `src/stores/characterStore.ts`
- Test: `src/stores/characterStore.test.ts`

**Interfaces:**
- Consumes: `apiRequest` (Task 2); `CharacterClass`, `CharacterSummary`,
  `CharacterProfile`, `PaginatedResponse` types (Task 2).
- Produces:
  - `charactersApi.listCharacters(page?, pageSize?): Promise<PaginatedResponse<CharacterSummary>>`
  - `charactersApi.createCharacter(name, characterClass): Promise<CharacterSummary>`
  - `charactersApi.selectCharacter(characterId): Promise<void>`
  - `charactersApi.deleteCharacter(characterId): Promise<void>`
  - `charactersApi.getActiveCharacterProfile(): Promise<CharacterProfile>`
  - `useCharacterStore` with state
    `{ characters, activeCharacter, isLoading }` and actions
    `fetchCharacters()`, `createCharacter(name, characterClass)`,
    `selectCharacter(characterId)`, `deleteCharacter(characterId)`. Later
    tasks (route guards, CharactersPage, GamePage) read `activeCharacter`
    and `characters`.

- [ ] **Step 1: Create `src/api/characters.ts`**

```ts
import { apiRequest } from './client';
import type {
  CharacterClass,
  CharacterProfile,
  CharacterSummary,
  PaginatedResponse,
} from '../types/api';

export function listCharacters(
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<CharacterSummary>> {
  return apiRequest(`/characters?page=${page}&page_size=${pageSize}`);
}

export function createCharacter(
  name: string,
  characterClass: CharacterClass,
): Promise<CharacterSummary> {
  return apiRequest('/characters', {
    method: 'POST',
    body: { name, character_class: characterClass },
  });
}

export function selectCharacter(characterId: number): Promise<void> {
  return apiRequest(`/characters/${characterId}/select`, { method: 'POST' });
}

export function deleteCharacter(characterId: number): Promise<void> {
  return apiRequest(`/characters/${characterId}`, { method: 'DELETE' });
}

export function getActiveCharacterProfile(): Promise<CharacterProfile> {
  return apiRequest('/characters/me');
}
```

- [ ] **Step 2: Write the failing test for `characterStore`**

Create `src/stores/characterStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  listCharacters: vi.fn(),
  createCharacter: vi.fn(),
  selectCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  getActiveCharacterProfile: vi.fn(),
}));

import * as charactersApi from '../api/characters';
import { useCharacterStore } from './characterStore';
import type { CharacterProfile, CharacterSummary } from '../types/api';

const summary: CharacterSummary = {
  id: 1,
  name: 'Valerius',
  character_class: 'warrior',
  level: 1,
  current_hp: 100,
  max_hp: 100,
  current_map_id: 1,
};

const profile: CharacterProfile = {
  id: 1,
  user_id: 42,
  name: 'Valerius',
  character_class: 'warrior',
  level: 1,
  experience: 0,
  current_hp: 100,
  max_hp: 100,
  current_mp: 20,
  max_mp: 20,
  attack_power: 10,
  defense_power: 5,
  gold: 100,
  skill_points: 0,
  current_map_id: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  created_at: '2026-09-11T00:00:00Z',
  equipped_items: [],
  inventory: [],
};

describe('characterStore', () => {
  beforeEach(() => {
    useCharacterStore.setState({ characters: [], activeCharacter: null, isLoading: false });
    vi.clearAllMocks();
  });

  it('fetchCharacters stores the items array from the paginated envelope', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue({
      items: [summary],
      page: 1,
      page_size: 20,
      total: 1,
    });

    await useCharacterStore.getState().fetchCharacters();

    expect(useCharacterStore.getState().characters).toEqual([summary]);
    expect(useCharacterStore.getState().isLoading).toBe(false);
  });

  it('createCharacter calls the API then refreshes the list', async () => {
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(summary);
    vi.mocked(charactersApi.listCharacters).mockResolvedValue({
      items: [summary],
      page: 1,
      page_size: 20,
      total: 1,
    });

    await useCharacterStore.getState().createCharacter('Valerius', 'warrior');

    expect(charactersApi.createCharacter).toHaveBeenCalledWith('Valerius', 'warrior');
    expect(useCharacterStore.getState().characters).toEqual([summary]);
  });

  it('selectCharacter calls select then loads the active profile', async () => {
    vi.mocked(charactersApi.selectCharacter).mockResolvedValue(undefined);
    vi.mocked(charactersApi.getActiveCharacterProfile).mockResolvedValue(profile);

    await useCharacterStore.getState().selectCharacter(1);

    expect(charactersApi.selectCharacter).toHaveBeenCalledWith(1);
    expect(useCharacterStore.getState().activeCharacter).toEqual(profile);
  });

  it('deleteCharacter calls the API then refreshes the list', async () => {
    vi.mocked(charactersApi.deleteCharacter).mockResolvedValue(undefined);
    vi.mocked(charactersApi.listCharacters).mockResolvedValue({
      items: [],
      page: 1,
      page_size: 20,
      total: 0,
    });

    await useCharacterStore.getState().deleteCharacter(1);

    expect(charactersApi.deleteCharacter).toHaveBeenCalledWith(1);
    expect(useCharacterStore.getState().characters).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/stores/characterStore.test.ts`
Expected: FAIL — `src/stores/characterStore.ts` does not exist yet.

- [ ] **Step 4: Implement `src/stores/characterStore.ts`**

```ts
import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import type { CharacterClass, CharacterProfile, CharacterSummary } from '../types/api';

interface CharacterState {
  characters: CharacterSummary[];
  activeCharacter: CharacterProfile | null;
  isLoading: boolean;
  fetchCharacters: () => Promise<void>;
  createCharacter: (name: string, characterClass: CharacterClass) => Promise<void>;
  selectCharacter: (characterId: number) => Promise<void>;
  deleteCharacter: (characterId: number) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  activeCharacter: null,
  isLoading: false,

  fetchCharacters: async () => {
    set({ isLoading: true });
    const page = await charactersApi.listCharacters();
    set({ characters: page.items, isLoading: false });
  },

  createCharacter: async (name, characterClass) => {
    await charactersApi.createCharacter(name, characterClass);
    await get().fetchCharacters();
  },

  selectCharacter: async (characterId) => {
    await charactersApi.selectCharacter(characterId);
    const profile = await charactersApi.getActiveCharacterProfile();
    set({ activeCharacter: profile });
  },

  deleteCharacter: async (characterId) => {
    await charactersApi.deleteCharacter(characterId);
    await get().fetchCharacters();
  },
}));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/stores/characterStore.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/characters.ts src/stores/characterStore.ts src/stores/characterStore.test.ts
git commit -m "feat: add characters API bindings and characterStore"
```

---

## Task 5: Maps API + sessionStore

**Files:**
- Create: `src/api/maps.ts`
- Create: `src/stores/sessionStore.ts`
- Test: `src/stores/sessionStore.test.ts`

**Interfaces:**
- Consumes: `apiRequest` (Task 2); `EnterMapResponse` type (Task 2).
- Produces:
  - `mapsApi.enterMap(mapId): Promise<EnterMapResponse>`
  - `useSessionStore` with state `{ currentMap: EnterMapResponse | null }`
    and action `enterMap(mapId)`. Consumed by `GamePage`/`Scene` in Task 9.

- [ ] **Step 1: Create `src/api/maps.ts`**

```ts
import { apiRequest } from './client';
import type { EnterMapResponse } from '../types/api';

export function enterMap(mapId: number): Promise<EnterMapResponse> {
  return apiRequest('/exploration/enter-map', {
    method: 'POST',
    body: { map_id: mapId },
  });
}
```

- [ ] **Step 2: Write the failing test for `sessionStore`**

Create `src/stores/sessionStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/maps', () => ({
  enterMap: vi.fn(),
}));

import * as mapsApi from '../api/maps';
import { useSessionStore } from './sessionStore';
import type { EnterMapResponse } from '../types/api';

const enterMapResponse: EnterMapResponse = {
  map_id: 1,
  map_name: 'Starter Field',
  position_x: 0,
  position_y: 0,
  position_z: 0,
  dungeon_instance_id: null,
  monsters: [
    {
      instance_id: 10,
      monster_template_id: 3,
      name: 'Slime',
      level: 1,
      current_hp: 20,
      max_hp: 20,
      position_x: 5,
      position_y: 0,
      position_z: 3,
    },
  ],
};

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ currentMap: null });
    vi.clearAllMocks();
  });

  it('enterMap stores the map and monster instances from the response', async () => {
    vi.mocked(mapsApi.enterMap).mockResolvedValue(enterMapResponse);

    await useSessionStore.getState().enterMap(1);

    expect(mapsApi.enterMap).toHaveBeenCalledWith(1);
    expect(useSessionStore.getState().currentMap).toEqual(enterMapResponse);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/stores/sessionStore.test.ts`
Expected: FAIL — `src/stores/sessionStore.ts` does not exist yet.

- [ ] **Step 4: Implement `src/stores/sessionStore.ts`**

```ts
import { create } from 'zustand';
import * as mapsApi from '../api/maps';
import type { EnterMapResponse } from '../types/api';

interface SessionState {
  currentMap: EnterMapResponse | null;
  enterMap: (mapId: number) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  currentMap: null,
  enterMap: async (mapId) => {
    const result = await mapsApi.enterMap(mapId);
    set({ currentMap: result });
  },
}));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/stores/sessionStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/maps.ts src/stores/sessionStore.ts src/stores/sessionStore.test.ts
git commit -m "feat: add maps API bindings and sessionStore"
```

---

## Task 6: Router and route guards

**Files:**
- Create: `src/components/RouteGuards.tsx`
- Test: `src/components/RouteGuards.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 3), `useCharacterStore` (Task 4).
- Produces:
  - `<RequireAuth />`, `<RequireActiveCharacter />` route-guard components
    (react-router `Outlet` pattern) used by `App.tsx`'s route tree.
  - `App.tsx` route tree with paths `/login`, `/register`,
    `/verify-email`, `/characters`, `/game`, used as the shell later tasks'
    pages plug into.

- [ ] **Step 1: Write the failing test for route guards**

Create `src/components/RouteGuards.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireActiveCharacter } from './RouteGuards';
import { useAuthStore } from '../stores/authStore';
import { useCharacterStore } from '../stores/characterStore';

function renderWithGuard(guard: 'auth' | 'character', initialPath: string) {
  const GuardElement = guard === 'auth' ? <RequireAuth /> : <RequireActiveCharacter />;
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={GuardElement}>
          <Route path="/protected" element={<div>protected content</div>} />
        </Route>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/characters" element={<div>characters page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, email: null, isAuthenticated: false });
  });

  it('redirects to /login when not authenticated', () => {
    renderWithGuard('auth', '/protected');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders the protected route when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderWithGuard('auth', '/protected');
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});

describe('RequireActiveCharacter', () => {
  beforeEach(() => {
    useCharacterStore.setState({ characters: [], activeCharacter: null, isLoading: false });
  });

  it('redirects to /characters when there is no active character', () => {
    renderWithGuard('character', '/protected');
    expect(screen.getByText('characters page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/components/RouteGuards.test.tsx`
Expected: FAIL — `src/components/RouteGuards.tsx` does not exist yet.

- [ ] **Step 3: Implement `src/components/RouteGuards.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useCharacterStore } from '../stores/characterStore';

export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireActiveCharacter() {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  if (!activeCharacter) return <Navigate to="/characters" replace />;
  return <Outlet />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/components/RouteGuards.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Wire up `App.tsx` with the route tree**

Replace the contents of `src/App.tsx` (pages referenced here are created in
Tasks 7-9; until then this file will show TypeScript errors for the missing
imports, which is expected and resolved by the end of Task 9):

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireActiveCharacter } from './components/RouteGuards';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { CharactersPage } from './pages/CharactersPage';
import { GamePage } from './pages/GamePage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/characters" element={<CharactersPage />} />
          <Route element={<RequireActiveCharacter />}>
            <Route path="/game" element={<GamePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/RouteGuards.tsx src/components/RouteGuards.test.tsx src/App.tsx
git commit -m "feat: add route guards and app route tree"
```

---

## Task 7: Auth pages (register, login, verify email)

**Files:**
- Create: `src/pages/errorMessages.ts`
- Create: `src/pages/RegisterPage.tsx`
- Create: `src/pages/LoginPage.tsx`
- Create: `src/pages/VerifyEmailPage.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 3), `authApi.register`/`verifyEmail`
  (Task 3), `ApiError` (Task 2).
- Produces: `translateApiError(err: unknown): string` helper reused by
  Task 8's `CharactersPage`.

- [ ] **Step 1: Create the shared error-message mapper `src/pages/errorMessages.ts`**

```ts
import { ApiError } from '../types/api';

const REASON_MESSAGES: Record<string, string> = {
  email_already_registered: '이미 등록된 이메일 주소입니다.',
  weak_password: '비밀번호는 최소 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다.',
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
  account_deactivated: '탈퇴 처리되었거나 이용이 정지된 계정입니다.',
  account_suspended: '이용이 정지된 계정입니다.',
  token_expired_or_invalid: '유효하지 않거나 만료된 토큰입니다.',
  email_unverified: '이메일 인증을 완료한 후 이용할 수 있습니다.',
  name_already_taken: '이미 사용 중인 캐릭터 이름입니다.',
  max_characters_reached: '생성 가능한 최대 캐릭터 수를 초과했습니다.',
  character_not_found: '해당 캐릭터를 찾을 수 없습니다.',
  no_active_character: '선택된 활성 캐릭터가 없습니다.',
};

export function translateApiError(err: unknown): string {
  if (err instanceof ApiError) {
    return REASON_MESSAGES[err.reason ?? ''] ?? err.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}
```

- [ ] **Step 2: Create `src/pages/RegisterPage.tsx`**

```tsx
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await authApi.register(email, password);
      setSubmitted(true);
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  if (submitted) {
    return (
      <div>
        <h1>회원가입 완료</h1>
        <p>{email}로 인증 메일을 보냈습니다. 메일함을 확인해주세요.</p>
        <button onClick={() => navigate('/login')}>로그인 화면으로</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>회원가입</h1>
      <label>
        이메일
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">가입하기</button>
      <p>
        이미 계정이 있으신가요? <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Create `src/pages/LoginPage.tsx`**

```tsx
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { translateApiError } from './errorMessages';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/characters');
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>로그인</h1>
      <label>
        이메일
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">로그인</button>
      <p>
        계정이 없으신가요? <Link to="/register">회원가입</Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Create `src/pages/VerifyEmailPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';

type Status = 'pending' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('인증 토큰이 없습니다. 이메일의 링크를 다시 확인해주세요.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(translateApiError(err));
      });
  }, [token]);

  if (status === 'pending') return <p>이메일 인증 처리 중입니다...</p>;

  if (status === 'error') {
    return (
      <div>
        <h1>인증 실패</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>이메일 인증 완료</h1>
      <p>
        이제 로그인할 수 있습니다. <Link to="/login">로그인하러 가기</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/errorMessages.ts src/pages/RegisterPage.tsx src/pages/LoginPage.tsx src/pages/VerifyEmailPage.tsx
git commit -m "feat: add register/login/verify-email pages"
```

---

## Task 8: Characters page

**Files:**
- Create: `src/pages/CharactersPage.tsx`

**Interfaces:**
- Consumes: `useCharacterStore` (Task 4), `useAuthStore.logout` (Task 3),
  `translateApiError` (Task 7).
- Produces: nothing consumed by later tasks beyond satisfying `App.tsx`'s
  `/characters` route import from Task 6.

- [ ] **Step 1: Create `src/pages/CharactersPage.tsx`**

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../stores/characterStore';
import { useAuthStore } from '../stores/authStore';
import type { CharacterClass } from '../types/api';
import { translateApiError } from './errorMessages';

const CLASS_OPTIONS: CharacterClass[] = ['warrior', 'mage', 'archer'];

export function CharactersPage() {
  const characters = useCharacterStore((s) => s.characters);
  const isLoading = useCharacterStore((s) => s.isLoading);
  const fetchCharacters = useCharacterStore((s) => s.fetchCharacters);
  const createCharacter = useCharacterStore((s) => s.createCharacter);
  const selectCharacter = useCharacterStore((s) => s.selectCharacter);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);
  const logout = useAuthStore((s) => s.logout);

  const [name, setName] = useState('');
  const [characterClass, setCharacterClass] = useState<CharacterClass>('warrior');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCharacters().catch((err) => setError(translateApiError(err)));
  }, [fetchCharacters]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCharacter(name, characterClass);
      setName('');
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  async function handleSelect(characterId: number) {
    setError(null);
    try {
      await selectCharacter(characterId);
      navigate('/game');
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  async function handleDelete(characterId: number) {
    setError(null);
    try {
      await deleteCharacter(characterId);
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  return (
    <div>
      <h1>캐릭터 선택</h1>
      {error && <p role="alert">{error}</p>}
      {isLoading && <p>불러오는 중...</p>}
      <ul>
        {characters.map((character) => (
          <li key={character.id}>
            {character.name} (Lv.{character.level} {character.character_class})
            <button onClick={() => handleSelect(character.id)}>선택</button>
            <button onClick={() => handleDelete(character.id)}>삭제</button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate}>
        <h2>새 캐릭터 생성</h2>
        <label>
          이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={16}
            required
          />
        </label>
        <label>
          직업
          <select
            value={characterClass}
            onChange={(e) => setCharacterClass(e.target.value as CharacterClass)}
          >
            {CLASS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">생성</button>
      </form>

      <button onClick={() => logout()}>로그아웃</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/CharactersPage.tsx
git commit -m "feat: add character list/create/select/delete page"
```

---

## Task 9: R3F game scene

**Files:**
- Create: `src/components/game/Ground.tsx`
- Create: `src/components/game/CharacterMesh.tsx`
- Create: `src/components/game/MonsterMesh.tsx`
- Create: `src/components/game/Scene.tsx`
- Create: `src/pages/GamePage.tsx`

**Interfaces:**
- Consumes: `useCharacterStore().activeCharacter` (Task 4),
  `useSessionStore` (Task 5), `CharacterProfile`/`MonsterInstanceSummary`
  types (Task 2).
- Produces: `GamePage` component satisfying `App.tsx`'s `/game` route
  import from Task 6. This is the last page `App.tsx` needs — after this
  task the app compiles end-to-end.

- [ ] **Step 1: Create `src/components/game/Ground.tsx`**

```tsx
export function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#4a7c3f" />
    </mesh>
  );
}
```

- [ ] **Step 2: Create `src/components/game/CharacterMesh.tsx`**

```tsx
import { Html } from '@react-three/drei';
import type { CharacterProfile } from '../../types/api';

const CLASS_COLORS: Record<CharacterProfile['character_class'], string> = {
  warrior: '#c0392b',
  mage: '#2980b9',
  archer: '#27ae60',
};

export function CharacterMesh({ character }: { character: CharacterProfile }) {
  const position: [number, number, number] = [
    character.position_x,
    character.position_y + 1,
    character.position_z,
  ];

  return (
    <group position={position}>
      <mesh castShadow>
        <capsuleGeometry args={[0.5, 1, 4, 8]} />
        <meshStandardMaterial color={CLASS_COLORS[character.character_class]} />
      </mesh>
      <Html position={[0, 1.2, 0]} center>
        <div>{character.name}</div>
      </Html>
    </group>
  );
}
```

- [ ] **Step 3: Create `src/components/game/MonsterMesh.tsx`**

```tsx
import { Html } from '@react-three/drei';
import type { MonsterInstanceSummary } from '../../types/api';

export function MonsterMesh({ monster }: { monster: MonsterInstanceSummary }) {
  const position: [number, number, number] = [
    monster.position_x,
    monster.position_y + 0.5,
    monster.position_z,
  ];

  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7f2d8f" />
      </mesh>
      <Html position={[0, 1, 0]} center>
        <div>
          {monster.name} (Lv.{monster.level})
        </div>
      </Html>
    </group>
  );
}
```

- [ ] **Step 4: Create `src/components/game/Scene.tsx`**

```tsx
import { OrthographicCamera } from '@react-three/drei';
import { Ground } from './Ground';
import { CharacterMesh } from './CharacterMesh';
import { MonsterMesh } from './MonsterMesh';
import type { CharacterProfile, EnterMapResponse } from '../../types/api';

export function Scene({
  character,
  map,
}: {
  character: CharacterProfile;
  map: EnterMapResponse;
}) {
  return (
    <>
      <OrthographicCamera makeDefault position={[20, 20, 20]} zoom={40} near={0.1} far={200} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <Ground />
      <CharacterMesh character={character} />
      {map.monsters.map((monster) => (
        <MonsterMesh key={monster.instance_id} monster={monster} />
      ))}
    </>
  );
}
```

- [ ] **Step 5: Create `src/pages/GamePage.tsx`**

```tsx
import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { useCharacterStore } from '../stores/characterStore';
import { useSessionStore } from '../stores/sessionStore';
import { Scene } from '../components/game/Scene';
import { translateApiError } from './errorMessages';

export function GamePage() {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  const currentMap = useSessionStore((s) => s.currentMap);
  const enterMap = useSessionStore((s) => s.enterMap);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCharacter) {
      enterMap(activeCharacter.current_map_id).catch((err) => setError(translateApiError(err)));
    }
  }, [activeCharacter, enterMap]);

  if (error) return <p role="alert">{error}</p>;
  if (!activeCharacter || !currentMap) return <p>맵 입장 중...</p>;

  return (
    <Canvas shadows style={{ width: '100vw', height: '100vh' }}>
      <Scene character={activeCharacter} map={currentMap} />
    </Canvas>
  );
}
```

- [ ] **Step 6: Verify the full project builds**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (this confirms `App.tsx`'s
imports from Tasks 6-9 all resolve).

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: all tests from Tasks 2-6 pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/game src/pages/GamePage.tsx
git commit -m "feat: add R3F scene for map entry"
```

---

## Task 10: Local mock backend and end-to-end browser verification

BackendX has not published a public base URL yet, so this task stands up a
local mock server implementing the confirmed contract, then drives the app
in a real browser to confirm the whole Phase 1 flow works end to end.

**Files:**
- Create: `src/mocks/handlers.ts`
- Create: `src/mocks/browser.ts`
- Create: `src/mocks/node.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: the full `/api/v1` contract from the design spec.
- Produces: a dev-only MSW worker so `npm run dev` is fully clickable
  without a live BackendX deployment.

- [ ] **Step 1: Create `public/mockServiceWorker.js`**

Run: `npx msw init public/ --save`
Expected: generates `public/mockServiceWorker.js` and adds a
`"msw": { "workerDirectory": ["public"] }` entry to `package.json`.

- [ ] **Step 2: Create `src/mocks/handlers.ts`**

```ts
import { http, HttpResponse } from 'msw';
import type {
  CharacterProfile,
  CharacterSummary,
  EnterMapResponse,
} from '../types/api';

const BASE = 'http://localhost:8000/api/v1';

let nextUserId = 1;
const users = new Map<string, { id: number; password: string; verified: boolean }>();
let pendingVerificationToken: string | null = null;

let nextCharacterId = 1;
const characters: CharacterSummary[] = [];
let activeCharacterId: number | null = null;

function toProfile(summary: CharacterSummary): CharacterProfile {
  return {
    id: summary.id,
    user_id: 1,
    name: summary.name,
    character_class: summary.character_class,
    level: summary.level,
    experience: 0,
    current_hp: summary.current_hp,
    max_hp: summary.max_hp,
    current_mp: 20,
    max_mp: 20,
    attack_power: 10,
    defense_power: 5,
    gold: 100,
    skill_points: 0,
    current_map_id: summary.current_map_id,
    position_x: 0,
    position_y: 0,
    position_z: 0,
    created_at: new Date().toISOString(),
    equipped_items: [],
    inventory: [],
  };
}

export const handlers = [
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (users.has(body.email)) {
      return HttpResponse.json(
        { error: 'conflict', reason: 'email_already_registered', message: 'Email already registered.' },
        { status: 409 },
      );
    }
    users.set(body.email, { id: nextUserId++, password: body.password, verified: false });
    pendingVerificationToken = 'mock-verify-token';
    return HttpResponse.json({}, { status: 201 });
  }),

  http.post(`${BASE}/auth/verify-email`, async ({ request }) => {
    const body = (await request.json()) as { token: string };
    if (body.token !== pendingVerificationToken) {
      return HttpResponse.json(
        { error: 'validation_failed', reason: 'token_expired_or_invalid', message: 'Invalid token.' },
        { status: 400 },
      );
    }
    for (const user of users.values()) user.verified = true;
    return HttpResponse.json({}, { status: 200 });
  }),

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    const user = users.get(body.email);
    if (!user || user.password !== body.password) {
      return HttpResponse.json(
        { error: 'unauthorized', reason: 'invalid_credentials', message: 'Invalid credentials.' },
        { status: 401 },
      );
    }
    return HttpResponse.json({ access_token: 'mock-access', refresh_token: 'mock-refresh' });
  }),

  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ access_token: 'mock-access-2', refresh_token: 'mock-refresh-2' }),
  ),

  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),

  http.post(`${BASE}/characters`, async ({ request }) => {
    const body = (await request.json()) as { name: string; character_class: CharacterSummary['character_class'] };
    if (characters.some((c) => c.name === body.name)) {
      return HttpResponse.json(
        { error: 'conflict', reason: 'name_already_taken', message: 'Name already taken.' },
        { status: 409 },
      );
    }
    if (characters.length >= 4) {
      return HttpResponse.json(
        { error: 'validation_failed', reason: 'max_characters_reached', message: 'Character limit reached.' },
        { status: 400 },
      );
    }
    const summary: CharacterSummary = {
      id: nextCharacterId++,
      name: body.name,
      character_class: body.character_class,
      level: 1,
      current_hp: 100,
      max_hp: 100,
      current_map_id: 1,
    };
    characters.push(summary);
    return HttpResponse.json(summary, { status: 201 });
  }),

  http.get(`${BASE}/characters`, () =>
    HttpResponse.json({ items: characters, page: 1, page_size: 20, total: characters.length }),
  ),

  http.post(`${BASE}/characters/:id/select`, ({ params }) => {
    activeCharacterId = Number(params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${BASE}/characters/:id`, ({ params }) => {
    const index = characters.findIndex((c) => c.id === Number(params.id));
    if (index >= 0) characters.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/characters/me`, () => {
    const active = characters.find((c) => c.id === activeCharacterId);
    if (!active) {
      return HttpResponse.json(
        { error: 'not_found', reason: 'no_active_character', message: 'No active character.' },
        { status: 404 },
      );
    }
    return HttpResponse.json(toProfile(active));
  }),

  http.post(`${BASE}/exploration/enter-map`, async ({ request }) => {
    const body = (await request.json()) as { map_id: number };
    const response: EnterMapResponse = {
      map_id: body.map_id,
      map_name: 'Starter Field',
      position_x: 0,
      position_y: 0,
      position_z: 0,
      dungeon_instance_id: null,
      monsters: [
        {
          instance_id: 1001,
          monster_template_id: 1,
          name: 'Slime',
          level: 1,
          current_hp: 20,
          max_hp: 20,
          position_x: 4,
          position_y: 0,
          position_z: 2,
        },
        {
          instance_id: 1002,
          monster_template_id: 1,
          name: 'Slime',
          level: 1,
          current_hp: 20,
          max_hp: 20,
          position_x: -3,
          position_y: 0,
          position_z: 6,
        },
      ],
    };
    return HttpResponse.json(response);
  }),
];
```

- [ ] **Step 3: Create `src/mocks/browser.ts`**

```ts
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
```

- [ ] **Step 4: Create `src/mocks/node.ts`** (for future test use, not wired into Vitest in this task)

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

- [ ] **Step 5: Wire the mock worker into `src/main.tsx` for local dev**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { useAuthStore } from './stores/authStore';

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  useAuthStore.getState().restoreSession();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
```

- [ ] **Step 6: Start the dev server**

Run: `npm run dev`
Expected: server starts (typically `http://localhost:5173`), console shows
`[MSW] Mocking enabled.`

- [ ] **Step 7: Manually verify the full flow in a browser**

Use the `claude-in-chrome` tools (or open the URL manually) to:
1. Navigate to `http://localhost:5173/register`, submit an email + valid
   password (e.g. `Passw0rd1`). Confirm the "인증 메일을 보냈습니다" screen appears.
2. Navigate to `http://localhost:5173/verify-email?token=mock-verify-token`.
   Confirm "이메일 인증 완료" appears.
3. Navigate to `/login`, submit the same email/password. Confirm redirect
   to `/characters`.
4. On `/characters`, create a character (name + class). Confirm it appears
   in the list.
5. Click "선택" on the character. Confirm redirect to `/game` and that the
   3D canvas renders a colored capsule (character) and two purple boxes
   (Slime monsters) with name labels, on a green ground plane.

Expected: all five steps succeed with no unhandled console errors.

- [ ] **Step 8: Commit**

```bash
git add public/mockServiceWorker.js src/mocks src/main.tsx package.json
git commit -m "feat: add MSW mock backend for local Phase 1 verification"
```
