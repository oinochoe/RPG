# 한 접속만 유효한 게임 세션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 계정이 동시에 하나의 게임 접속만 유효하게 한다(나중 접속이 이김). 옛 접속은 서버가 거부하고 클라이언트가 안내 후 멈추며, 탭을 닫을 때도 위치를 저장한다.

**Architecture:** `select_character` RPC가 접속 ID(`characters.game_session_id`)를 새로 발급해 활성 캐릭터 행에 저장한다. 클라이언트는 그 ID를 탭 단위(`sessionStorage`)로 들고 모든 요청에 `x-game-session` 헤더로 보내고, 서버 미들웨어가 `/characters/me*` 요청마다 활성 캐릭터의 ID와 비교해 다르면 409 `session_replaced`로 거부한다.

**Tech Stack:** Supabase(Postgres 마이그레이션 + Deno/Hono 엣지 함수), React 18 + zustand, vitest, MSW(목 서버).

**Spec:** `docs/superpowers/specs/2026-10-01-single-game-session-design.md`

## 스펙과 달라진 점 (구현 근거)

- **CORS:** 서버 `cors({ allowHeaders: ["Content-Type", "Authorization"] })`에 `X-Game-Session`을 추가해야 한다. 빠지면 브라우저가 사전 요청(preflight)에서 모든 요청을 막는다. 스펙에 없던 필수 항목이다.
- **`select` 응답:** 현재 `POST /characters/:id/select`는 `{}`를 돌려준다. 이것을 `{ game_session_id }`로 바꾼다.
- **모달 위치:** "다른 곳에서 접속" 안내는 앱 최상위(`App.tsx`)에 마운트하는 `SessionReplacedModal`이 작은 스토어(`useGameSessionStore`)의 `replaced` 플래그로 띄운다.
- **옛 탭의 타이머 중단:** 서버가 이미 모든 요청을 거부하므로 위치 저장·킬 보고 타이머를 별도로 멈추지 않는다(전부 409로 무해하게 실패). 모달이 화면을 막는다.
- **MSW 목 서버:** 목은 탭마다 `sessionStorage` 상태라 두 탭 시나리오를 재현할 수 없다. 목은 `select`가 `game_session_id`를 돌려주고 헤더를 검사하지 않는다. 두 탭 시나리오는 배포 후 실제 서버에서 사용자가 확인한다.
- **배포 순서(중요):** ① 마이그레이션(사용자가 SQL Editor) → ② 프런트 배포(새 프런트는 옛 서버와도 호환: 옛 서버가 `select`에서 ID를 주지 않으면 헤더를 안 보낸다) → ③ 엣지 함수 배포. 함수를 먼저 배포하면 헤더 없는 기존 프런트가 전부 409를 받는다.

## Global Constraints

- 세션 비교는 **서버에서만** 한다. 인증은 기존 `Authorization`이 담당하고, 서버는 항상 토큰의 사용자 → 그 사용자의 **활성 캐릭터** 행과 비교한다.
- 409 응답은 상태를 바꾸지 않는다(핸들러 미실행). 에러 형식은 기존 `ApiError`(`error: "session_replaced"` 가 아니라 기존 규약대로 `ApiError(409, "conflict", "session_replaced", "다른 곳에서 접속하여 이 접속은 종료되었습니다.")` → 본문 `{ error: "conflict", reason: "session_replaced", message, trace_id }`).
- `select`/캐릭터 목록·생성·삭제(`/characters`, `/characters/:id…`)에는 세션 검사를 걸지 않는다. 검사는 `/characters/me`와 `/characters/me/*`에만.
- `sessionStorage`/`localStorage` 접근은 항상 try/catch(차단돼도 동작).
- 새 주석은 영어(서버 파일은 기존처럼 영어 주석), 커밋 메시지는 한글, 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- 작업은 워크트리에서 하고 `npm ci`한다(`node_modules` 심볼릭 링크 금지). 마이그레이션 SQL은 **적용하지 않고** 파일만 만든다(사용자가 실행).

