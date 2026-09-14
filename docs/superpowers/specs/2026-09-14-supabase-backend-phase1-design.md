# Supabase 백엔드 — Phase 1 설계 (BackendX 대체)

## 배경 및 범위

BackendX가 생성/호스팅하던 백엔드에서 캐릭터 생성(`POST /characters`)이 결정적으로 500을
반환하는 버그가 있고, 지원 채널(이메일)이 느려서 자체 해결이 불가능한 상태다. 이미
BackendX가 확정해서 준 **DB 스키마 전체(CREATE TABLE)**와 **API 계약(엔드포인트, 요청/
응답 형식, 에러 봉투)**을 그대로 재사용해서, Supabase(Postgres + Auth + Edge Functions)
위에 우리가 직접 통제하는 백엔드를 구축한다.

**핵심 제약: 기존 R3F 클라이언트(`main` 브랜치, Phase 1)는 코드를 바꾸지 않는다.**
`.env`의 `VITE_API_BASE_URL`만 Supabase Edge Function URL로 바꾸면 그대로 동작해야
한다 — 엔드포인트 경로, 요청/응답 JSON 모양, 에러 봉투(`{error, trace_id, message,
field?, reason?}`)를 전부 기존 계약과 동일하게 유지한다.

이 문서는 클라이언트 Phase 1이 실제로 호출하는 범위만 다룬다:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `POST /auth/verify-email`
- `POST /characters`, `GET /characters`, `POST /characters/{id}/select`,
  `DELETE /characters/{id}`, `GET /characters/me`
- `POST /exploration/enter-map`

전투/인벤토리/퀘스트/상점/어드민(FR-010 이후)은 이후 단계.

## Supabase 프로젝트

- 프로젝트명: `rpg-backend` (ref: `rfdxirssgsktnjgslocu`), 리전 `ap-northeast-2`(서울),
  무료 티어.
- Project URL: `https://rfdxirssgsktnjgslocu.supabase.co`

## DB 스키마

BackendX가 준 CREATE TABLE 정의를 **그대로** 마이그레이션으로 이관한다(전투/인벤토리
등 이후 단계에서 쓸 테이블도 한 번에 생성 — 스키마 존재 자체는 비용이 없고, 나중에
FK로 얽힌 테이블을 따로 추가하는 것보다 한 번에 넣는 게 안전하다): `users`,
`map_templates`, `monster_templates`, `item_templates`, `skill_templates`,
`quest_templates`, `monster_drop_templates`, `map_monster_spawns`, `monster_instances`,
`characters`, `character_skills`, `character_inventory`, `character_quests`,
`announcements`, `scheduler_jobs`.

**Supabase Auth 연동을 위한 유일한 스키마 추가:** `users` 테이블에
`auth_user_id uuid unique references auth.users(id) on delete cascade` 컬럼을 추가한다.
기존 `users.id`(int, 앱 전체에서 FK로 참조되는 식별자)는 그대로 유지하고, Supabase
Auth가 발급하는 UUID는 이 컬럼으로만 연결한다 — `characters.user_id` 등 기존 FK
관계를 하나도 바꾸지 않기 위함이다.

**RLS:** 모든 테이블에 RLS를 켠다. `characters`, `character_inventory`,
`character_skills`, `character_quests`는 `auth.uid()` → `users.auth_user_id` →
`users.id`로 연결해 소유자만 접근 가능하도록 정책을 건다(도우미 SQL 함수
`current_app_user_id()`로 조회). `map_templates` 등 마스터 데이터 테이블은 인증된
사용자에게 읽기만 허용한다. Edge Function은 `service_role` 키로 동작해 RLS를
우회하고 코드 레벨에서 소유권을 검증한다(FR 명세의 서버 권위 모델과 일치) — RLS는
PostgREST Data API로 직접 노출됐을 때를 대비한 방어선이다.

**시작 맵 시딩:** `map_templates`에 기본 필드맵 1개를 마이그레이션에 포함해 미리
넣는다(BackendX 쪽에서 이게 빠져서 캐릭터 생성이 실패했다는 게 우리 가설이었다 —
여기서는 처음부터 넣어서 그 문제를 원천 차단한다).

## Auth

Supabase Auth(GoTrue)를 사용하되, 클라이언트 계약이 Supabase의 기본 REST 응답
형식과 다르므로 Edge Function에서 얇은 어댑터로 감싼다:

