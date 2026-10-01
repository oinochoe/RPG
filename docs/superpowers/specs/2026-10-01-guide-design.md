# 공략집(`/guide`) 설계

날짜: 2026-10-01 · 로그인 없이 누구나 볼 수 있는 공략 페이지(사용자 결정)

## 목표

게임의 히든·퀘스트·몬스터 드롭·스킬 정보를 한곳에서 볼 수 있게 한다. 코드의 정의(데이터)에서 **자동 생성**해서, 게임에 콘텐츠를 추가하면 공략집이 따로 손대지 않아도 따라온다. 폰에서도 읽기 좋게, 스포일러는 가려서 어려운 숨겨진 요소가 공략집을 보는 순간 망가지지 않게 한다.

성공 기준:
- `/guide`는 로그인 없이 열리고, 게임 시작 속도(번들)에 영향을 주지 않는다(지연 로딩).
- 탭 4개(히든·발견물 / 퀘스트 / 몬스터·드롭 / 스킬)의 내용이 코드의 정의와 항상 일치한다(테스트가 보장).
- 숨겨진 발견물은 기본적으로 정답을 가리고, 단계적으로(힌트 → 위치 → 정답) 펼친다.
- 서버 호출 없는 읽기 전용 정적 페이지.

## 범위 밖

- 개인 진행 상황(내가 찾은 것 표시), 로그인 연동 — 다음 라운드.
- 텍스트 검색(지역 필터와 탭만 먼저).
- 아이템 도감, 상점 가격표, 지도 이미지(필요하면 후속).
- 새 서버 API, DB 변경.

## 현재 구조 (확인됨)

- 앱은 Vite + React Router SPA. `/dev/ui`가 인증 없이 `lazy()`로 로딩되는 선례이고, `vercel.json`이 모든 경로를 `index.html`로 보낸다(새 라우트에 서버 설정 불필요).
- 데이터: `discoveryContent.ts`(`DISCOVERIES`), `questStore.ts`의 `QUEST_DEFS`, `combatStore.ts`의 `SKILLS_BY_CLASS`, 서버 `drops.ts`(import 없는 순수 모듈: 몬스터 템플릿별 드롭 표, 보스 이름별 표, 강화 주문서 확률 `scrollChancesFor`), `economyRules.ts`(`MAX_REGULAR_MONSTER_LEVEL`, `BOSSES`).
- `DROP_TABLE`/`BOSS_DROP_TABLE`/`NOTHING_WEIGHT`는 `drops.ts` 내부 상수이고 외부로는 `rollDropEntry`, `scrollChancesFor`만 export된다.

## 설계

### 1. 라우트와 로딩

`App.tsx`에 `/guide`(및 `/guide/:tab` 선택적)를 `lazy(() => import('./pages/GuidePage'))` + `Suspense`로 추가한다. 인증 가드(`RequireAuth`) 밖. 공략집 코드와 데이터는 게임 청크(`GamePage`)와 분리한다(`three.js`를 가져오지 않는다 — 데이터 파일이 3D 컴포넌트를 import하지 않도록 `import type`/순수 모듈만 쓴다. 필요하면 아래 새 순수 모듈을 만든다).

### 2. 데이터 어댑터 (순수 모듈, 테스트 대상)

`src/guide/` 디렉터리(3D 의존 없음):

- `guideDiscoveries.ts`: `DISCOVERIES`를 지역(`zoneAt`) 단위로 묶고, 연쇄(`requires: seen`)를 순서 체인으로 풀어 낸다. 각 항목에 공개 단계별 필드(§3)를 계산해 돌려준다.
- `guideQuests.ts`: `QUEST_DEFS`를 의뢰인/마을/종류(스토리·반복·메인)로 정리하고 메인 퀘스트의 해금 조건(`mainQuestUnlocked`가 보는 조건)을 읽기 좋은 문장으로 만든다. (`questStore`가 zustand 스토어를 함께 export하므로, 정의만 필요하다면 `QUEST_DEFS`/`QuestDef`를 별도 순수 모듈로 분리하는 작은 리팩터를 계획 단계에서 판단한다 — 공략집이 스토어와 API 모듈을 끌어오면 번들이 커지고 사이드 이펙트가 생긴다.)
- `guideMonsters.ts`: 몬스터 템플릿 id → `{ name, zones, maxLevel }` 표(이름·지역은 `drops.ts` 주석의 id 규약과 `FieldMonsters.ts`/`dungeonLayout.ts`의 스폰 설정에서 확인해 작성) + 드롭 확률. 새 export `dropChancesFor(templateId, monsterName): { itemName; chancePct }[]`를 `drops.ts`에 추가한다: `(1 − Σscroll확률) × weight / (Σweight + nothing)`(보스는 nothing 0), 강화 주문서는 `scrollChancesFor`의 값 그대로. 확률은 소수 한 자리 %로 표기. 테스트가 `dropChancesFor`의 합계가 `rollDropEntry` 스윕 결과(기존 `serverEconomy.test.ts`의 방식)와 일치함을 검증한다.
- `guideSkills.ts`: `SKILLS_BY_CLASS`를 직업별로 정리(요구 레벨, MP, 쿨타임, 배율, 단일/광역, 반경).

각 어댑터는 입력(정의)이 비거나 필드가 없어도 예외 없이 빈 목록을 돌려준다.