## Review Focus

- 헤더가 없을 때, 다를 때, 활성 캐릭터가 없을 때(`null`)의 판정이 각각 맞다. (Task 1)
- 같은 캐릭터를 다시 `select`해도 **새** ID가 발급되어 이전 접속이 무효가 된다. (Task 1 SQL)
- 다른 캐릭터를 선택하면 이전 캐릭터의 `game_session_id`가 `NULL`로 비워진다. (Task 1 SQL)
- `/characters/me`(경로 정확히 일치)와 `/characters/me/*` 둘 다 검사된다 — Hono의 `use("/me/*")`만으로는 `/me`가 빠진다. (Task 2)
- 409 응답에서 클라이언트가 토큰 갱신/재시도를 하지 않는다(401 경로와 섞이지 않음). (Task 3)
- `sessionStorage`가 막혀도 메모리 값으로 동작한다. (Task 3)
- 모달이 떠 있는 동안 위치 저장 등의 409가 에러 팝업을 연달아 띄우지 않는다. (Task 4)
- 탭을 닫을 때 저장이 `keepalive`로 가고, 이미 `replaced`인 접속은 저장하지 않는다. (Task 4)

---

### Task 1: 마이그레이션과 세션 판정 순수 함수

**Files:**
- Create: `supabase/migrations/20261001010000_game_session_id.sql`
- Create: `supabase/functions/api/gameSession.ts` (순수 모듈, import 없음)
- Test: `src/stores/gameSession.server.test.ts`

**Interfaces:**
- Produces (`gameSession.ts`): `type GameSessionCheck = 'ok' | 'missing' | 'mismatch' | 'no_active_character'`, `checkGameSession(header: string | undefined, active: { game_session_id: string | null } | null | undefined): GameSessionCheck`, 상수 `GAME_SESSION_HEADER = 'x-game-session'`.
- Produces (SQL): `characters.game_session_id uuid NULL`; `select_character(p_user_id INT, p_character_id INT) RETURNS public.characters`(같은 시그니처, 반환 행에 새 `game_session_id` 포함).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/gameSession.server.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_SESSION_HEADER, checkGameSession } from '../../supabase/functions/api/gameSession';

const ACTIVE = { game_session_id: 'aaaaaaaa-0000-0000-0000-000000000001' };

describe('checkGameSession', () => {
  it('accepts a request that carries the active character\'s session id', () => {
    expect(checkGameSession('aaaaaaaa-0000-0000-0000-000000000001', ACTIVE)).toBe('ok');
  });

  it('rejects a request with no session header', () => {
    expect(checkGameSession(undefined, ACTIVE)).toBe('missing');
    expect(checkGameSession('', ACTIVE)).toBe('missing');
  });

  it('rejects a request carrying a different (older) session id', () => {
    expect(checkGameSession('bbbbbbbb-0000-0000-0000-000000000002', ACTIVE)).toBe('mismatch');
  });

  it('rejects when the active character has no session at all (never entered through select)', () => {
    expect(checkGameSession('aaaaaaaa-0000-0000-0000-000000000001', { game_session_id: null })).toBe('mismatch');
  });

  it('reports a missing active character separately, even when a header is present', () => {
    expect(checkGameSession('aaaaaaaa-0000-0000-0000-000000000001', null)).toBe('no_active_character');
    expect(checkGameSession(undefined, undefined)).toBe('no_active_character');
  });

  it('compares exactly: no trimming, no case folding that could let a wrong id through', () => {
    expect(checkGameSession(' aaaaaaaa-0000-0000-0000-000000000001', ACTIVE)).toBe('mismatch');
  });

  it('exposes the header name the client and the CORS allow-list must share', () => {
    expect(GAME_SESSION_HEADER).toBe('x-game-session');
  });
});
```

Run: `npx vitest run src/stores/gameSession.server.test.ts` → FAIL (모듈 없음).

- [ ] **Step 2: `gameSession.ts` 구현**

```ts
// Decides whether a request belongs to the character's CURRENT game session. Pure (no imports) so
// vitest can import it, like drops.ts/economyRules.ts. Selecting a character issues a fresh
// game_session_id (see the select_character RPC); a request carrying any other id comes from a
// session that has since been replaced.

