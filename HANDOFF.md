# Handoff — R3F RPG

마지막 업데이트: 2026-09-29

운영: https://www.roleplaying.kr (Vercel) · 서버: Supabase 프로젝트 `rpg-backend`
(ref `rfdxirssgsktnjgslocu`, ap-northeast-2)의 Edge Function `api` + Postgres.
완료된 작업은 여기서 지운다 — 이력은 git log와 `docs/superpowers/`를 볼 것.

## 할 일

### 바로 할 수 있는 작은 것
- [ ] **마이그레이션 이력 정리.** 리모트 `supabase_migrations` 이력의 버전 번호가 로컬 파일명과 달라서
      `supabase db push`를 쓸 수 없다(아래 "배포 방법"). 게다가 SQL Editor로 직접 적용한
      `20260929010000_server_authoritative_economy`, `20260929030000_atomic_inventory_grant`는 이력에 기록이
      없다. 이력을 로컬과 맞추거나(repair), "SQL로만 적용" 규칙을 정하고 문서화할 것.
- [ ] **동시 줍기 실측.** `grant_inventory_item`의 락은 표준 방식이지만 단일 연결 Postgres(PGlite)로만
      검증했다. 실제로 몹 여러 마리를 잡고 드랍을 연달아 주워 물약이 한 칸에 합쳐지는지 계속 관찰.

### 기능
- [ ] **모바일 후속 개선** — 실제 기기 테스트 피드백 반영(아래 "모바일 지원" 참고).
- [ ] **콘텐츠** — 업적, 도감, 일일 퀘스트, 랭킹(경제가 서버 권위가 됐으니 가능). 파티/채팅은 멀티플레이 이후 별도 설계.

### 비주얼 (밝은 UI는 끝, 월드가 남음)
- [ ] **3D 월드의 톤 맞추기(툰 룩).** UI는 밝은 톤으로 바뀌었지만 지형/조명/안개/몬스터·캐릭터 재질은 아직 옛 톤이다.
      `meshStandardMaterial`을 툰 셰이딩 + 외곽선 + 색감 보정으로 바꾸는 트랙(모델은 그대로 두고 재질만).
- [ ] **아이템 아이콘(`itemIcons.tsx`)과 지도 그림(`WorldMap`/`MiniMap`의 SVG) 색을 새 팔레트로.**
- [ ] **전투 이펙트/타격감**(스킬별 파티클, 히트 멈춤, 카메라 흔들림) — 새 토큰 색을 쓸 것.
### 성능
- [ ] **게임 청크(GamePage) 경량화** — 아직 큼(~1.1MB). 몬스터/NPC GLTF preload 분할 검토.

### 보안 (큰 작업)
- [ ] **전투 전체를 서버가 관리하는 C안.** 지금은 경제(골드/경험치/레벨/스탯/드랍)만 서버 권위(B안)라, API를
      직접 호출하는 스크립트가 킬을 가장해 파밍하는 건 속도/레벨 상한으로 이득만 제한할 뿐 막지 못한다.
      완전히 막으려면 몬스터 인스턴스/데미지/이동 검증이 필요.

### 클라이언트 경미한 항목 (기능엔 문제 없음, 여유 될 때)
- [ ] `src/api/client.ts`의 `apiRequest`: 동시에 여러 요청이 401을 맞으면 각각 refresh를 호출함. 전투처럼 동시 요청이 늘었으니 in-flight refresh 공유 필요.
- [ ] `src/stores/authStore.ts`의 `loadStoredTokens()`: localStorage 값이 JSON으로는 유효한데 형태가 이상하면(예: `{}`) 그대로 통과함(다음 호출의 401→refresh 실패로 자연 정리됨).
- [ ] `src/stores/characterStore.ts`의 `fetchCharacters()`: 실패 시 `isLoading`이 `true`로 남아 스피너와 에러가 동시에 보임.
- [ ] `src/pages/CharactersPage.tsx`: StrictMode에서 `fetchCharacters()`가 두 번 호출됨(GET이라 무해).
- [ ] 인증 페이지 3개(Register/Login/VerifyEmail)의 폼 마크업이 조금씩 중복됨 — 화면이 더 늘면 재검토.

## 배포 방법

**순서(중요): DB → 서버 함수 → 클라이언트.** 클라이언트가 먼저 나가면 새 API가 아직 없어 깨진다.

1. **DB 마이그레이션.** `supabase db push`는 쓰지 말 것 — 리모트 이력의 버전 번호가 로컬 파일명과
   달라서 이미 적용된 마이그레이션을 전부 다시 적용하려 든다. 대신 Supabase 대시보드 → SQL Editor에
   `BEGIN; … COMMIT;`으로 감싼 SQL을 붙여 실행한다(실패하면 통째로 롤백). 적용 후 `execute_sql`로
   새 테이블/함수와 기존 데이터(캐릭터 수, 골드 합 등)가 그대로인지 확인.
   (`supabase db query --linked -f 파일`은 임시 로그인 접속이 끊길 수 있다. 실패하면 SQL Editor를 쓸 것.)
