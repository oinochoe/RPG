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

### 비주얼 (밝은 UI와 3D 툰 룩은 끝, 세부가 남음)
- [ ] **아이템 아이콘(`itemIcons.tsx`)과 아이템 드랍 빛 색, 지도 그림 바깥 프레임·일부 구역 덮개(`WorldMap`)를 새 팔레트로.**
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

## 폰 조작

- 폰에는 키보드가 없으니 **공격은 '행동' 버튼**이 맡는다: NPC/드랍이 없으면 근처(12칸 이내) 가장 가까운 몬스터를 공격 대상으로 잡고 다가가 때린다
  (`engage.ts`의 `attackNearestMonster`, 버튼은 '공격'으로 바뀌고 붉은색). 몬스터를 직접 탭해도 되지만 폰에서는 몬스터가 ~20px라
  탭 판정 영역을 화면상 최소 26px 반경으로 키워 뒀다(`MonsterMesh`의 `HIT_RADIUS_PX`). 클릭과 버튼이 같은 `engageMonster`를 쓴다.
- **스킬은 단축키 칸을 탭하면 바로 발동**한다(`castSkillOnTouch`): 지금 싸우는 몬스터, 없으면 가장 가까운 몬스터에게. 근처에 몬스터가 없으면
  조준 상태로 남고 한 번 더 탭하면 발동/취소. 데스크톱은 그대로(숫자 키로 조준 → 몬스터 클릭). 물약은 칸을 탭하면 사용.
- **NPC는 클릭/탭으로 대화**할 수 있다: 가까우면 바로, 멀면 옆까지 걸어가서 도착하면 상점/퀘스트 창이 열린다(`clickToTalk`,
  `moveTarget.talkTarget`). 마을의 상점·퀘스트 NPC만(`NPC`의 `talk` 속성). 필드의 장식 NPC는 대화 없음.
- **모델 크기 보정은 `modelScale.ts`의 `fitScale`로, `scale` 속성으로 넘긴다.** 모델 파일이 표시 크기보다 3~6배 커서(선인장 6배)
  effect로 보정하면 나타난 첫 프레임에 원본 크기로 번쩍이고, layout effect는 (1) 뼈대 행렬이 아직 없어 측정이 틀리고(어떤 몬스터는 ~100배 작게)
  (2) 크기를 바꿀 그룹의 ref가 부모에 있으면 아직 연결 전이라 아예 실행이 안 된다(NPC가 거대해진 원인). `fitScale`은 로드된 원본 모델을
  뼈대·부모 위치와 무관하게 한 번 측정해 첫 렌더부터 올바른 크기를 준다. 새 모델을 추가할 때도 이 방식으로.

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

## 3D 월드 (툰 룩)

설계는 `docs/superpowers/specs/2026-09-30-toon-look-design.md`. 규칙:

- **모델은 `components/game/toonGLTF`의 `useGLTF`로 불러온다**(drei 것을 직접 쓰지 말 것). 캐릭터·몬스터·NPC는
  `useGLTF(url, { outline: true })`, 나무·건물·소품은 외곽선 없이.
- **새 절차적 메시는 `meshToonMaterial` + `gradientMap={getToonGradient()}`.** 톤매핑은 꺼져 있으니(`NoToneMapping`) 색은 보이는 그대로다.
- **three.js 재질/조명/배경의 색은 헥스 값(`THEME.color.…`)만.** `color="var(--color-x)"` 같은 CSS 변수는 three.js가 읽지 못해
  조용히 흰색이 된다(타겟 링이 밝은 흰색으로 번쩍이던 버그의 원인). `var(--…)`는 화면 위 DOM 스타일에만. `engage.test.ts`가 잡아낸다.
- 지형 색을 바꾸면 미니맵/월드맵의 같은 색도 함께 바꿀 것(3D 지형과 지도가 서로 맞춰져 있다).
- 외곽선은 메시를 한 벌 더 그린다. 폰이 느리면 `toonGLTF.ts`의 `outline`을 끄거나 몬스터 렌더 반경을 줄일 것.

## 전투 연출 (타격감)