- `register`: `supabase.auth.admin.createUser()` 또는 `signUp()`으로 계정 생성 →
  `users` 테이블에 대응 행 삽입(`auth_user_id` 연결, `role='user'`, `status='active'`).
  이메일 인증 메일은 Supabase가 자체 발송.
- `login`: `signInWithPassword()` → 성공 시 Supabase의 `access_token`/
  `refresh_token`을 계약 형식(`{access_token, refresh_token}`)으로 그대로 전달.
- `refresh`: `refreshSession()` 래핑.
- `logout`: `signOut()` 또는 refresh token revoke, 204 반환(멱등).
- `verify-email`: Supabase 이메일 템플릿의 리다이렉트 URL을
  `{사이트 URL}/verify-email?token={{ .TokenHash }}`로 커스터마이즈하고,
  Edge Function이 `verifyOtp({ token_hash: token, type: ... })`로 검증 —
  클라이언트가 보내는 `{token}` 바디 형식을 그대로 유지하기 위함. 정확한 `type`
  값(`signup`/`email` 등, Supabase 버전에 따라 다를 수 있음)은 구현 시 최신
  Supabase 문서로 확인 후 확정한다(추측으로 코드에 박아넣지 않는다).

**에러 매핑:** Supabase Auth 에러(예: `email not confirmed`, `invalid credentials`)를
계약의 `reason` 코드(`invalid_credentials`, `email_already_registered`,
`token_expired_or_invalid` 등)로 변환하는 매핑 테이블을 어댑터 안에 둔다.

## Edge Function 구조

**하나의 Edge Function(`api`)**으로 전체 라우팅을 처리한다 (Hono 같은 경량 라우터
사용). 배포 URL은 `https://rfdxirssgsktnjgslocu.supabase.co/functions/v1/api`이고,
클라이언트의 `VITE_API_BASE_URL`을 이 값으로 설정하면 기존 `apiRequest()`가 이미
경로를 `${BASE_URL}/auth/register`처럼 이어붙이므로 그대로 맞물린다. 함수를
여러 개로 쪼개지 않는 이유: 지금 범위(11개 엔드포인트)에서는 배포/버전 관리가
하나로 묶여 있는 게 더 단순하고, 콜드 스타트도 함수당이 아니라 한 번만 감수하면
된다.

내부 구성(단일 함수 안 폴더 구조): `auth.ts`(인증 어댑터), `characters.ts`(캐릭터
CRUD + 활성 프로필), `maps.ts`(맵 입장), `errors.ts`(공통 에러 봉투 헬퍼),
`supabaseAdmin.ts`(service_role 클라이언트 생성).

**캐릭터 생성 트랜잭션:** 레벨1 기본 능력치·골드 100·시작 맵 배정을 Postgres
함수(RPC, `SECURITY DEFINER` 아님 — Edge Function이 이미 service_role이므로 불필요)
하나로 묶어 원자적으로 처리한다. FR-006 그대로: 이메일 미인증이면 403
`email_unverified`, 이름 중복이면 409 `name_already_taken`, 활성 캐릭터 4개
초과면 400 `max_characters_reached`.

## 테스트 전략

- `supabase functions serve`로 로컬 실행 + curl로 각 엔드포인트 계약 검증
  (요청/응답 모양이 기존 BackendX 계약과 일치하는지가 핵심 기준).
- 로컬 검증 후 배포하고, 기존 R3F 클라이언트의 `.env`만 이 프로젝트의 함수 URL로
  바꿔서 실제 브라우저로 회원가입~맵 입장 전체 흐름 재검증(Task 10과 동일한
  절차, mock 대신 이번엔 우리가 만든 진짜 백엔드로).

## 가정 및 미해결 사항

- Supabase Auth의 이메일 발송 도메인/발신자는 기본 제공 SMTP를 우선 사용하고,
  전송량 제한에 걸리면 그때 커스텀 SMTP(Resend 등) 연동을 검토한다.
- 프론트엔드가 아직 배포되지 않았으므로 Supabase Auth의 Site URL은 우선
  `http://localhost:5173`으로 설정하고, 실제 배포 시 갱신한다.
- 클라이언트의 401→refresh 로직(`src/api/client.ts`)은 이미 `POST /auth/refresh`
  호출 방식이므로 변경 불필요 — Edge Function이 같은 계약으로 응답하는 한
  클라이언트는 백엔드가 바뀐 걸 모른다.
