# 한 접속만 유효한 게임 세션 설계

날짜: 2026-10-01 · 정책: **나중 접속이 이김**(사용자 결정)

## 문제

- 서버의 모든 캐릭터 API(`/characters/me/*`)는 요청한 클라이언트가 어느 캐릭터인지 모르고, DB의 **활성 캐릭터**(`is_active`)를 쓴다. `POST /characters/:id/select`가 활성 캐릭터를 바꾼다.
- 그래서 같은 계정으로 탭/기기를 둘 이상 열면 서로 덮어쓴다:
  - 탭 A가 캐릭터 1로 플레이 중에 탭 B가 캐릭터 2를 고르면, A의 위치·진행도·킬 보고·구매가 **캐릭터 2에** 적용된다.
  - 같은 캐릭터를 두 탭이 열어도 방치된 탭이 15초마다 옛 위치를 저장해 최신 위치를 덮어쓴다(`PositionSync`, 15초 주기).
  - 이중 킬 보고/구매로 보상·골드가 꼬일 수 있다.
- 탭을 그냥 닫으면 위치 저장이 없어(저장은 15초 주기 + 명시적 로그아웃뿐) 마지막 15초가 사라진다.
- 증상(사용자 제보): "다시 들어왔을 때 위치가 매번 다르다".

## 목표

- 한 계정은 **동시에 하나의 게임 접속**만 유효하다. 새로 캐릭터를 선택(게임 입장)하면 이전 접속은 무효가 되고, 이전 접속의 요청은 서버가 거부하며 아무것도 저장하지 않는다.
- 옛 접속은 "다른 곳에서 접속했습니다" 안내를 보고 게임을 멈춘다.
- 탭을 닫거나 숨길 때도 위치가 저장된다(유효한 접속에 한해).

성공 기준: 두 탭을 열고 한쪽이 입장하면 다른 쪽은 다음 요청(최대 몇 초 이내)에 안내가 뜨고 이후 서버 상태를 바꾸지 못한다. 한 탭만 쓰는 사람은 아무 차이를 못 느낀다.

## 범위 밖

- 실시간 푸시(웹소켓)로 옛 탭을 즉시 끊기 — 옛 탭은 자기 다음 요청이나 주기 요청(위치 저장 15초, 킬 보고 등)에서 알게 된다. 필요하면 짧은 주기의 가벼운 확인 요청을 추가하는 것은 계획 단계에서 판단.
- 로그인(인증 토큰) 자체를 단일 세션으로 제한하기 — 토큰은 그대로 여러 개 가능, "게임 접속"만 하나.
- 비정상 종료 후 접속 잠금 — 나중 접속이 이기므로 잠금이 없다.

## 설계

### 1. 데이터

`characters`에 `game_session_id uuid NULL` 컬럼을 추가한다(마이그레이션). 활성 캐릭터 행에만 의미가 있다. `select_character` RPC가 활성 캐릭터를 바꿀 때 `gen_random_uuid()`로 만든 새 `game_session_id`를 같은 트랜잭션에서 기록한다(이미 활성인 캐릭터를 다시 골라도 새로 발급). 활성이 아니게 된 캐릭터의 값은 `NULL`로 비운다.

### 2. 서버

- `POST /characters/:id/select`: RPC가 활성 캐릭터와 새 `game_session_id`를 저장하고, 응답은 `{ game_session_id }`다. RPC 결과에 id가 없으면 500 `character_select_failed`.
- 새 미들웨어 `requireGameSession`을 `/characters/me`, `/characters/me/*`와 `/exploration`(입장 `enter-map` 포함) 전체에 건다(`requireAuth` 다음; 새 `/me...`·exploration 라우트는 자동 보호). 구현은 `gameSession.ts`(순수 판정) + `gameSessionMiddleware.ts`: 요청 헤더 `x-game-session`을 활성 캐릭터의 `game_session_id`와 비교한다. 헤더가 없거나 다르면 **409** + 에러 코드 `session_replaced`(한국어 메시지 "다른 곳에서 접속하여 이 접속은 종료되었습니다.")를 반환하고 핸들러를 실행하지 않는다.
- `select`, 캐릭터 목록/생성/삭제(`/characters`, `/characters/:id`)에는 걸지 않는다(접속을 바꾸는 쪽이므로).
- CORS `allowHeaders`에 `X-Game-Session`을 추가했다(`index.ts`). 새 커스텀 헤더는 항상 여기에 추가해야 한다.
- 배포 시점에 이미 열려 있던 옛 클라이언트(헤더 없음)는 첫 요청에서 `session_replaced`를 받고 안내 후 재접속하게 된다 — 의도된 동작으로 간주한다.