설계는 `docs/superpowers/specs/2026-09-30-combat-feel-design.md`. 전투 규칙(데미지 계산)은 건드리지 않고 결과를 구경만 한다. 구조:

- `combatStore`의 HP 감소 -> `combatFx.ts`의 `startCombatFxWatcher`/`diffHits`가 diff -> `HitEvent`(`hit`/`kill`/`playerHit`) 버스 -> 구독자:
  - `CombatFxRoot.tsx`: 화면 흔들림(`CameraRig`가 `sampleShake`로 매 프레임 오프셋을 더함)
  - `hitReaction.ts`: 몬스터 하얀 번쩍임 + 히트스톱(`useHitReaction`)
  - `HitSparks.tsx` + `sparkPool.ts`: 96칸 `InstancedMesh` 파티클 풀
  - `DamageNumbers.tsx` + `damageNumberSpec.ts`: 데미지 숫자(동시 12개 상한). 파일명은 계획서의 `damageNumbers.ts`가 아니라
    `damageNumberSpec.ts`다(Windows는 대소문자를 구분하지 않아 `DamageNumbers.tsx`와 충돌).
- 규칙:
  - **새 연출은 `subscribeHit`으로만 붙인다. `combatStore`는 건드리지 않는다.** 구독자가 던진 예외는 버스가 삼킨다.
  - three.js 재질/라이트 색은 hex만(CSS 변수 금지). `pointLight` 추가 금지, 발광은 `toneMapped={false}` + 기존 Bloom.
  - 파티클은 `SparkPool`을 재사용한다. 타격마다 새로 할당하지 말 것(초과 시 가장 오래된 칸을 덮어씀).
  - 궁수/마법사는 데미지가 즉시 적용되고 투사체가 늦게 도착하므로, `CharacterMesh`가 `setHitLeadMs`로 지연을 알려 몬스터 대상 이벤트를 늦춘다(플레이어 피격은 지연 없음).
  - "강타" = `damage > attackPower * 1.15`(`isHeavyHit`). 사망(`kill`)은 항상 강타. 사망 연출은 큰 스파크 + 흔들림 + 그 몬스터의 히트스톱(전역 슬로모션은 뺐다).
  - 화면 흔들림은 시스템 메뉴에서 끌 수 있다(`fxSettings.ts`, localStorage 키 `rpg.fx.shake`, 저장소가 막혀도 기본 켜짐).
- 알려진 한계: 사망 타격의 숫자는 남은 HP만큼만 나온다(스토어가 오버킬을 0으로 자름). 실제 크리티컬 시스템은 없다.
  **폰 실기기 성능은 아직 확인하지 못했다**(자동화로 검증 불가).

## 스킬 이펙트

설계는 `docs/superpowers/specs/2026-10-01-skill-fx-design.md`. 스킬 규칙(데미지·쿨타임·MP)은 건드리지 않고 보이는 것만 담당한다. 구조:

- `CharacterMesh`가 스킬 시전마다 `emitSkillCast`(`skillFx.ts`)를 **한 번** 발행(`from`, `to`, `aoeRadius`, `travelMs`) -> `SkillFxRoot.tsx`가 `SKILL_FX[skillId]`(`skillFxDefs.ts`)를 재생: `cast` 부품은 즉시, `impact` 부품은 `travelMs` 뒤에(`setTimeout`) -> 부품 렌더러(`skillFxParts.tsx`의 `PART_RENDERERS`). 수명/상한 순수 로직은 `skillFxLife.ts`.
- 새 스킬 이펙트 추가: `skillFxDefs.ts`의 `SKILL_FX`에 항목 하나 추가. 정의가 없는 id는 `FALLBACK_FX`로 대체된다. 새 `PartKind`는 `PART_RENDERERS`에 렌더러를 같이 추가해야 한다(모든 kind에 렌더러가 있는지 테스트가 검사).
- 규칙:
  - 색은 hex 숫자만(three.js에 CSS 변수 금지). `pointLight` 추가 금지, 발광은 `toneMapped={false}` + 가산 혼합 + 기존 Bloom.
  - 지오메트리는 모듈 상수로 공유하므로 그걸 쓰는 mesh에는 `dispose={null}`을 단다(없으면 한 부품이 사라질 때 지오메트리가 dispose되어 다음 시전에서 안 보인다). 재질은 부품마다 만든다.
  - 동시 부품 상한 `MAX_ACTIVE_PARTS = 24`(초과 시 가장 오래된 것부터 제거).
  - 스파크는 `sharedSparkPool`(128칸)을 쓴다. 타격감의 `HitSparks`와 같은 풀이다.
  - 빌보드 부품(`flash`, `slashArc`)은 `depthTest={false}`라 땅에 잘리지 않는다.
  - 각성기(10/11/12)는 `tier: 'awakening'` + 카메라 `shake`가 있다.
  - 원거리 스킬은 옛 `Projectile`을 더 이상 만들지 않는다(`trail`/`orb`/`fall`이 대체). 평타는 그대로 `Projectile`을 쓴다.
