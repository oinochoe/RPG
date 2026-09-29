# Handoff — R3F RPG 클라이언트

마지막 업데이트: 2026-09-29

## 다음 개발 순서 (추천, 2026-09-29)

공개 배포(roleplaying.kr + Vercel + Resend 메일 가입)까지 완료된 상태. 남은 일은 이 순서로 진행.

1. ~~**비밀번호 찾기**~~ — **구현 완료(2026-09-29)**, 배포 시 아래 "비밀번호 찾기 배포 절차" 필요.
2. **서버에서 골드·경험치 검증(치트 방지)** — **설계 결정 대기 중.** 지금 `PATCH /characters/me/progress`는
   레벨/경험치/골드/능력치를 클라이언트가 보낸 값 그대로 저장(절대 상한만 검사: 레벨 999, 골드 약 10억,
   공격력 10만). 상점 구매/판매도 골드를 검증하지 않음. 개발자 도구로 조작 가능 → 랭킹 등 경쟁 요소 전에 필수.
   선택지: (A) 변화량 제한만, (B) 경제(골드/아이템)만 서버 권위 + 킬 보고 검증 [추천], (C) 전투 전체 서버 권위.
3. ~~**첫 접속 안내(튜토리얼)**~~ — **구현 완료(2026-09-29)**. 첫 진입 시 자동 표시, 메뉴의 '게임 방법'에서 재열람. 내용은 `src/lib/tutorial.ts`(기기별 문구), 창은 `TutorialModal.tsx`.
4. ~~**`rpg-noel.vercel.app` → `roleplaying.kr` 자동 리다이렉트**~~ — `vercel.json`의 `redirects`로 설정함(임시 307). **배포 후 실제로 이동하는지 확인 필요**(로컬에서 검증 불가). 잘 되면 `permanent: true`로 바꿔도 됨.
5. **모바일 후속 개선** — 실제 기기 테스트 피드백 반영(아래 "모바일 지원" 참고).
6. **콘텐츠** — 업적, 도감, 일일 퀘스트, 랭킹(2번 이후), 파티/채팅은 멀티플레이 이후 별도 설계.
7. **로그인 화면 번들 추가 경량화** — 게임 청크(GamePage)가 아직 큼(~1.1MB). 몬스터/NPC GLTF preload 분할 검토.

## 비밀번호 찾기 배포 절차 (2026-09-29)

코드: `POST /auth/forgot-password`, `POST /auth/reset-password`(Edge Function `auth.ts`),
클라이언트 `/forgot-password`, `/reset-password` 페이지, 로그인 화면의 "비밀번호를 잊으셨나요?" 링크.

1. `supabase functions deploy api` (새 라우트 반영. DB 마이그레이션은 없음).
2. **Supabase Dashboard → Authentication → Email Templates → "Reset password"** 를
   `supabase/templates/recovery.html` 내용으로 교체 (제목: `[RPG] 비밀번호 재설정 안내`).
   링크가 `{{ .SiteURL }}/reset-password?token={{ .TokenHash }}` 여야 클라이언트 페이지로 옴.
   (`config.toml`의 `[auth.email.template.recovery]`는 로컬 개발용, 라이브에는 대시보드에서 직접 적용)
3. Site URL이 `https://roleplaying.kr`(끝에 `/` 없이)이고 Redirect URLs에 `https://roleplaying.kr/**`가 있는지 확인.
4. 확인: 로그인 화면 → "비밀번호를 잊으셨나요?" → 가입한 메일 입력 → 메일 수신 → 링크 → 새 비밀번호 →
   새 비밀번호로 로그인. (링크는 1시간 유효, 1회용. 비밀번호 변경 시 그 계정의 모든 세션이 로그아웃됨.)

설계 메모: 존재하지 않는 이메일에도 똑같이 "메일을 보냈습니다"를 보여줌(계정 유무 노출 방지).
약한 비밀번호는 토큰을 소모하기 전에 거절(클라이언트+서버 모두). 메일 발송 한도는 Supabase Rate Limits를 따름.

## 모바일 지원 (2026-09-29)