2. **서버 함수:** `npx -y supabase@latest functions deploy api --project-ref rfdxirssgsktnjgslocu --no-verify-jwt`
   (`verify_jwt`는 꺼져 있고 인증은 함수 안의 `requireAuth`가 한다.) 배포 후 `/api/health`로 확인.
3. **클라이언트:** `main`에 푸시하면 Vercel이 자동 배포. 환경변수 `VITE_API_BASE_URL`은 빌드 타임에
   주입되므로 바꾸면 재배포 필요.

DB/함수와 클라이언트 사이에는 잠깐 구 클라이언트와 새 서버가 섞인다. 새로고침하면 해결.

**Vercel 도메인.** Primary는 `www.roleplaying.kr`, 루트 `roleplaying.kr`은 Vercel Domains에서 www로 308
리다이렉트한다. **`vercel.json`에 www↔루트 리다이렉트를 넣지 말 것** — Domains 설정과 맞물려 무한 루프가 된다.

**Supabase Auth 설정(대시보드에서 직접).**
- Authentication → URL Configuration: Site URL `https://www.roleplaying.kr`(끝에 `/` 없이),
  Redirect URLs `https://www.roleplaying.kr/**` (+ 로컬 개발용 `http://localhost:5173/**`).
- Email Templates: Confirm signup ← `supabase/templates/confirmation.html`,
  Reset password ← `supabase/templates/recovery.html`. 링크는 각각
  `{{ .SiteURL }}/verify-email?token={{ .TokenHash }}`, `{{ .SiteURL }}/reset-password?token={{ .TokenHash }}`
  형태여야 클라이언트 페이지로 온다. (`config.toml`의 템플릿 설정은 로컬 개발용.)
- SMTP: Resend(`smtp.resend.com:465`, user `resend`, 발신 `no-reply@roleplaying.kr`). Supabase 기본 메일러는
  팀원에게만 보내고 시간당 몇 통으로 제한된다. Rate Limits의 "Emails sent per hour"는 30 이상으로.
- **`config.toml`의 `[auth]` 블록은 자동 반영되지 않는다.** 라이브에 반영하는 `supabase config push`는 로컬 개발용
  값이 라이브 설정을 덮어쓸 수 있어 위험하니, 쓰기 전에 `supabase config diff`로 먼저 차이를 볼 것.
- 메일 서비스 없이 급히 열어야 하면 `supabase secrets set REQUIRE_EMAIL_VERIFICATION=false` 후 함수 재배포
  (가입 즉시 로그인). SMTP를 연결한 뒤에는 이 secret을 지울 것.

## UI 디자인 시스템

밝은 스타일라이즈드 톤. 설계와 결정은 `docs/superpowers/specs/2026-09-29-ui-design-system-design.md`. 사용 규칙:

- **색은 토큰으로만.** Tailwind 유틸(`bg-cream`, `text-ink`, `border-edge`, `shadow-chunk`)이나 인라인 스타일의 `var(--color-…)`,
  three.js에서는 `src/lib/theme.ts`의 `THEME`. 새 hex 리터럴을 UI에 넣지 말 것. 토큰을 추가하면 `index.css`와 `theme.ts`
  둘 다 고친다(테스트가 어긋남을 잡는다).
- **글자에는 `ink`/`ink-soft`/`*-ink`만.** `gold`, `sky`, `mint` 같은 밝은 포인트색은 크림 위에서 안 읽힌다(장식·배경용).
  새 글자/배경 조합을 쓰면 `theme.test.ts`의 `PAIRS`에 추가해 대비(AA 4.5:1)를 검사할 것.
- **새 창은 `GamePanel`**, 아이템 칸은 `Slot`, 버튼은 `Button`/`IconButton`, 대화상자는 `Modal`. `/dev/ui`에 모든 부품이 있다.
  터치 요소는 44px 이상(`Button`/`IconButton`은 자동).
- **툴팁은 `useTooltip`으로.** 말풍선을 패널 안에 절대 위치로 그리면 스크롤되는 패널의 가장자리에서 가로 스크롤이 생기므로,
  포털로 `document.body`에 고정 좌표로 그린다(패널의 overflow에 영향받지 않음). 직접 만들지 말 것.
- **폰 HUD 크기(`hudLayout.ts`)를 바꾸면** 패널이 HUD를 가리지 않는지(`TOUCH_TOP_INSET`, `TOUCH_LEFT_COLUMN`) 폰 폭에서 확인.
- Google Fonts(Jua, Noto Sans KR)를 `index.html`에서 불러온다. 오프라인이면 시스템 글꼴로 대체된다.

## 경제 서버 권위 (동작/주의)