- 미리보기: dev 서버 콘솔에서 `const m = await import('/src/components/game/skillFx.ts'); m.emitSkillCast({skillId, from, to, aoeRadius, travelMs})`.
- 알려진 한계: **폰 실기기 성능은 확인하지 못했다.** 땅 링/기둥은 고정 y라 지형 높이를 따르지 않는다. 부품별 재질은 dispose하지 않는다(미미함). `fall`의 x 흔들림과 세로 늘어남은 겉보기용이다.

## 한 접속만 유효 (게임 세션)

설계는 `docs/superpowers/specs/2026-10-01-single-game-session-design.md`. 같은 계정으로 탭/기기를 여러 개 열어도 **나중에 입장한 접속만 유효**하고 이전 접속은 서버가 거부한다.

- 동작: `select_character` RPC가 활성화하는 캐릭터에 새 `game_session_id`를 발급 -> `POST /characters/:id/select`가 `{ game_session_id }`로 돌려줌 -> 클라이언트가 탭 단위(`sessionStorage`, 키 `rpg.game-session`)로 보관 -> 모든 요청에 헤더 `x-game-session`을 붙임 -> `requireGameSession`이 **활성 캐릭터**의 값과 비교 -> 다르거나 없으면 409 `conflict`/`session_replaced` -> `client.ts`가 훅을 불러 `SessionReplacedModal`(App.tsx에 마운트)을 띄움(재시도/토큰 갱신 없음).
- 위치:
  - 서버: `supabase/functions/api/gameSession.ts`(순수 판정 `checkGameSession`), `gameSessionMiddleware.ts`(`requireGameSession`), `characters.ts`(미들웨어 적용 + select 응답), `maps.ts`, `index.ts`(CORS).
  - DB: `supabase/migrations/20261001010000_game_session_id.sql`(컬럼 + RPC 갱신).
  - 클라이언트: `src/stores/gameSessionStore.ts`, `src/api/client.ts`(헤더/훅), `src/components/SessionReplacedModal.tsx`, `src/components/game/savePolicy.ts`(`shouldSavePosition`), `src/components/game/PositionSync.tsx`.
- 규칙:
  - 검사 대상은 `/characters/me`, `/characters/me/*`, `/exploration` 전체. select/목록/생성/삭제는 접속을 바꾸는 쪽이라 **일부러** 검사하지 않는다. 새 `/me...` 라우트나 exploration 라우트는 자동으로 보호된다(별도 작업 불필요).
  - 새 커스텀 요청 헤더를 쓰려면 `index.ts` CORS `allowHeaders`에 추가해야 한다(`X-Game-Session`도 거기 있음).
  - 비활성 캐릭터 행의 `game_session_id`는 오래된 값일 수 있으니 **읽어서 쓰지 말 것**(항상 활성 행만).
  - select가 id를 못 받으면(RPC 미적용 등) 500 `character_select_failed`.