폰(`(pointer: coarse)`)에서는 데스크톱과 다른 HUD를 씀. 코드 위치:
- `src/lib/device.ts` — `useIsTouch`, `useViewportSize`
- `src/components/game/TouchHud.tsx` — 가상 조이스틱, 행동 버튼(대화/줍기), 패널 버튼(가방/캐릭/퀘스트/지도/메뉴), 4x2 단축키
- `src/components/game/touchInput.ts` — 조이스틱 값/카메라 기준 방향 변환 (CharacterMesh가 매 프레임 읽음)
- `src/components/game/interactions.ts` — Space(대화)/F4(줍기) 공용 로직 (키보드와 터치 버튼이 공유)
- `useDraggablePanel.ts` — 포인터 이벤트(터치 드래그), 좁은 화면에서는 전체 폭 시트로 고정
- 카메라 줌은 화면 폭에 비례해 축소(`cameraZoomFor`), 폰은 그림자/해상도도 낮춤.
- 단축키 슬롯: 터치는 길게 눌러 해제(데스크톱 우클릭 대응), 등록은 아이템/스킬 상세의 번호 버튼.
- 인벤토리: 터치는 '사용' 버튼으로 주문서를 든 뒤 대상을 한 번 터치(더블클릭 대체).

모바일 확인은 `npm run dev` 후 브라우저 개발자 도구의 기기 에뮬레이션(터치 모드) 또는 실제 기기로.

## 공개 배포 체크리스트 (2026-09-28) — Vercel + 정식 메일(SMTP)

Supabase 기본 메일 발송기는 **프로젝트 팀원 이메일로만** 발송되고 시간당 몇 통으로
제한됨 → 외부인 가입을 받으려면 아래 순서대로 진행.

### 1. 클라이언트 Vercel 배포
1. vercel.com → Add New Project → GitHub `oinochoe/RPG` import (Framework: Vite, 저장소의
   `vercel.json`이 빌드 명령/SPA rewrite 설정을 갖고 있음).
2. Environment Variables: `VITE_API_BASE_URL` = `https://<project-ref>.supabase.co/functions/v1/api/api/v1`
   처럼 로컬 `.env`에 쓰던 **실서버 값 그대로**. (빌드 타임에 주입되므로 바꾸면 재배포 필요)
3. Deploy → 발급된 도메인(예: `https://rpg-xxx.vercel.app`)을 기록.

### 2. Supabase Auth URL
Dashboard → Authentication → URL Configuration
- Site URL: `https://roleplaying.kr` (끝에 `/` 붙이지 말 것)
- Redirect URLs: `https://roleplaying.kr/**`, `https://rpg-noel.vercel.app/**` (로컬 개발용 `http://localhost:5173/**`도 유지)

### 3. 메일 발송(SMTP) 설정 — Resend 기준
1. resend.com 가입(무료: 일 100통/월 3,000통) → Domains에서 본인 도메인 추가 → 안내된
   DNS 레코드(SPF/DKIM) 등록 → Verified 확인. (도메인이 없으면 먼저 구매 필요 —
   `resend.dev` 테스트 발신 주소는 본인에게만 발송됨)
2. API Keys → 키 생성.
3. Supabase Dashboard → Authentication → SMTP Settings → Enable custom SMTP:
   host `smtp.resend.com`, port `465`, user `resend`, password = API 키,
   sender email `no-reply@roleplaying.kr`, sender name `RPG`.
4. Authentication → Rate Limits → "Emails sent per hour"를 30 이상으로.
5. Authentication → Email Templates → Confirm signup: 제목/본문을
   `supabase/templates/confirmation.html` 내용으로 교체 (링크가
   `{{ .SiteURL }}/verify-email?token={{ .TokenHash }}` 형태여야 클라이언트 인증 페이지로 감).
6. 새 이메일로 실제 가입 → 메일 수신 → 링크 클릭 → 로그인까지 확인.

(메일 서비스 없이 급하게 열어야 하면 `supabase secrets set REQUIRE_EMAIL_VERIFICATION=false`
후 함수 재배포 — 가입 즉시 로그인됨. 정식 SMTP 연결 후에는 이 secret을 지울 것.)

### 4. 서버 반영
`supabase db push` (강화 주문서 개편 마이그레이션 포함) → `supabase functions deploy api`.

## Supabase Auth site_url / 이메일 확인 링크 — 수동 조치 필요 (2026-09-15)

