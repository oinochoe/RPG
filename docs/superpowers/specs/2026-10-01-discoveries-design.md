# 발견물(Discoveries) 설계 — 월드 돌아다니는 재미

날짜: 2026-10-01 · 범위: 맵 확장 트랙 A(웃긴 요소·히든). 바다·배·비공정은 트랙 B로 이번 범위 밖.

## 목표

어스토니시아 스토리처럼 월드를 구석구석 돌아다니는 것 자체가 재밌게 만든다. 지도에 안 나오는 숨겨진 장소·NPC·아이템을 발견하고, 곳곳에 어이없는 웃음 포인트가 있어서 가보고 싶어진다. 코드로 생성하는 방식을 유지하고(3D 에셋 추가 없음), 폰에서도 부담이 없어야 한다.

성공 기준:
- 월드에 놓인 오브젝트·NPC를 조사하면 대사가 나오고, 일부는 보상(골드/XP/아이템)을 준다. 키보드(Space)와 폰(터치, 행동 버튼) 모두 가능하다.
- 보상은 **서버가 판정**하고 캐릭터당 한 번만 받는다(경제 서버 권위 유지). API를 직접 호출해도 한도를 넘길 수 없다.
- 새 발견물 추가 = 데이터 한 항목(+ 필요하면 소품 프리셋). 초기 콘텐츠 약 20~30개를 이 틀 위에 올린다.
- 지도에서 숨겨진 것은 안 보이고, 발견하면 표시가 생긴다.

## 범위 밖

- 맵 크기 확장(지금도 640×640; 문제는 볼 거리), 바다·배·비공정, 새 몬스터/모델 에셋.
- 퀘스트 시스템 변경(기존 "몬스터 N마리" 퀘스트는 그대로).
- 멀티플레이 연동.

## 현재 구조 (확인됨)

- 근접 감지는 `ShopProximity`/`QuestProximity`(useFrame에서 플레이어 위치로 `uiStore.nearShopKind`/`nearQuestNpcName` 설정). Space와 터치 행동 버튼은 `interactions.ts`의 `talkToNearby()`/`currentInteraction()`을 쓰고, NPC 클릭 말 걸기는 `clickToTalk`/`moveTarget.talkTarget`.
- 대화/상점/퀘스트 패널은 `uiStore.openShop/openQuest`로 열고 `allPanelsClosedPatch`로 다른 패널을 닫는다.
- 필드 NPC 4명(`FieldNpcs.tsx`)은 대사 없는 장식이다. 마을 NPC는 `Village.tsx`의 `VILLAGE_CONFIGS`.
- 보상 지급은 서버: `claim_quest_reward` RPC(XP/골드 적용) + `grantInventoryItem`(아이템) + `fetchProgressSnapshot`/`fetchInventory`(결과 반환). 엔드포인트는 `/characters/me/*`이고 `requireGameSession`이 자동 적용된다.
- 월드는 시드 기반 코드 생성(`worldColliders.ts`), 충돌물은 `activeColliders`/`resolveMovement`.

## 설계

### 1. 데이터 정의 `DISCOVERIES`

`src/components/game/discoveries.ts`(순수 데이터, three.js import 없음):

```ts
type DiscoveryKind = 'inspect' | 'npc' | 'trigger';
interface DiscoveryDef {
  id: string;                    // 안정적인 키, 예: 'sulky-rock'. 서버 표와 같은 문자열.
  kind: DiscoveryKind;
  name: string;                  // 표시 이름(대화창 제목)
  position: [number, number];    // x, z (월드)
  radius: number;                // 조사/발동 반경
  prop: PropPreset;              // 보이는 모양(코드 생성 프리셋); 'none'이면 보이지 않음
  hidden?: boolean;              // true면 지도에 안 보이고, 발견 후에만 표시
  requires?: Requirement[];      // 보이거나 반응하는 조건
  lines: string[];               // 처음 조사 때 대사(여러 줄)
  afterLines?: string[];         // 이미 본 뒤의 대사
  reward?: DiscoveryReward;      // 서버가 지급하는 보상(없으면 순수 웃음)
  once: boolean;                 // 캐릭터당 한 번만 보상(reward가 있으면 항상 true로 취급)
}
type Requirement =
  | { type: 'level'; min: number }
  | { type: 'seen'; id: string }          // 다른 발견물을 이미 조사함
  | { type: 'area'; zone: ZoneName };     // 특정 지역 안에서만
type DiscoveryReward = { gold?: number; xp?: number; itemTemplateId?: number; itemQty?: number };
```

