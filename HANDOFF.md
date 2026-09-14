# Handoff — R3F RPG 클라이언트

마지막 업데이트: 2026-09-14

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

## 다음에 처리해야 할 일

### BackendX 쪽에서 확인/조치 필요

- [ ] **`POST /characters` (캐릭터 생성) 500 Internal Server Error.**
      trace_id: `718c8f28cda0454dae78115b1e172971`
      BackendX 대시보드/로그에서 이 trace_id로 원인 확인 필요. 클라이언트 요청 자체(`name`, `character_class`)는 계약대로 보냈음 — 서버 쪽 생성 로직(기본 맵/능력치 초기화 등) 버그로 추정.
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

1. BackendX 쪽에서 캐릭터 생성 500 원인 확인 및 수정.
2. 캐릭터 생성 → 선택 → `/game` 맵 입장까지 실제 백엔드로 끝까지 재검증.
3. (선택) 클라이언트 배포 후 BackendX 이메일 콜백 URL 설정.
4. Phase 2 브레인스토밍: 전투(FR-010~013), 인벤토리/창고/상점(FR-016~018), 퀘스트(FR-019) 등.