Phase 1 최종 전체 브랜치 리뷰에서 발견: `supabase/config.toml`의 `[auth]` 블록에
있던 `site_url`/`additional_redirect_urls`가 `supabase init` 템플릿 기본값
(`http://127.0.0.1:3000`)인 채로 방치되어 있었음. 클라이언트 실제 dev 서버
포트(`5173`)와 맞지 않아, 실제 사용자에게 발송되는 이메일 인증 링크가 깨진
URL로 리다이렉트됨.

- (a) `supabase/config.toml`을 `site_url = "http://localhost:5173"`,
  `additional_redirect_urls = ["http://localhost:5173/**"]`로 커밋해둠 — 이제
  의도한 값이 저장소에 기록되어 있음.
- (b) **중요: `config.toml`의 `[auth]` 블록은 `supabase db push` 등으로 자동
  반영되지 않고, 실제 라이브 GoTrue 설정에 반영하려면 명시적으로
  `supabase config push`를 실행해야 함.** 이 CLI 버전(`supabase config
  --help`로 확인)에 실제로 `config push`/`config diff` 커맨드가 존재하는 걸
  확인했지만, `config push --help`가 스스로 경고하듯 "`supabase init`
  템플릿이 써놓은 값(로컬 개발용 site_url 등)이 실수로 실제 커스터마이징된
  라이브 설정을 덮어쓸 수 있다" — 그리고 `config.toml`에는 site_url 외에도
  다른 `[auth]`/`[storage]` 등 설정이 다수 있어 전체를 한 번에 push하면 의도치
  않은 값까지 라이브에 반영될 위험이 있음. 이번 수정 작업에서는 이 push를
  실행하지 않았음 — **실제 사용자가 가입하기 전에 반드시 Supabase Dashboard →
  Authentication → URL Configuration에서 Site URL/Redirect URLs를 수동으로
  확인·적용할 것** (또는 `supabase config diff`로 먼저 차이를 검토한 뒤 신중하게
  `config push`를 실행할 것).
- (c) 이메일 확인 템플릿도 Dashboard에서 수동 커스터마이징 필요: GoTrue
  기본값은 "호스팅된 verify 페이지 → 리다이렉트" 플로우라서 현재 깨진 URL로
  사용자를 보냄. Authentication → Email Templates → Confirm signup에서 확인
  링크를 `{{ .SiteURL }}/verify-email?token={{ .TokenHash }}` 형태로 바꿔서
  프론트엔드의 `/verify-email` 라우트(`src/pages/VerifyEmailPage.tsx`)로 직접
  토큰을 넘기도록 해야 함.

## 현재 상태

- Phase 1 클라이언트(회원가입~맵 입장) 구현 완료, `main`에 머지됨.
- 실제 BackendX 배포 서버(`https://pool1.backendx.cloud/apps/4a1628b4-7116-4244-973d-55ae3fe4f5f2/api_server`)에 연결해서 실제 연동 테스트 진행 중.
- 로컬 `.env`(git에 커밋 안 됨)에 다음 값 설정되어 있음:
  ```
  VITE_API_BASE_URL=https://pool1.backendx.cloud/apps/4a1628b4-7116-4244-973d-55ae3fe4f5f2/api_server/api/v1
  ```

## 실제 백엔드로 확인된 것 (정상 동작)

- `POST /auth/register` → 201, 실제 이메일로 인증 메일 발송됨
- `POST /auth/login` → 200, `/characters`로 정상 리다이렉트
- `GET /characters` → 200

## 클라이언트에서 발견해서 이미 고친 버그

- **React 18 StrictMode 이중 호출 버그** (`src/pages/VerifyEmailPage.tsx`, 커밋 `08ac836`): 개발 모드에서 `useEffect`가 두 번 실행되면서 1회용 인증 토큰을 두 번 보내 하나는 성공·하나는 실패하고 화면엔 "인증 실패"만 뜨던 문제. `useRef`로 토큰당 한 번만 호출하도록 가드 추가함. 빌드/테스트(16/16) 확인 완료.
- (참고로 `CharactersPage.tsx`도 같은 이유로 `fetchCharacters()`가 두 번 호출되지만, GET이라 무해해서 그대로 둠 — 필요하면 나중에 같은 패턴으로 고칠 것.)

## BackendX API 계약 변경 (Ver 2, 2026-09-14 확인)

BackendX가 API 문서를 업데이트했고, 같은 날 서버도 재배포됨(마이그레이션 `0002_app → 0003_app`). 변경 사항:

- Admin 마스터 데이터 `template_type` enum이 `monsters|items|drops|shops` → **`maps|monsters|items|drops|spawns|skills|quests|shops`로 확장**. 이제 `maps`(시작 맵 등)를 admin API로 관리할 수 있음.
- 새 엔드포인트 추가: **`POST /admin/master-data/{template_type}`**(생성, FR-026), **`DELETE /admin/master-data/{template_type}/{template_id}`**(삭제, FR-027).
- 계정 상태 enum에 `purged` 추가 (`active|suspended|deactivated|purged`).
- ⚠️ **재배포에도 불구하고 캐릭터 생성 500 버그는 그대로임** (위 시도 3 참고) — 이번 재배포는 API 스펙 확장 반영이었지, 이 버그 수정은 아니었던 것으로 보임.
- ⚠️ **2026-09-14 추가 재배포 이후 재확인 — 시도 4: 여전히 500.** `{"name":"DeployCheck","character_class":"warrior"}` → 500, trace_id `9373a5c6e4bd4f749c6a3a81fbb71c79`. 로그인은 정상 동작해서 기존 DB 데이터(가입 계정)는 유지됨. 이번 배포도 이 버그와는 무관한 변경이었던 것으로 보임 — 총 4회 재현.

→ 이제 `POST /admin/master-data/maps`로 시작 맵을 직접 만들 수 있으니, 캐릭터 생성 버그가 "시작 맵 미시딩" 때문이라면 **어드민 계정만 있으면 우리가 직접 고칠 수 있음.**

## BackendX 대시보드 로그에 대한 참고

프로젝트 배포 로그(도커 컨테이너 로그: postgres 초기화, nginx, gunicorn 부팅, 스케줄러 시작 등)는 확인했지만, 이건 **인프라 레벨 로그**라 특정 요청이 왜 500이 났는지 나오는 애플리케이션 에러/스택 트레이스는 아님. 실제로 필요한 건 `api_server` 컨테이너의 요청 처리 로그(Python 예외 스택 트레이스 포함)이고, trace_id로 검색 가능한 애플리케이션 로그/에러 트래킹(Sentry류) 메뉴가 대시보드에 별도로 있는지 계속 확인 필요.

## 다음에 처리해야 할 일

### BackendX 쪽에서 확인/조치 필요

- [ ] **`POST /characters` (캐릭터 생성) 500 Internal Server Error — 재현 확정, BackendX에 문의 필요.**

      **BackendX에 그대로 전달할 리포트:**

      > 프로젝트: `4a1628b4-7116-4244-973d-55ae3fe4f5f2` (api_server)
      > 엔드포인트: `POST /api/v1/characters`
      > 증상: 인증된(이메일 인증 완료) 사용자가 캐릭터를 생성하면 항상 500 Internal Server Error가 발생합니다. 입력값을 바꿔도 재현되는 걸 확인했습니다 (입력값 문제 아님):
      >   - 시도 1: `{"name":"Valerius","character_class":"warrior"}` → 500, trace_id `718c8f28cda0454dae78115b1e172971`
      >   - 시도 2: `{"name":"TestMage","character_class":"mage"}` → 500, trace_id `4fd0f120f4864470908253832fa1ccfa`
      >   - 시도 3 (2026-09-14 서버 재배포/마이그레이션 0002→0003 이후 재시도): `{"name":"RetestHero","character_class":"warrior"}` → 500, trace_id `99e922540e7b44669b59e935d532b7b0` — **재배포 후에도 동일하게 재현됨**, 이 재배포는 이 버그를 고친 게 아니었던 것으로 보임.
      > 요청 헤더에는 로그인으로 발급받은 `Authorization: Bearer <access_token>`이 정상적으로 포함되어 있었습니다.
      > 실패 후 `GET /api/v1/characters`로 확인하면 목록이 비어 있어서 부분 생성 없이 깨끗하게 롤백되는 것으로 보입니다.
      > 추정 원인: 명세(FR-006)상 캐릭터 생성 시 "기본 시작 맵의 생성 위치로 캐릭터를 초기화"해야 하는데, `characters.current_map_id`가 `map_templates.id`를 참조하는 FK라서 시작 맵 마스터 데이터가 아직 시딩되지 않았다면 INSERT가 실패할 수 있습니다. `map_templates`(및 관련 `monster_templates`, `map_monster_spawns`)에 기본 데이터가 들어있는지 확인 부탁드립니다.
      > 대시보드의 "사용량 관리"에는 API 호출 수가 0회로 표시되는데, 실제로는 이 요청들이 DB에 반영되고 있어(9MB 사용량) 사용량 카운터가 실시간이 아닌 것 같습니다 — 요청/에러 로그를 trace_id로 조회할 수 있는 별도 메뉴가 있는지도 궁금합니다.