### 3. 클라이언트

- `characterStore.select()`가 응답의 `game_session_id`를 받아 **`sessionStorage`**(탭 단위, 새로고침은 유지)와 메모리에 저장한다.
- `src/api/client.ts`의 `apiRequest`가 값이 있으면 모든 요청에 `x-game-session` 헤더를 붙인다(`configureApiClient`에 `getGameSession` 훅 추가).
- 응답이 409 + `session_replaced`이면 `onSessionReplaced` 훅을 호출한다: 게임을 멈추고(위치 저장 중단) "다른 곳에서 접속했습니다" 모달(`SessionReplacedModal`, `App.tsx`에 마운트)을 띄우고, 확인하면 캐릭터 선택 화면으로 이동한다. 이 경우 재시도·토큰 갱신을 하지 않는다.
- 위치 저장 허용 판정은 `src/components/game/savePolicy.ts`(`shouldSavePosition`; 원래 계획의 `positionSync.ts`는 `PositionSync.tsx`와 Windows에서 충돌해 개명). `PositionSync`에 `pagehide`/`visibilitychange(hidden)` 저장을 추가한다: `fetch(..., { keepalive: true })`로 `PATCH /characters/me/position`을 보낸다(헤더 포함; `sendBeacon`은 헤더를 못 쓰므로 사용하지 않는다). 실패는 무시한다(best-effort).

### 4. 오류 처리·보안

- `x-game-session`은 비밀이 아니라 "누가 최신인지"를 가리는 값이다. 인증은 기존 `Authorization`이 담당하고, 서버는 항상 토큰으로 사용자를 확인한 뒤 그 사용자의 **활성 캐릭터** 행과 비교한다.
- 비교는 서버에서만 이루어지고 클라이언트가 값을 위조해도 활성 캐릭터의 현재 값이 아니면 거부된다.
- 위조·재생 시도는 409로 끝나며 상태를 바꾸지 않는다.

### 5. 테스트

- 서버(순수 함수/모킹 가능한 부분): 세션 비교 판정 함수(헤더 없음/다름/같음/활성 캐릭터 없음), 라우트 미들웨어가 409 `session_replaced`를 던지고 핸들러가 실행되지 않음.
- 클라이언트: `apiRequest`가 헤더를 붙임, 409 `session_replaced`에서 훅 호출·재시도 없음, `sessionStorage` 읽기/쓰기 실패 시 안전(try/catch), `PositionSync`의 pagehide 저장이 keepalive로 호출됨(모킹).
- 마이그레이션은 사용자가 SQL Editor로 적용(이 프로젝트의 관례), 엣지 함수는 CLI로 배포(`--no-verify-jwt`).

### 6. 구현 순서 (계획 단계에서 세분화)

1. 마이그레이션 + `select_character` RPC에 세션 ID 기록
2. 서버: 세션 판정 + `requireGameSession` + `select` 응답 + 테스트
3. 클라이언트: 세션 ID 저장, `apiRequest` 헤더, `session_replaced` 처리와 모달
4. `PositionSync` pagehide/hidden 저장
5. 목(MSW) 핸들러 갱신, HANDOFF, 배포

**배포 순서(확정)**: ① SQL Editor에서 마이그레이션 → ② main push(프런트) → ③ CLI로 엣지 함수. 함수를 먼저 올리면 헤더 없는 옛 프런트가 모두 409를 받는다. 두 탭 시나리오는 MSW 목으로 재현되지 않아 실서버에서 확인한다.