- 위치 저장: 15초 주기 + `pagehide`/`visibilitychange(hidden)` 때 `keepalive` fetch. 접속이 이미 교체됐으면 저장을 건너뛴다(`shouldSavePosition`). id가 없는(null) 경우는 **저장한다** — 배포 2단계(새 프런트)~3단계(새 함수) 사이에는 옛 함수가 id를 안 주므로 위치 저장이 끊기지 않게 하기 위함. 파일명은 `PositionSync.tsx`와 Windows에서 충돌하지 않게 `savePolicy.ts`.
- **이 변경의 배포 순서**: ① Supabase SQL Editor에서 마이그레이션 실행 -> ② main push(프런트) -> ③ CLI로 엣지 함수 배포. 함수를 먼저 올리면 헤더가 없는 옛 프런트가 전부 409를 받는다.
- `/me` 검사는 `use("/me/*")` 하나로 한 번만 돈다(Hono에서 `/me/*`는 `/me`도 매칭; 4.13.10에서 확인).
- 클라이언트 판정: 409 `session_replaced`는 **요청이 id를 실제로 보냈고, 응답 시점에도 그 id가 이 탭의 현재 id일 때만** 모달을 띄운다(id 없이 보낸 요청, 그새 새로 선택해 바뀐 id는 에러만 던짐). 부팅 시 `/characters/me` 프로필 조회는 `sessionStorage`에 id가 있을 때만 한다(`bootstrapPolicy.ts`) — 새 탭/브라우저 재시작은 id가 없으므로 모달 없이 캐릭터 선택 화면으로 가서 다시 고른다.
- 한계/주의:
  - 배포 전에 이미 열려 있던 탭은 **옛 번들**이라 409 처리/모달이 없다. 새로고침하기 전까지는 일반 오류만 보인다.
  - 새 탭/브라우저 재시작은 캐릭터를 다시 골라야 한다(모달 없음).
  - Chrome "탭 복제"는 `sessionStorage`를 복사해 두 탭이 같은 유효 id를 공유한다(알려진 구멍, 미해결).
  - 배포 3단계(함수) 시점에 게임 중이던 모든 플레이어는 모달을 한 번 보고 다시 입장한다.
  - 새 함수가 살아 있는 동안 프런트만 롤백하면 플레이어가 잠긴다(헤더를 못 보냄). 롤백은 **함수를 먼저**.
  - 배포 2~3단계 사이에는 id가 null이어도 위치 저장이 계속된다.
- 한계: 옛 탭은 **자기 다음 요청에서야** 교체를 안다. 두 탭 동작은 MSW 목으로 재현할 수 없으니 실서버에서 확인할 것. `DELETE /characters/:id`는 세션 검사를 하지 않는다.

## 발견물 (웃음·히든 콘텐츠)

설계는 `docs/superpowers/specs/2026-10-01-discoveries-design.md`. 월드 곳곳의 소품/NPC/구역을 조사하면 대사가 나오고, 일부는 서버가 판정하는 보상(골드/XP/아이템)을 준다. 현재 25개.

- 구조:
  - 클라이언트(`src/components/game/`): `discoveries.ts`(타입 + `getDiscovery`), `discoveryContent.ts`(콘텐츠 정의), `discoveryLogic.ts`(조건 판정/격자 근접), `discoveryZones.ts`(지역), `discoveryRender.ts`(소품 렌더 판단), `DiscoveryProximity.tsx`(근접 감지, 0.1초 주기), `DiscoveryProps.tsx`(소품), `DiscoveryDialog.tsx`(대사 패널). 상태는 `src/stores/discoveryStore.ts`.
  - 서버: `supabase/functions/api/discoveries.ts`(순수 보상 표 `DISCOVERY_REWARDS` + `checkClaim`), `characters.ts`의 두 엔드포인트, DB `claim_discovery` RPC(XP/골드 적용 + 한 번만 기록) + `character_discoveries` 테이블(`20261002010000_character_discoveries.sql`).
  - 엔드포인트: `GET /characters/me/discoveries`(받은 id 목록), `POST /characters/me/discoveries/:id/claim`(`{ progress, inventory, reward }`). 아이템은 RPC 뒤에 지급하고 실패하면 되돌린다.
  - 개발 목: `src/mocks/handlers.ts`가 같은 서버 표로 두 엔드포인트를 흉내낸다(인벤토리는 없어서 아이템은 보고만).
