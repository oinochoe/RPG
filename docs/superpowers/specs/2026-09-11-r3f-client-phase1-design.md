# R3F 클라이언트 — Phase 1 설계 (인증 + 캐릭터 생성/선택 + 기본 맵 입장)

## 배경 및 범위

이 프로젝트는 등각 투영(isometric) 싱글 플레이어 웹 RPG다. 백엔드 API와 DB는
[BackendX](https://www.backendx.ai/)가 첨부된 기능 명세(FR-001~FR-025, 데이터
모델, 보안/수명주기/확장성 요구사항)를 바탕으로 자동 생성하며, 배포도 별도로
진행한다. 이 저장소(`rpg`)는 **클라이언트 전용**이며, React Three Fiber(R3F)로
구현한다.

전체 기능(인증~전투~인벤토리~거래~퀘스트)은 한 번에 만들기엔 범위가 너무 크므로
단계별로 나눈다. 이 문서는 **Phase 1**만 다룬다.

**Phase 1 목표:** 회원가입 → 이메일 인증 → 로그인 → 캐릭터 생성/선택 → 맵
입장까지의 흐름이 실제 백엔드 API와 연동되어 동작하는 것.

**Phase 1 범위에 포함되는 FR:**
- FR-001 사용자 등록
- FR-002 로그인 및 세션 관리
- FR-003 이메일 인증
- FR-006 캐릭터 생성
- FR-007 캐릭터 목록 조회 및 선택
- FR-008 캐릭터 삭제
- FR-024 활성 캐릭터 전체 프로필 조회
- FR-009 맵 입장 및 던전 인스턴스화 (필드 맵 입장만; 던전 인스턴스 생성 로직은
  화면에 그대로 반영하되 별도 UI는 만들지 않음)

**Phase 1 범위에서 제외 (다음 단계 이후):**
- 전투(FR-010~013), 스킬/강화(FR-014~015), 인벤토리/은행/상점(FR-016~018),
  퀘스트(FR-019), 공지(FR-020), 관리자 기능(FR-021~023)
- 비밀번호 재설정(FR-004), 계정 비활성화(FR-005) — 화면 자체는 이번 단계에서
  만들지 않음
- 실제 3D 아트 에셋 (캐릭터/몬스터/맵은 플레이스홀더 지오메트리로 대체)
- 캐릭터 이동, 카메라 조작, 전투 판정 등 실시간 게임플레이 로직

## 기술 스택

- Vite + React 18 + TypeScript
- React Three Fiber + drei (3D 렌더링, Orthographic 카메라로 등각 투영 구현)
- Zustand (전역 상태: 인증, 캐릭터, 세션)
- React Router (화면 라우팅)
- Vitest + React Testing Library (로직 단위 테스트)

## 아키텍처

- 인증/캐릭터 관련 화면(`/login`, `/register`, `/verify-email`, `/characters`)은
  일반 DOM 기반 React 컴포넌트로 구현한다.
- `/game` 라우트에 진입할 때만 R3F `<Canvas>`를 마운트한다. 폼 위주 화면에서
  3D 캔버스를 유지할 이유가 없고, 초기 로딩 비용도 줄어든다.
- 라우트 가드: 미인증 사용자는 `/login`으로, 이메일 미인증 사용자는
  `/verify-email` 안내 화면으로, 활성 캐릭터가 없는 사용자는 `/characters`로
  리다이렉트한다.

## 상태 관리 (Zustand)

- `authStore`: `accessToken`, `refreshToken`, `user`(id, email, emailVerified),
  `login()`, `logout()`, `setTokens()`
  - 토큰은 `localStorage`에 저장해 새로고침 후에도 유지한다.
- `characterStore`: `characters`(목록 요약), `activeCharacter`(FR-024 전체
  프로필), `fetchCharacters()`, `selectCharacter()`, `createCharacter()`,
  `deleteCharacter()`
- `sessionStore`: 현재 맵 메타데이터, `monsters` 배열(FR-009 응답 그대로),
  `enterMap()`

## API 계약 (BackendX 공개 API 문서 기준, 확정)

모든 엔드포인트는 `/api/v1` 접두사를 가진다. 에러 응답은 다음 봉투를 따른다:

```json
{ "error": "validation_failed", "trace_id": "req_...", "message": "...", "field": "email", "reason": "weak_password" }
```

`message`는 `en-US` 기준이므로 클라이언트에서 `reason` 코드를 기준으로 한국어
메시지를 매핑해서 보여준다(원문 `message`는 폴백/디버그용으로만 사용).

**Phase 1에서 사용하는 엔드포인트:**