export const GAME_SESSION_HEADER = 'x-game-session';

export type GameSessionCheck = 'ok' | 'missing' | 'mismatch' | 'no_active_character';

export function checkGameSession(
  header: string | undefined,
  active: { game_session_id: string | null } | null | undefined,
): GameSessionCheck {
  if (!active) return 'no_active_character';
  if (!header) return 'missing';
  if (active.game_session_id === null || header !== active.game_session_id) return 'mismatch';
  return 'ok';
}
```

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/20261001010000_game_session_id.sql` (적용하지 않는다, 파일만):

```sql
-- One live game session per account: select_character issues a fresh game_session_id on the character it
-- activates and clears it on the one it deactivates. The API compares each request's x-game-session header
-- with the ACTIVE character's value, so a session that has been replaced (another tab/device selected a
-- character since) is rejected. See docs/superpowers/specs/2026-10-01-single-game-session-design.md.
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS game_session_id UUID NULL;

CREATE OR REPLACE FUNCTION public.select_character(
  p_user_id INT,
  p_character_id INT
)
RETURNS public.characters
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
BEGIN
  PERFORM pg_advisory_xact_lock(p_user_id);

  -- Deactivate whatever else was active and drop its session id.
  UPDATE public.characters
  SET is_active = FALSE, game_session_id = NULL
  WHERE user_id = p_user_id AND is_active = TRUE AND id != p_character_id;

  -- Activate the requested character with a NEW session id (also when it was already active, so
  -- selecting the same character from a second tab replaces the first tab's session).
  UPDATE public.characters
  SET is_active = TRUE, game_session_id = gen_random_uuid()
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL
  RETURNING * INTO v_char;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_char;
END;
$$;
```

(`gen_random_uuid()`는 Postgres 13+ 내장이다. 이 프로젝트의 가장 최신 `select_character` 정의가 `20260914093000_select_character_advisory_lock.sql`인지 `grep -rn "select_character" supabase/migrations`로 확인하고, 더 최신 정의가 있으면 그 본문을 기준으로 위 두 `UPDATE`만 바꾼다.)

- [ ] **Step 4: 통과 확인과 커밋**

Run: `npx vitest run src/stores/gameSession.server.test.ts && npx tsc -b` → PASS.

```bash
git add supabase/functions/api/gameSession.ts supabase/migrations/20261001010000_game_session_id.sql src/stores/gameSession.server.test.ts
git commit -m "feat(session): 게임 접속 ID 컬럼과 select_character 갱신, 세션 판정 순수 함수

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 연결 — select 응답, 미들웨어, CORS

**Files:**
- Create: `supabase/functions/api/gameSessionMiddleware.ts`
- Modify: `supabase/functions/api/characters.ts` (`/:id/select` 응답, 미들웨어 등록)
- Modify: `supabase/functions/api/index.ts` (CORS `allowHeaders`)

**Interfaces:**
- Consumes: `checkGameSession`, `GAME_SESSION_HEADER` (Task 1), `getAdminClient`, `ApiError`, `AppUser`(`authMiddleware.ts`).
- Produces: `requireGameSession: MiddlewareHandler` — `appUser`를 `c.get("appUser")`로 읽고, 활성 캐릭터(`is_active = true`, `deleted_at IS NULL`)의 `game_session_id`를 조회해 판정한다. `POST /characters/:id/select`가 `{ game_session_id }`를 돌려준다.

- [ ] **Step 1: 미들웨어 작성**

`supabase/functions/api/gameSessionMiddleware.ts`:

```ts
import { MiddlewareHandler } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError } from "./errors.ts";
import type { AppUser } from "./authMiddleware.ts";
import { GAME_SESSION_HEADER, checkGameSession } from "./gameSession.ts";