- `kind`: `inspect`(눌러서 조사), `npc`(말 거는 NPC; 기존 `NPC` 모델 재사용), `trigger`(반경에 들어가면 자동으로 반응; 대사 한 번, 필요하면 보상).
- 정의의 보상 수치는 **표시와 검증용 사본**이다. 실제 지급 값은 서버 표가 정한다(아래 §3). 클라이언트 값과 서버 값이 다르면 서버가 이긴다.
- 정의 검증(테스트): id 중복 없음, 위치가 충돌물과 겹치지 않음(`resolveMovement`가 막는 곳에 두지 않기), 반경이 양수, `requires.seen`이 가리키는 id가 존재하고 순환 없음, 보상이 있으면 서버 표에도 같은 id가 있음, 대사가 비어 있지 않음.

### 2. 클라이언트 동작

- **`DiscoveryProximity`**(useFrame): 정의 중 조건을 만족하고 반경 안에 있는 가장 가까운 `inspect`/`npc` 발견물을 `uiStore.nearDiscoveryId`에 넣는다. `trigger`는 반경에 처음 들어갈 때 한 번 자동 발동한다. 기존 Proximity와 같은 형태이고 던전 안에서는 끈다.
- **상호작용 연결:** `interactions.ts`의 `InteractKind`에 `'discovery'`를 추가한다. 우선순위는 기존 상점/퀘스트 다음. 터치의 행동 버튼은 근처에 발견물이 있으면 "조사" 라벨로 켜진다. 발견물을 직접 클릭하면 `clickToTalk`와 같은 방식(걸어가서 도착하면 열기)으로 `moveTarget`에 새 목표를 추가한다(보이는 소품/NPC에 눈에 안 보이는 큰 히트 영역).
- **대사 패널 `DiscoveryDialog`:** `GamePanel`/`Modal` 기반의 가벼운 패널. 대사를 한 줄씩 넘기고(탭/Space/클릭), 마지막에 보상이 있으면 서버에 요청해 결과(획득한 아이템/골드/XP)를 표시한다. 이미 받은 보상은 "이미 받았다"는 `afterLines`만 보여준다.
- **발견 기록:** 캐릭터가 조사한 발견물 id 집합을 서버에서 받아(`GET /me/discoveries`; 캐릭터 프로필 응답에 얹지 않고 별도 호출로 시작) 스토어 `discoveryStore`에 둔다. 로컬에서 조사하면 즉시 반영하고, 보상 없는 발견물은 서버가 기록하지 않고 `localStorage`(캐릭터별 키, try/catch)에만 둔다(순수 웃음은 잃어도 문제없음).
- **소품 프리셋 `PropPreset`:** 코드로 만든 소품 몇 종(수상한 바위, 낡은 표지판, 구덩이, 버섯 원, 반짝이는 풀 무더기, 이상한 동상 등). 기존 툰 재질/외곽선(`outline.tsx`, `toon.ts`)을 쓰고, 공유 지오메트리, 인스턴스 수 상한, 라이트 추가 없음. 아직 못 본 발견물에는 약한 반짝임(작은 스파크/빛 점)으로 힌트를 준다.
- **지도:** `WorldMap`/`MiniMap`에 발견한 것만 작은 표시. `hidden` 발견물은 발견 전에는 어디에도 안 보인다.

### 3. 서버

- **마이그레이션** `character_discoveries(character_id int, discovery_id text, claimed_at timestamptz default now(), primary key (character_id, discovery_id))` + RLS 켜기(서비스 롤만 접근; 다른 테이블과 같은 정책 패턴). 보상이 있는 발견물만 기록한다.
- **서버 표 `discoveries.ts`**(순수 모듈, import 없음, vitest로 테스트): `DISCOVERY_REWARDS: Record<string, { position: [number, number]; radius: number; requires?: ...; gold?: number; xp?: number; itemTemplateId?: number; itemQty?: number }>` — 서버가 알고 있는 보상 발견물의 위치/반경/조건/보상. 클라이언트가 보내는 것은 `discovery_id`뿐이다.
- **`POST /characters/me/discoveries/:id/claim`**: ① 서버 표에 없으면 404 ② 캐릭터의 마지막 저장 위치/요청 시점 위치와의 거리가 반경×여유 안인지 확인(서버가 아는 위치는 15초 주기 저장이라 정확하지 않으므로 **요청 본문에 현재 위치를 받고** 반경×2 안인지, 그리고 그 위치가 직전 저장 위치에서 터무니없이 멀지 않은지(기존 킬 보고의 속도/거리 상한 방식을 재사용 가능한지 계획 단계에서 확인)로 검증) ③ `requires`(레벨 등) 확인 ④ `character_discoveries`에 insert — 기본키 충돌이면 이미 받음 → 409 `already_claimed`(보상 없음, 멱등) ⑤ 이어서 골드/XP/아이템 지급(`claim_quest_reward`와 같은 방식: 가능하면 하나의 RPC로 기록+지급을 한 트랜잭션에) ⑥ 지급 결과(`fetchProgressSnapshot` + 인벤토리)를 돌려준다.
- **`GET /characters/me/discoveries`**: 이 캐릭터가 받은 보상 발견물 id 목록.
- 두 엔드포인트는 `/me/*`라 세션 검사가 자동 적용된다. CORS 헤더 추가 없음.
- **중복 수령 방지**는 DB의 기본키와 한 트랜잭션 처리로 한다(클라이언트의 "이미 봤음" 상태는 신뢰하지 않는다).