### 3. 발견물 공개 단계 (스포일러 보호)

`DiscoveryDef`에 **선택 항목**을 추가하고 `discoveryContent.ts`의 25개를 채운다(콘텐츠 정합 테스트가 "숨겨진 것·보상 있는 것은 모두 `hint`와 `where`를 가짐"을 강제):

- `hint: string` — 1단계: 정체를 드러내지 않는 한 줄 단서("사막 어딘가에서 금이 간 물건이 속삭인다").
- `where: string` — 2단계: 지역 안의 방향·랜드마크("다리 동쪽 사막 초입, 야자수가 모인 곳 근처").
- 3단계(정답)는 기존 필드에서 계산: 이름, 대략 좌표(10 단위로 반올림해 "x≈150, z≈70" 형태), 조건(`requires`를 문장으로: "레벨 5 이상", "'수상한 바위'를 먼저 봄"), 보상, 연쇄 위치.

화면 동작: 숨겨지지 않은(visible) 발견물은 처음부터 이름·위치(2단계)를 보인다. `hidden`이면 카드가 "???"로 시작하고 "힌트 보기" → "위치 보기" → "정답 보기" 버튼을 차례로 눌러야 펼쳐진다(상태는 컴포넌트 안, `sessionStorage`에 해금 상태를 저장하지 않아 새로고침하면 다시 가려짐). 보상 있는 발견물은 정답 단계 전에는 보상 칸도 가린다. 연쇄 발견은 앞 단계의 정답을 열어야 다음 항목의 "위치 보기"가 활성화된다.

### 4. 화면

- 상단: 제목 + 탭 4개 + "게임으로 돌아가기"/"로그인" 링크(로그인 상태를 알 수 있으면 "게임으로", 아니면 "로그인").
- 히든 탭: 지역 필터 칩(마을, 사막, 요정의 숲, 오크 마을, 뼈의 들판, 구울 평원, 필드), 카드 목록(공개 단계 버튼 포함).
- 퀘스트 탭: 마을별 의뢰 카드, 메인 퀘스트는 별도 강조.
- 몬스터·드롭 탭: 지역별 몬스터 카드(레벨, 드롭 목록과 %, 강화 주문서), 보스 섹션(쿨다운은 `economyRules`/`combatStore`의 값이 있으면 표시).
- 스킬 탭: 직업 선택 탭 + 스킬 카드.
- 스타일은 기존 UI 키트(`components/ui/*`, `GamePanel`/`Card`/`Badge`/`Button`, Tailwind 토큰)를 재사용하고, 폰(390px)에서 한 열, 데스크톱에서 두 열. 제목은 `<h1>`/`<h2>` 계층, 버튼은 키보드로 조작 가능.
- 페이지 `<title>`과 메타 설명을 설정(공유될 때 의미가 있게). 로봇이 스포일러를 긁어 가는 것은 막지 않는다(공개 페이지 결정).

### 5. 게임 안 진입점

시스템 메뉴(F1)에 "공략집" 버튼(`target="_blank"` 링크)을 추가한다. 게임 상태를 잃지 않도록 새 탭에서 연다. (접속 제한이 있으므로 새 탭이 게임 접속을 바꾸지 않는다 — `/guide`는 `select`를 호출하지 않는다.)

### 6. 테스트

- 어댑터(vitest): 지역 묶기, 연쇄 순서(앞 단계 없는 항목이 먼저), 조건 문장화(레벨/seen/zone), 좌표 반올림, 드롭 확률 계산(`dropChancesFor` 합계 ≈ 스윕 측정, 보스는 합이 100%), 스킬 정리, 빈 입력 안전.
- 정합 테스트: `hidden` 또는 `reward`가 있는 발견물은 `hint`/`where`가 비어 있지 않음, 모든 드롭 표 id가 `guideMonsters`에 이름을 가짐, 모든 `QUEST_DEFS`가 의뢰인과 마을을 가짐.
- UI: 히든 카드의 단계 해금(처음엔 정답이 DOM에 없음 — 정답 텍스트가 가려진 상태에서 접근성 트리에도 노출되지 않아야 함), 탭 전환, 지역 필터, 스킬 직업 전환.
- 번들: 빌드 후 `GuidePage` 청크가 `three` 계열을 포함하지 않는지 확인(청크 크기/내용 점검을 구현 확인 단계에 포함).
- 시각: Playwright로 `/guide` 로그인 없이 접근, 폰 뷰포트(390×844) 스크린샷, 스포일러 가림 확인.

### 7. 구현 순서 (계획 단계에서 세분화)

1. `drops.ts`에 `dropChancesFor` 추가 + 테스트, `guideMonsters.ts`·`guideSkills.ts`
2. 퀘스트 정의의 순수 모듈 분리(필요 시) + `guideQuests.ts`
3. 발견물 `hint`/`where` 필드 추가 + 25개 콘텐츠 작성 + 정합 테스트 + `guideDiscoveries.ts`
4. `/guide` 라우트, 페이지 골격, 탭, 스킬 탭, 퀘스트 탭
5. 몬스터·드롭 탭, 히든 탭(공개 단계 UI)
6. 시스템 메뉴 링크, 시각 확인(데스크톱/폰), HANDOFF, 배포(프런트만; 서버 `drops.ts`의 새 export는 함수를 재배포하지 않아도 동작에 영향 없음 — 재배포는 선택)