// Rejects requests from a game session that has been replaced. Runs after requireAuth, so appUser is
// already the verified token owner; the comparison is against that user's ACTIVE character only.
export const requireGameSession: MiddlewareHandler = async (c, next) => {
  const appUser = c.get("appUser") as AppUser;
  const admin = getAdminClient();
  const { data: active, error } = await admin
    .from("characters")
    .select("game_session_id")
    .eq("user_id", appUser.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("game session lookup failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "session_check_failed", "접속 확인 중 오류가 발생했습니다.");
  }

  const result = checkGameSession(c.req.header(GAME_SESSION_HEADER), active);
  if (result === "no_active_character") {
    // Same answer the routes themselves give when nothing is selected.
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (result !== "ok") {
    throw new ApiError(409, "conflict", "session_replaced", "다른 곳에서 접속하여 이 접속은 종료되었습니다.");
  }
  await next();
};
```

(`import ... from "./gameSession.ts"`는 Deno 규약상 `.ts` 확장자가 필요하다. `characters.ts`가 다른 모듈을 어떻게 import 하는지(확장자 유무)를 확인해 그 규약에 맞춘다. 순수 모듈 `gameSession.ts`는 vitest에서 `../../supabase/functions/api/gameSession`로 import되므로 파일 안에서 다른 모듈을 import하지 않는다.)

- [ ] **Step 2: 라우트에 등록**

`characters.ts` 상단의 `charactersRoutes.use("*", requireAuth);` 바로 다음에:

```ts
// Everything that acts on "my" character must come from the current game session. `use("/me/*")` alone
// would miss the exact path /me (GET profile), so register both.
charactersRoutes.use("/me", requireGameSession);
charactersRoutes.use("/me/*", requireGameSession);
```

`import { requireGameSession } from "./gameSessionMiddleware.ts";`를 추가한다.

`POST /:id/select`: RPC 결과를 받아 새 ID를 돌려준다.

```ts
  const { data: selected, error } = await admin.rpc("select_character", {
    p_user_id: appUser.id,
    p_character_id: characterId,
  });
```

(기존 `const { error } = await admin.rpc(...)`를 위처럼 바꾸고 에러 처리 블록은 그대로 둔다.) 마지막 `return c.json({}, 200);`을 다음으로 바꾼다:

```ts
  // The RPC returns the activated character row; its fresh game_session_id is this session's ticket.
  const gameSessionId = (selected as { game_session_id: string | null } | null)?.game_session_id ?? null;
  return c.json({ game_session_id: gameSessionId }, 200);
```

- [ ] **Step 3: CORS**

`index.ts`의 `allowHeaders: ["Content-Type", "Authorization"],`를 `allowHeaders: ["Content-Type", "Authorization", "X-Game-Session"],`로 바꾼다.

- [ ] **Step 4: 검증과 커밋**

엣지 함수는 로컬에서 Deno로 돌리지 않는다(테스트 환경 없음). 검증: `npx tsc -b`(클라이언트 타입 영향 없음 확인)와 `npx vitest run`(전체 통과). 코드 리뷰로 `/me`와 `/me/*` 모두 등록됐는지, `select`·목록·생성·삭제 경로에는 미들웨어가 안 걸렸는지 확인한다.

```bash
git add supabase/functions/api/gameSessionMiddleware.ts supabase/functions/api/characters.ts supabase/functions/api/index.ts
git commit -m "feat(session): 서버가 게임 접속 ID를 발급·검사 — 다른 접속의 요청은 409 session_replaced

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 클라이언트 — 접속 ID 저장, 헤더, 409 처리, 목 서버

**Files:**
- Create: `src/stores/gameSessionStore.ts`
- Modify: `src/api/client.ts` (헤더, 409 처리 훅)
- Modify: `src/api/characters.ts` (`selectCharacter`가 ID를 돌려줌)
- Modify: `src/stores/characterStore.ts` (`selectCharacter`가 ID 저장)
- Modify: `src/stores/authStore.ts` (`configureApiClient`에 새 훅 연결)
- Modify: `src/mocks/handlers.ts` (`select` 응답)
- Test: `src/stores/gameSessionStore.test.ts`, `src/api/client.test.ts`(케이스 추가)

**Interfaces:**
- Produces (`gameSessionStore.ts`): `useGameSessionStore` (zustand) `{ sessionId: string | null; replaced: boolean; setSessionId(id: string | null): void; markReplaced(): void; reset(): void }`. `sessionId`는 `sessionStorage` 키 `rpg.game-session`에 저장/복원(try/catch).
- Produces (`client.ts`): `configureApiClient`의 hooks에 `getGameSession?: () => string | null`, `onSessionReplaced?: () => void` 추가. `apiRequest`가 값이 있으면 `x-game-session` 헤더를 붙이고, 응답이 409이며 `reason === 'session_replaced'`면 `onSessionReplaced()`를 호출한 뒤 `ApiError`를 던진다(토큰 갱신·재시도 없음).
- Produces (`api/characters.ts`): `selectCharacter(characterId): Promise<{ game_session_id: string | null }>`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/gameSessionStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSessionStore } from './gameSessionStore';

describe('useGameSessionStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useGameSessionStore.getState().reset();
  });

  it('keeps the session id in memory and in sessionStorage, and clears both on reset', () => {
    useGameSessionStore.getState().setSessionId('abc');
    expect(useGameSessionStore.getState().sessionId).toBe('abc');
    expect(sessionStorage.getItem('rpg.game-session')).toBe('abc');
    useGameSessionStore.getState().reset();
    expect(useGameSessionStore.getState().sessionId).toBeNull();
    expect(sessionStorage.getItem('rpg.game-session')).toBeNull();
  });

  it('marks the session replaced exactly once and stays replaced until reset', () => {
    useGameSessionStore.getState().markReplaced();
    useGameSessionStore.getState().markReplaced();
    expect(useGameSessionStore.getState().replaced).toBe(true);
    useGameSessionStore.getState().reset();
    expect(useGameSessionStore.getState().replaced).toBe(false);
  });

  it('still works in memory when sessionStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => useGameSessionStore.getState().setSessionId('xyz')).not.toThrow();
    expect(useGameSessionStore.getState().sessionId).toBe('xyz');
    spy.mockRestore();
  });
});
```

`src/api/client.test.ts`에 기존 파일의 패턴(fetch 모킹, `configureApiClient` 호출 방식)을 그대로 따라 아래 케이스를 추가한다(파일을 먼저 읽고 헬퍼를 재사용):
1. `getGameSession`이 `'sess-1'`을 돌려주면 요청에 `x-game-session: sess-1` 헤더가 붙는다. 돌려주지 않으면(null) 헤더가 없다.
2. 서버가 409 `{ error: 'conflict', reason: 'session_replaced' }`를 돌려주면 `onSessionReplaced`가 한 번 호출되고, `ApiError`(status 409)가 던져지며, 토큰 갱신(`/auth/refresh`) 호출과 재시도는 일어나지 않는다(fetch 호출 횟수 1).
3. 409지만 `reason`이 다르면(`'other'`) `onSessionReplaced`는 호출되지 않는다.

Run: `npx vitest run src/stores/gameSessionStore.test.ts src/api/client.test.ts` → FAIL.

- [ ] **Step 2: 스토어 구현**

`src/stores/gameSessionStore.ts`:

```ts
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
    set({ sessionId: id });
  },
  markReplaced: () => set({ replaced: true }),
  reset: () => {
    write(null);
    set({ sessionId: null, replaced: false });
  },
}));
```

- [ ] **Step 3: API 클라이언트 수정**

`client.ts`: 모듈 상단에 훅 변수를 추가하고 `configureApiClient`에서 받는다.

```ts
type GameSessionGetter = () => string | null;
let getGameSession: GameSessionGetter = () => null;
let handleSessionReplaced: () => void = () => {};
```

`configureApiClient`의 hooks 타입에 `getGameSession?: GameSessionGetter; onSessionReplaced?: () => void;`를 추가하고 `if (hooks.getGameSession) getGameSession = hooks.getGameSession; if (hooks.onSessionReplaced) handleSessionReplaced = hooks.onSessionReplaced;`.

`apiRequest`의 `buildHeaders`에서 `Content-Type` 다음에 `const gameSession = getGameSession(); if (gameSession) headers['x-game-session'] = gameSession;`(인증 여부와 무관하게 값이 있으면 붙인다).

401 처리 블록 **다음**, `if (!response.ok) throw await parseError(response);` **앞**에 추가:

```ts
  if (response.status === 409) {
    const error = await parseError(response);
    if (error.reason === 'session_replaced') handleSessionReplaced();
    throw error;
  }
```

- [ ] **Step 4: 선택 흐름과 훅 연결**

`api/characters.ts`: `selectCharacter`를 다음으로 바꾼다.

```ts
export function selectCharacter(characterId: number): Promise<{ game_session_id: string | null }> {
  return apiRequest(`/characters/${characterId}/select`, { method: 'POST' });
}
```

`characterStore.ts`의 `selectCharacter`: `await charactersApi.selectCharacter(characterId);`를 다음으로 바꾼다(프로필을 불러오기 **전에** ID를 저장해야 `GET /characters/me`에 헤더가 붙는다):

```ts
    const selected = await charactersApi.selectCharacter(characterId);
    // Replaces any earlier session (this tab's or another tab's) — see gameSessionStore.
    useGameSessionStore.getState().setSessionId(selected?.game_session_id ?? null);
    useGameSessionStore.getState().reset_replaced?.();
```

(마지막 줄은 쓰지 않는다 — 대신 `setSessionId` 호출만 한다. 새 선택은 `replaced` 상태를 유지하지 않아도 되도록 `setSessionId`가 `replaced: false`도 함께 만들게 스토어의 `setSessionId`를 `set({ sessionId: id, replaced: false })`로 한다. 테스트의 "markReplaced … until reset" 케이스는 `setSessionId`를 부르지 않으므로 영향 없다.) `import { useGameSessionStore } from './gameSessionStore';`를 추가한다.

`authStore.ts`의 `configureApiClient({...})`에 추가:

```ts
  getGameSession: () => useGameSessionStore.getState().sessionId,
  onSessionReplaced: () => useGameSessionStore.getState().markReplaced(),
```

그리고 `onAuthFailure`와 `logout`의 상태 초기화 지점에서 `useGameSessionStore.getState().reset()`도 호출한다(로그아웃하면 접속도 끝). 순환 import가 생기면(`gameSessionStore`는 아무것도 import하지 않으므로 생기지 않는다) 보고한다.

`mocks/handlers.ts`의 `POST /characters/:id/select`: `return new HttpResponse(null, { status: 204 });`를 `return HttpResponse.json({ game_session_id: crypto.randomUUID() }, { status: 200 });`로 바꾼다(목은 헤더를 검사하지 않는다).

- [ ] **Step 5: 검증과 커밋**

Run: `npx tsc -b && npx vitest run`
Expected: 전체 통과.

```bash
git add src/stores/gameSessionStore.ts src/stores/gameSessionStore.test.ts src/api/client.ts src/api/client.test.ts src/api/characters.ts src/stores/characterStore.ts src/stores/authStore.ts src/mocks/handlers.ts
git commit -m "feat(session): 클라이언트가 접속 ID를 헤더로 보내고, 대체된 접속(409)을 감지

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 안내 모달과 탭을 닫을 때 위치 저장

**Files:**
- Create: `src/components/SessionReplacedModal.tsx`
- Modify: `src/App.tsx` (모달 마운트)
- Modify: `src/components/game/PositionSync.tsx` (pagehide/숨김 저장)
- Modify: `src/api/characters.ts` (`updateCharacterPosition`에 `keepalive` 옵션 경로)
- Modify: `src/api/client.ts` (`ApiRequestOptions.keepalive`)
- Test: `src/components/SessionReplacedModal.test.tsx`, `src/components/game/positionSync.test.ts`(저장 판정 순수 함수)

**Interfaces:**
- Consumes: `useGameSessionStore` (Task 3), `Modal`(`components/ui/modal`), `Button`.
- Produces: `<SessionReplacedModal />` (스토어 `replaced`가 true면 닫을 수 없는 모달; 버튼은 `reset()` 후 `/characters`로 이동), `ApiRequestOptions.keepalive?: boolean`, 순수 함수 `shouldSavePosition(replaced: boolean, hasSession: boolean): boolean`(`PositionSync.tsx`에서 export 하지 말고 `src/components/game/positionSync.ts`로 분리).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/game/positionSync.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldSavePosition } from './positionSync';

describe('shouldSavePosition', () => {
  it('saves for a live session', () => {
    expect(shouldSavePosition({ replaced: false, sessionId: 'abc' })).toBe(true);
  });
  it('does not save once the session was replaced (the server would refuse it anyway)', () => {
    expect(shouldSavePosition({ replaced: true, sessionId: 'abc' })).toBe(false);
  });
  it('does not save without a session id (never entered through select)', () => {
    expect(shouldSavePosition({ replaced: false, sessionId: null })).toBe(false);
  });
});
```

`src/components/SessionReplacedModal.test.tsx`(기존 DOM 테스트 패턴 — `TutorialModal.test.tsx` 참고 — 을 따른다): `replaced`가 false면 아무것도 렌더하지 않고, true면 안내 문구("다른 곳에서 접속")와 버튼이 보이며, Escape 키/배경 클릭으로 닫히지 않고(`dismissible={false}`), 버튼을 누르면 `useGameSessionStore`가 reset되고 `/characters`로 이동한다(`MemoryRouter`와 `useNavigate` 이용).

Run: `npx vitest run src/components/game/positionSync.test.ts src/components/SessionReplacedModal.test.tsx` → FAIL.

- [ ] **Step 2: 구현**

`src/components/game/positionSync.ts`:

```ts
/** A position save is only worth sending for a live session: a replaced one is refused by the server. */
export function shouldSavePosition(state: { replaced: boolean; sessionId: string | null }): boolean {
  return !state.replaced && state.sessionId !== null;
}
```

`src/components/SessionReplacedModal.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { useGameSessionStore } from '../stores/gameSessionStore';

/** Shown on the older tab once another tab/device has taken over the account's game session. */
export function SessionReplacedModal() {
  const replaced = useGameSessionStore((s) => s.replaced);
  const navigate = useNavigate();
  return (
    <Modal
      open={replaced}
      dismissible={false}
      title="다른 곳에서 접속했습니다"
      overlayClassName="z-[2147483647]"
      footer={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            useGameSessionStore.getState().reset();
            navigate('/characters');
          }}
        >
          캐릭터 선택으로
        </Button>
      }
    >
      같은 계정으로 다른 화면에서 게임에 들어와서, 이 화면에서는 더 이상 플레이할 수 없습니다. 진행 상황은 새로 접속한 화면에 이어집니다.
    </Modal>
  );
}
```

`App.tsx`: 라우터 안쪽(`Routes`와 같은 레벨, `useNavigate`가 동작하는 곳)에 `<SessionReplacedModal />`을 마운트한다.

`client.ts`: `ApiRequestOptions`에 `keepalive?: boolean;`을 추가하고 `const init: RequestInit = { method, headers: buildHeaders() };` 다음에 `if (options.keepalive) init.keepalive = true;`.

`api/characters.ts`의 `updateCharacterPosition(body, options?: { keepalive?: boolean })`: 기존 호출에 `options?.keepalive`를 `apiRequest`의 옵션으로 전달한다(시그니처를 읽고 최소 변경으로).

`PositionSync.tsx`: 저장 로직을 한 함수 `save(keepalive: boolean)`로 모으고 15초 주기 호출 외에, `useEffect`로 `window`의 `pagehide`와 `document`의 `visibilitychange`(hidden일 때)에서 `save(true)`를 호출한다(리스너는 언마운트 때 해제). `save`는 `shouldSavePosition({ replaced, sessionId })`(`useGameSessionStore.getState()`에서)가 false면 아무것도 하지 않고, 실패는 `.catch(() => {})`로 무시한다. `current_map_id: mapId`와 반올림 좌표는 기존과 동일하게 보낸다.

- [ ] **Step 3: 검증과 커밋**

Run: `npx tsc -b && npx vitest run && npm run build` 후 `git checkout public/mockServiceWorker.js`.
Expected: 전체 통과, 빌드 성공.

```bash
git add src/components/SessionReplacedModal.tsx src/components/SessionReplacedModal.test.tsx src/App.tsx src/components/game/positionSync.ts src/components/game/positionSync.test.ts src/components/game/PositionSync.tsx src/api/characters.ts src/api/client.ts
git commit -m "feat(session): 대체된 접속 안내 모달과 탭을 닫을 때 위치 저장

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 문서, 푸시, 배포 절차