| 메서드 | 경로 | 인증 | 비고 |
|---|---|---|---|
| POST | `/auth/register` | 공개 | 201 성공, 409 중복, 400 검증 실패 |
| POST | `/auth/login` | 공개 | 200 시 `{access_token, refresh_token, ...}` |
| POST | `/auth/refresh` | 공개 | body: `refresh_token`; 401 시 재사용/만료 |
| POST | `/auth/logout` | 인증 | body: `refresh_token`; 204 (멱등) |
| POST | `/auth/verify-email` | 공개 | body: `token` |
| POST | `/characters` | 인증+이메일인증 | body: `name`, `character_class` |
| GET | `/characters` | 인증 | 쿼리 `page`,`page_size`; 응답 `{items, page, page_size, total}` |
| POST | `/characters/{id}/select` | 인증, 소유자만 | 없으면 404 `character_not_found` |
| DELETE | `/characters/{id}` | 인증, 소유자만 | 소프트 삭제 |
| GET | `/characters/me` | 인증 | 활성 캐릭터 없으면 404 `no_active_character` |
| GET | `/characters/{id}` | 인증, 소유자만 | 타인 캐릭터는 404로 위장 |
| POST | `/exploration/enter-map` | 인증 | body: `map_id` |

`GET /characters`가 배열이 아니라 **페이지네이션 봉투**(`{items, page, page_size, total}`)로
온다는 점이 설계 초안과 다르다 — `characterStore.fetchCharacters()`는 `items`를
꺼내 저장한다.

## API 레이어

- `src/api/client.ts`: fetch 래퍼.
  - Base URL은 환경변수(`VITE_API_BASE_URL`)로 주입 (`/api/v1`까지 포함).
    BackendX 배포 도메인이 나오면 `.env`에 채운다 (현재는 도커 이미지
    `registry.backendx.ai/bx-4a1628b4-.../api_server`로만 존재, 퍼블릭 URL 미정).
  - 모든 요청에 `Authorization: Bearer <accessToken>` 자동 첨부.
  - 에러 응답은 위 봉투 형식으로 파싱해서 `ApiError`(error, reason, field?, message, traceId) 타입으로 throw.
  - 401 응답을 받으면 `POST /auth/refresh`로 1회 재발급 시도 후 원 요청 재시도;
    refresh도 401이면 로그아웃 처리.
- `src/api/auth.ts`: `register()`, `login()`, `refreshSession()`, `logout()`, `verifyEmail()`
- `src/api/characters.ts`: `listCharacters()`, `createCharacter()`,
  `selectCharacter()`, `deleteCharacter()`, `getActiveCharacterProfile()`,
  `getCharacterProfile(id)`
- `src/api/maps.ts`: `enterMap(mapId)`

## R3F 씬 (Phase 1)

- Orthographic 카메라를 고정 각도(예: 45°)로 배치해 등각 투영 느낌을 낸다.
- 캐릭터: `character_class`별로 색상만 다른 박스/캡슐 메시로 표시.
- 몬스터: FR-009 응답의 `monsters` 배열을 순회하며 각 `position_x/y/z`에
  박스 메시 배치, `name`/`level`을 위에 라벨(HTML overlay 또는 drei
  `<Html>`)로 표시.
- 바닥: 단색 평면(`map_type`에 따라 색만 다르게).
- 이동/공격 등 인터랙션 없음 — 맵 입장 결과를 시각적으로 확인하는 정적 씬.

## 에러 처리

- API 에러는 FR 명세의 `reason` 코드를 기준으로 폼 필드 에러 메시지에
  매핑한다(예: `email_already_registered` → 이메일 입력 필드 아래 메시지).
- 처리되지 않은 에러는 공통 토스트/배너로 `message` 필드를 그대로 노출한다.

## 테스트 전략

- `src/api/*`, `src/stores/*`: Vitest 유닛 테스트 (mock fetch로 성공/에러
  케이스 검증)
- 화면 흐름은 개발 서버를 띄워 브라우저로 직접 구동 확인 (회원가입 → 이메일
  인증 → 로그인 → 캐릭터 생성 → 캐릭터 선택 → 맵 입장까지 눈으로 확인)
- BackendX 배포가 아직이면 로컬 mock 서버(예: msw)로 API 응답을 흉내내
  화면 흐름을 검증하고, 실제 배포 후 base URL만 바꿔 재검증한다.

## 가정

- API 계약은 BackendX가 제공한 공개 API 문서(엔드포인트 표, 에러 봉투, DB
  스키마)를 그대로 따른다. 실제 배포 도메인만 아직 미정이라 `VITE_API_BASE_URL`
  환경변수로 분리해뒀다.
- 이메일 인증 링크 클릭 후 도달하는 화면은 클라이언트의 `/verify-email?token=...`
  라우트로 가정한다(백엔드가 이 URL로 리다이렉트하거나, 사용자가 토큰을 직접
  붙여넣는 형태 둘 다 지원).
- 3D 아트 에셋은 이후 단계에서 교체하며, Phase 1에서는 플레이스홀더로 충분하다.
- 이메일 미인증 사용자의 캐릭터 생성 차단은 별도의 `RequireEmailVerified` 라우트
  가드 없이, API가 반환하는 403 `email_unverified` 에러를 `CharactersPage`에서
  `translateApiError`로 안내 메시지를 보여주는 방식으로만 처리한다(의도적인
  Phase 1 범위 제한). "이메일 인증이 필요합니다" 전용 화면이 필요해지면 이후
  단계에서 선제적 라우트 가드 도입을 재검토한다.
