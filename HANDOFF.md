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

- [ ] **`POST /characters` (캐릭터 생성) 500 Internal Server Error — 재현 확정, BackendX에 문의 필요.**

      **BackendX에 그대로 전달할 리포트:**

      > 프로젝트: `4a1628b4-7116-4244-973d-55ae3fe4f5f2` (api_server)
      > 엔드포인트: `POST /api/v1/characters`
      > 증상: 인증된(이메일 인증 완료) 사용자가 캐릭터를 생성하면 항상 500 Internal Server Error가 발생합니다. 입력값을 바꿔도 재현되는 걸 확인했습니다 (입력값 문제 아님):
      >   - 시도 1: `{"name":"Valerius","character_class":"warrior"}` → 500, trace_id `718c8f28cda0454dae78115b1e172971`
      >   - 시도 2: `{"name":"TestMage","character_class":"mage"}` → 500, trace_id `4fd0f120f4864470908253832fa1ccfa`
      > 요청 헤더에는 로그인으로 발급받은 `Authorization: Bearer <access_token>`이 정상적으로 포함되어 있었습니다.
      > 실패 후 `GET /api/v1/characters`로 확인하면 목록이 비어 있어서 부분 생성 없이 깨끗하게 롤백되는 것으로 보입니다.
      > 추정 원인: 명세(FR-006)상 캐릭터 생성 시 "기본 시작 맵의 생성 위치로 캐릭터를 초기화"해야 하는데, `characters.current_map_id`가 `map_templates.id`를 참조하는 FK라서 시작 맵 마스터 데이터가 아직 시딩되지 않았다면 INSERT가 실패할 수 있습니다. `map_templates`(및 관련 `monster_templates`, `map_monster_spawns`)에 기본 데이터가 들어있는지 확인 부탁드립니다.
      > 대시보드의 "사용량 관리"에는 API 호출 수가 0회로 표시되는데, 실제로는 이 요청들이 DB에 반영되고 있어(9MB 사용량) 사용량 카운터가 실시간이 아닌 것 같습니다 — 요청/에러 로그를 trace_id로 조회할 수 있는 별도 메뉴가 있는지도 궁금합니다.
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