**Files:**
- Modify: `HANDOFF.md` (접속 제한 섹션)
- Modify: `docs/superpowers/specs/2026-10-01-single-game-session-design.md` (구현과 달라진 점)

- [ ] **Step 1: HANDOFF.md**

"## 한 접속만 유효 (게임 세션)" 섹션을 추가한다(한국어): 동작 방식(select가 `game_session_id` 발급 → 헤더 `x-game-session` → 미들웨어가 활성 캐릭터와 비교 → 409 `session_replaced` → 모달), 파일 위치(`gameSession.ts`, `gameSessionMiddleware.ts`, `gameSessionStore.ts`, `SessionReplacedModal.tsx`, `positionSync.ts`), 규칙(검사는 `/characters/me*`에만, CORS에 `X-Game-Session` 필요, 새 `/me` 라우트는 자동으로 보호됨), **배포 순서**(① 마이그레이션 SQL Editor → ② 프런트 → ③ 엣지 함수), 한계(옛 탭은 자기 다음 요청에서 알게 됨, 두 탭 시나리오는 목 서버로 재현 불가).

- [ ] **Step 2: 스펙 갱신**

CORS 항목, `select` 응답 변경, 모달 위치, 배포 순서를 스펙에 반영한다.

- [ ] **Step 3: 최종 검증과 푸시(프런트까지)**

Run: `npx tsc -b && npx vitest run && npm run build`(`public/mockServiceWorker.js`는 되돌린다). 커밋 후 **프런트 푸시는 마이그레이션이 적용된 뒤에** 한다 — 컨트롤러가 사용자에게 `supabase/migrations/20261001010000_game_session_id.sql`을 SQL Editor에서 실행해 달라고 요청하고, "적용 완료" 확인을 받은 뒤 `git push origin HEAD:main`(프런트 자동 배포), 이어서 엣지 함수를 CLI로 배포한다(`--no-verify-jwt`).

- [ ] **Step 4: 배포 후 확인**

`https://www.roleplaying.kr` 200, `/api/health` 200, `https://roleplaying.kr` 308. 사용자에게 두 탭 시나리오 확인을 요청한다: 탭 A에서 입장 → 탭 B에서 같은 캐릭터로 입장 → 탭 A에서 아무 행동(몬스터 처치, 상점 등)을 하면 "다른 곳에서 접속했습니다" 모달이 뜨는지, 그리고 탭 B의 위치가 A에 덮어쓰이지 않는지. 워크트리 정리.