- 새 발견물 추가: `discoveryContent.ts`에 **정의 한 항목**. 보상이 있으면 서버 `DISCOVERY_REWARDS`에도 **같은 id와 값**을 넣는다. 테스트가 강제한다: 클라/서버 표 일치, 상한(골드 500/XP 200/수량 5), 보상이 있거나 requires(조건)가 있거나 NPC면 반드시 hidden, 트리거 반경 4..8, 아이템 보상은 아이템만(골드/XP 동시 지급 금지), 도달 가능한 위치.
- 규칙:
  - 보상 수치는 **서버에만** 있다. 클라이언트는 id만 보낸다.
  - 서버는 **위치를 검증하지 않는다**(저장 위치가 15초 주기라 부정확). 방어는 캐릭터당 1회 + 소액 + 레벨 제한이다.
  - 이미 본 발견물은 근접 자동 반응에서 제외(`skipSeen`)하되, 탭하면 다시 읽을 수 있다.
  - `hidden`은 지도에 안 보이고, 본 뒤에야 표시된다.
- **배포 순서**: ① 마이그레이션(2부분으로 나눠 SQL Editor에서) -> ② 프런트 -> ③ 엣지 함수. 새 프런트 + 옛 함수면 보상 수령이 "아무것도 없었다"로 떨어진다(대사는 정상).
- 한계: 보상 없는 "본 것"은 localStorage에만 저장(기기/브라우저를 바꾸면 사라짐). 대사는 초안이라 다듬을 필요가 있다.

## 공략집 (/guide)

로그인 없이 열리는 공개 페이지. `lazy()` 청크라서 게임 시작 속도에 영향이 없다(GuidePage 약 6 kB, three.js 없음). 시스템 메뉴(F1)의 "공략집"이 새 탭으로 연다(`select`를 호출하지 않아 게임 접속을 바꾸지 않는다). 설계는 `docs/superpowers/specs/2026-10-01-guide-design.md`.

- 구조: `src/pages/GuidePage.tsx`(탭/라우트 `/guide`, `/guide/:tab`) + `src/guide/*`. 데이터 어댑터 `guideSkills`, `guideMonsters`(+ 서버 `drops.ts`의 `dropChancesFor`), `guideQuests`, `guideDiscoveries`. 화면 `GuideTabs`, `HiddenTab`/`QuestsTab`/`MonstersTab`/`SkillsTab`, 카드 `DiscoveryCard`.
- 데이터 흐름: 정의에서 **자동 생성**한다. 발견물 `DISCOVERIES`, 퀘스트 `QUEST_DEFS`, 스킬 `SKILLS_BY_CLASS`, 드롭은 서버 드롭 표. 콘텐츠를 추가하면 공략집이 따라온다.
- 새 콘텐츠 추가 규칙(테스트가 강제):
  - 새 발견물: `hidden`이거나 보상이 있으면 `hint`+`where` 필수, `where`는 항상 필수. **방위 단어(동/서/남/북 등)는 쓰지 않는다** — 랜드마크로 설명(테스트가 검사).
  - 새 몬스터 템플릿: `guideMonsters.ts`에 이름+지역을 추가(빠뜨리면 테스트 실패).
  - 드롭 %는 `dropChancesFor`가 계산하며, 실제 `rollDropEntry`와 0.006 허용오차 스윕으로 대조한다. 서버 드롭 표를 바꾸면 이 테스트가 잡는다.
  - `src/guide`는 순수하게 유지: three/R3F나 스토어/API 모듈을 import하지 않는다(번들이 커진다).
- 스포일러 단계(히든 발견물): `???` -> 힌트 -> 위치 -> 정답. 단계 상태는 저장하지 않아 새로고침하면 다시 가려진다. 연쇄 발견물은 앞 단계 정답을 열어야 "위치 보기"가 활성화된다. 가려진 내용은 CSS가 아니라 DOM에 아예 렌더하지 않는다(테스트가 `innerHTML`로 검사).
- 한계: 개인 진행 상황(내가 찾은 것) 표시 없음, 검색 없음. 지역 제목에 그 지역에 히든이 있는지는 보인다.

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