### 4. 초기 콘텐츠 (약 20~30개)

구성 목표: **웃음 약 60%**(보상 없는 대사, 소품 반응), **숨겨진 보상 약 30%**(골드/물약/희귀 소재 소량, 한두 개는 의외의 장비), **숨겨진 NPC 몇 명**(조건을 만족해야 보임, 퀘스트처럼 길게 말하지 않고 한두 문단의 유머/로어). 지역마다 최소 2~3개를 둬서 어디를 가도 뭔가 있게 한다(마을 근처, 강·다리, 사막, 요정의 숲, 오크 마을, 뼈의 들판, 구울 평원, 유적 근처, 던전 입구 주변).

대사 톤은 어스토니시아식의 뻔뻔한 유머(진지한 척하다가 힘이 빠지는 문장, 게임 자체를 의식하는 농담, 소심한 몬스터 이름 패러디)로 구현 담당이 초안을 쓰고 사용자가 다듬는다. 대사는 정의 파일에만 두어 코드 수정 없이 고칠 수 있게 한다.

보상 균형: 한 발견물의 보상은 해당 지역 일반 몬스터 몇 마리 분량 수준으로 하고(경제를 흔들지 않게), 희귀 장비는 총 1~2개로 제한한다. 모든 보상은 서버 표에 있어야 한다(테스트로 강제).

### 5. 성능·모바일

- 소품은 종류별 공유 지오메트리, 플레이어 반경 안(예: 60 유닛)의 발견물만 렌더하고 나머지는 마운트하지 않는다(월드가 640×640이라 전부 올리면 낭비). 반짝임 힌트는 `SparkPool`을 쓰지 않고 소품 자체의 가벼운 발광으로 한정(풀 부담 방지).
- `DiscoveryProximity`는 매 프레임 전체를 훑지 않도록 위치를 격자(예: 16유닛 칸)로 나눠 가까운 칸의 항목만 검사한다.
- 폰: 행동 버튼에 "조사" 라벨, 히트 영역은 기존 NPC 클릭처럼 넉넉하게.

### 6. 오류 처리·보안

- 서버가 위치·조건·중복을 검증하고 보상 값은 서버 표에서만 읽는다. 클라이언트가 보내는 것은 `discovery_id`와 현재 위치뿐.
- 보상 요청이 실패(네트워크/거리/이미 받음)하면 대사는 보여주되 보상 없이 "…아무것도 없었다" 같은 일반 문구로 처리하고 재시도 가능하게 둔다(이미 받음 409는 `afterLines`).
- 구독/타이머 정리, 패널 언마운트 안전, `localStorage` 실패 시 메모리로 동작.

### 7. 테스트

- 순수 로직(vitest): 정의 검증(위 §1), 조건 판정(`level`/`seen`/`area`), 격자 근접 검색, 서버 표 검증(클라이언트 정의 보상 ⊆ 서버 표, 보상 상한), 서버 판정 함수(거리/조건/중복).
- UI: 대사 패널(줄 넘기기, 보상 표시, 이미 받음), 상호작용 우선순위(상점/퀘스트 근처에서는 기존 동작 유지), 터치 행동 버튼 라벨.
- Playwright: 발견물 근처로 순간이동 → 조사 → 대사와 보상 흐름, 폰 뷰포트, 지도 표시.
- 서버(Deno) 로컬 테스트 환경이 없으므로 서버 판정은 **순수 함수로 분리해 vitest로** 검증하고, 엔드포인트는 코드 리뷰와 배포 후 확인으로 보강한다.

### 8. 구현 순서 (계획 단계에서 세분화)

1. 데이터 타입·정의 검증·조건 판정·격자 근접 (순수 로직 + 테스트)
2. 서버: 마이그레이션, 서버 표, 판정 함수, claim/list 엔드포인트
3. 클라이언트 저장소(`discoveryStore`)와 API, 근접 감지, 상호작용 연결(키보드/터치/클릭)
4. 대사 패널과 소품 프리셋 렌더
5. 지도 표시와 발견 기록
6. 초기 콘텐츠 20~30개 작성(지역별 배치)과 균형 점검
7. 시각 확인(데스크톱/폰), HANDOFF, 배포(마이그레이션 → 프런트 → 함수 순서; 사용자가 SQL 실행)