- [ ] **admin 역할 계정 확보.** 어드민 마스터 데이터 API는 `role: admin`만 호출 가능한데, 지금 테스트 계정(`copstyle@naver.com`)은 일반 `user`임. BackendX 대시보드에 "이 계정을 admin으로 승격"하는 기능이 있는지, 혹은 프로젝트 생성 시 기본 admin 계정이 있는지 확인 필요 — 이게 있어야 어드민 사이트 개발과 맵 시딩을 시작할 수 있음.
- [ ] **이메일 인증 링크가 프론트엔드가 아니라 백엔드 자체 URL로 연결됨** (`.../api_server/auth/verify-email?token=...`, `/api/v1` 프리픽스도 빠져 있어 그대로 두면 404).
      클라이언트를 실제 도메인에 배포한 뒤, BackendX 프로젝트 설정에서 인증 이메일의 콜백/프론트엔드 URL을 `https://<배포된 도메인>/verify-email`로 지정해야 함. 그 전까지는 이메일에서 토큰을 수동으로 추출해서 `/verify-email?token=...`에 직접 넣어 테스트해야 함.

### 클라이언트에 남아있는 경미한 항목들 (기능엔 문제 없음, 여유 될 때)

Phase 1 리뷰 과정에서 나왔던, 의도적으로 미룬 항목들:

- `src/api/client.ts`의 `apiRequest`: 동시에 여러 요청이 401을 맞으면 각각 독립적으로 refresh를 호출함 (현재는 순차 호출만 있어서 문제 없지만, Phase 2에서 전투처럼 동시 요청이 늘면 in-flight refresh 공유 로직 필요).
- `src/stores/authStore.ts`의 `loadStoredTokens()`: localStorage 값이 JSON으로는 유효한데 형태가 이상하면(예: `{}`) 그대로 통과함 — 다음 API 호출에서 401→refresh 실패로 자연 정리되긴 함(self-healing).
- `src/stores/characterStore.ts`의 `fetchCharacters()`: 실패 시 `isLoading`이 `true`로 남아서 스피너 문구와 에러 메시지가 동시에 보임 (기능은 정상).
- `src/mocks/handlers.ts`(로컬 개발용 mock, 프로덕션 미포함): `verify-email`이 모든 유저를 한번에 인증 처리해서 한 브라우저 탭에서 여러 계정 테스트는 안 됨 — 단일 계정 흐름 검증에는 문제 없음.
- 인증 페이지 3개(Register/Login/VerifyEmail)의 폼 마크업이 조금씩 중복됨 — 지금 규모에선 추상화가 오히려 과함, Phase 2에서 화면이 늘면 재검토.

## 재개할 때 순서

1. admin 역할 계정 확보 (BackendX 대시보드에서 승격 또는 기본 admin 계정 확인).
2. admin 계정으로 `POST /admin/master-data/maps`를 호출해서 시작 맵(`map_templates`) 레코드를 하나 만들어보고, 캐릭터 생성이 그걸로 고쳐지는지 확인. (별도 어드민 사이트 없이 curl/Postman으로 먼저 확인해도 됨 — 원인 검증이 목적이면 화면부터 만들 필요는 없음.)
3. 원인이 맞았다면: 어드민 사이트를 새 feature 브랜치로 시작 (마스터 데이터 CRUD: maps/monsters/items/drops/spawns/skills/quests/shops, 공지 게시, 유저 제재 — FR-020~027).
   원인이 아니었다면: BackendX에 위 리포트 그대로 문의.
4. 캐릭터 생성 → 선택 → `/game` 맵 입장까지 실제 백엔드로 끝까지 재검증.
5. (선택) 클라이언트 배포 후 BackendX 이메일 콜백 URL 설정.
6. Phase 2 브레인스토밍: 전투(FR-010~013), 인벤토리/창고/상점(FR-016~018), 퀘스트(FR-019) 등.