골드·경험치/레벨·스탯 포인트·파생 능력치·아이템 지급은 **서버(DB)가 유일한 원본**이다. 클라이언트는 화면
반응성을 위해 로컬에서 먼저 예측하고, 서버 응답의 `progress` 스냅샷으로 덮어쓴다. 설계와 한계는
`docs/superpowers/specs/2026-09-29-server-authoritative-economy-design.md`.

- `PATCH /characters/me/progress`는 `current_hp`/`current_mp`만 받는다. 레벨/경험치/골드/능력치는 서버가
  킬 보고(`POST /me/kills`), 퀘스트 보상, 상점, 스탯 배분(`POST /me/stats/allocate`)으로만 바꾼다.
- 드랍은 서버가 굴리고 1회용 티켓(`pending_drops`, 5분 유효)을 발급한다. 드랍 표는
  `supabase/functions/api/drops.ts` — 확률을 바꾸려면 여기를 고치고 함수를 재배포. 만료된 티켓은 그
  캐릭터의 다음 드랍 발급 때 지워진다.
- 몬스터 레벨 상한/보스 표는 `economyRules.ts`. **몬스터나 던전 층을 추가하면(레벨이 상한을 넘으면) 정상 처치도
  거절되므로** 이 표를 같이 고쳐야 한다 — `src/stores/serverEconomy.test.ts`가 어긋나면 실패해 알려준다.
- 킬 속도 제한: 초당 1.5킬, 순간 최대 25킬(SQL `apply_kills`의 상수).
- **아이템 지급(줍기/구매/퀘스트 보상)은 반드시 `grant_inventory_item` RPC로 한다.** 함수에서 "스택 조회 후
  삽입"을 직접 하면 동시 요청이 겹칠 때 같은 물약이 여러 행으로 쪼개진다(과거 버그).

## 테스트

- 클라이언트/규칙: `npm test` (서버 규칙과 클라이언트 예측의 일치, 몬스터 레벨 상한, 드랍 확률 포함)
- 서버 라우트(가짜 DB): `npx deno test --no-check --config supabase/tests/api/deno.json --allow-env --allow-read supabase/tests/api`
- 서버 타입체크: `cd supabase/functions/api && npx deno check --config deno.json index.ts` — 오류 0개여야 한다.
  supabase-js `.select("…")`는 **하나의 문자열 리터럴**로 쓸 것. `"a" + "b"`로 이으면 리터럴 타입이 `string`으로 넓어져
  결과 행이 전부 `GenericStringError`로 무너진다(`fetchInventory`에서 있었던 오류 9개의 원인).
  서버 라우트 테스트를 `--no-check`로 돌리는 건 의도다: 테스트에서는 `supabaseAdmin`이 가짜 DB로 교체되는데 가짜의
  타입이 진짜 supabase-js보다 느슨해서, 테스트 기준으로 타입 검사를 하면 실제 코드 문제가 아닌 오류가 나온다.
- SQL은 가짜 DB 테스트로 검증되지 않는다. 마이그레이션/RPC를 고치면 메모리 Postgres(`@electric-sql/pglite`)나
  로컬 Postgres에 전체 마이그레이션을 적용해 RPC를 직접 호출해 확인할 것.
- 이 저장소의 `node_modules`를 다른 폴더에 정션으로 연결해 vitest를 돌리면 `toBeInTheDocument` 오류로 테스트가
  대량 실패한다. 워크트리에서는 `npm ci`로 실제 설치할 것.

## 모바일 지원

폰(`(pointer: coarse)`)에서는 데스크톱과 다른 HUD를 쓴다. 코드 위치:
- `src/lib/device.ts` — `useIsTouch`, `useViewportSize`
- `src/components/game/TouchHud.tsx` — 가상 조이스틱, 행동 버튼(대화/줍기), 패널 버튼(가방/캐릭/퀘스트/지도/메뉴), 4x2 단축키
- `src/components/game/touchInput.ts` — 조이스틱 값/카메라 기준 방향 변환 (CharacterMesh가 매 프레임 읽음)
- `src/components/game/interactions.ts` — Space(대화)/F4(줍기) 공용 로직 (키보드와 터치 버튼이 공유)
- `useDraggablePanel.ts` — 포인터 이벤트(터치 드래그), 좁은 화면에서는 전체 폭 시트로 고정
- 카메라 줌은 화면 폭에 비례해 축소(`cameraZoomFor`), 폰은 그림자/해상도도 낮춤.
- 단축키 슬롯: 터치는 길게 눌러 해제(데스크톱 우클릭 대응), 등록은 아이템/스킬 상세의 번호 버튼.
- 인벤토리: 터치는 '사용' 버튼으로 주문서를 든 뒤 대상을 한 번 터치(더블클릭 대체).

모바일 확인은 `npm run dev` 후 브라우저 개발자 도구의 기기 에뮬레이션(터치 모드) 또는 실제 기기로.
