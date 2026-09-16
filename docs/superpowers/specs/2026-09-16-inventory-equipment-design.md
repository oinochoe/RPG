# 인벤토리/장비 시스템 — 설계

## 배경 및 범위

Phase 1 스키마에 `item_templates`/`character_inventory`가 이미 존재하고 클라이언트
타입(`src/types/api.ts`)도 `CharacterProfile.equipped_items`/`inventory`를 이미
기대하지만, 지금은 `characters.ts`의 `toProfile()`이 두 필드를 항상 빈 배열로 채우고
있어 실질적으로 인벤토리 기능이 없다. 이번 작업으로 목록 조회 + 장착/해제까지 만든다.

**중요한 전제:** 이 게임의 전투(`combatStore.ts`)는 전적으로 클라이언트 메모리에서만
동작한다 — 몬스터 HP/처치/경험치/골드/레벨업/스탯 배분 전부 서버에 저장되지 않고
(포지션만 예외), 서버의 `characters.attack_power`/`defense_power`는 생성 시점 값
(10/5)에서 갱신되지 않는다. 이번 작업은 이 기존 패턴을 뒤집지 않는다 — 장비 보너스도
서버 DB 컬럼을 직접 갱신하지 않고, 클라이언트가 "기본값 + 장착 보너스"를 조합해서
전투 스탯을 계산하는 방식으로 기존 패턴과 일치시킨다.

**범위 밖 (의도적으로 제외):**
- 몬스터 처치 드롭 (전투가 서버 권위적이지 않은 상태에서 서버 드롭 검증이 무의미함 —
  별도 작업에서 전투를 서버로 옮기거나 클라이언트-신뢰 드롭 보고 방식을 결정)
- 샵 구매/판매
- 창고(warehouse) 보관 (스키마의 `storage_type='warehouse'`는 이번엔 안 씀)
- 소모품 사용(포션 등) 로직 — 시드 아이템에 소모품을 포함하지 않는다.

## 데이터 모델 변경

### `item_templates.equip_slot` 컬럼 추가 (새 마이그레이션)

현재 `item_templates.item_type`(`weapon`/`armor`/`consumable`/`scroll`/`misc`)만으로는
`character_inventory.equipped_slot`이 요구하는 세부 슬롯(`weapon`/`shield`/`helmet`/
`body_armor`/`boots`/`ring`/`necklace`)을 알 수 없다. 장착 로직이 "이 아이템을 어느
슬롯에 넣을지" 판단하려면 이 정보가 필요하므로 컬럼을 추가한다:

```sql
ALTER TABLE item_templates
  ADD COLUMN equip_slot TEXT NULL
    CHECK (equip_slot IS NULL OR equip_slot IN
      ('weapon', 'shield', 'helmet', 'body_armor', 'boots', 'ring', 'necklace'));
```

`item_type='consumable'|'scroll'|'misc'`인 아이템은 `equip_slot`이 NULL이며, 이번
작업 범위에선 애초에 그런 아이템을 시드하지 않는다.

### 시드 아이템 (6개)

직업별 시작 무기 1개 + 방어구 1개, `required_class`로 제한:

| 이름 | item_type | equip_slot | required_class | attack_bonus | defense_bonus |
|---|---|---|---|---|---|
| 녹슨 검 | weapon | weapon | warrior | 3 | 0 |
| 가죽 방패 | armor | shield | warrior | 0 | 2 |
| 나무 지팡이 | weapon | weapon | mage | 2 | 0 |
| 천리안의 로브 | armor | body_armor | mage | 0 | 1 |
| 나무 활 | weapon | weapon | archer | 3 | 0 |
| 가죽 조끼 | armor | body_armor | archer | 0 | 1 |

수치는 `create_character` RPC가 이미 부여하는 기본 스탯(공격 10/방어 5) 대비 작은
초기 보너스로 임의 설정 — 밸런스보다 기능 동작 확인이 목적.

### `create_character` RPC 확장

캐릭터 생성 성공 직후, 같은 함수 안에서 `p_class`에 맞는 시드 아이템 2개를
`character_inventory`에 미장착 상태(`is_equipped=false`, `equipped_slot=NULL`,
`slot_index=0,1`)로 삽입한다. 새 캐릭터마다 매번 인벤토리 UI에서 장착을 테스트할 수
있게 하기 위해 자동 장착은 하지 않는다.

## 새 RPC: `set_item_equipped`

```sql
public.set_item_equipped(
  p_user_id INT,
  p_character_id INT,
  p_inventory_id INT,
  p_equip BOOLEAN
) RETURNS SETOF public.character_inventory
```

`select_character`와 동일하게 `pg_advisory_xact_lock(p_character_id)`로 캐릭터 단위
잠금을 잡고 시작한다 (동시 장착 클릭으로 같은 슬롯에 두 아이템이 장착되는 경쟁 방지).

**`p_equip = true` 경로:**
1. 대상 `character_inventory` 행이 `character_id = p_character_id`이고 그 캐릭터가
   `user_id = p_user_id` 소유인지 확인 (아니면 `RAISE EXCEPTION 'item_not_found'`).
2. 조인한 `item_templates.equip_slot`이 NULL이면 애초에 장착 불가
   (`RAISE EXCEPTION 'not_equippable'`).
3. 캐릭터의 `level`/`character_class`와 아이템의 `required_level`/`required_class`
   비교, 미달 시 각각 `RAISE EXCEPTION 'level_requirement_unmet'` /
   `RAISE EXCEPTION 'class_requirement_unmet'`.
4. 같은 캐릭터의 같은 `equip_slot`에 이미 장착된 다른 행이 있으면 그 행을
   `is_equipped=false, equipped_slot=NULL`로 먼저 해제.
5. 대상 행을 `is_equipped=true, equipped_slot=<아이템의 equip_slot>`로 갱신.
6. 해당 캐릭터의 전체 `character_inventory` 행을 반환 (조인 없는 raw 행 —
   `item_templates`와의 조인/denormalize는 RPC가 아니라 Edge Function 쪽의 공용
   헬퍼가 담당한다. GET 목록 조회와 equip/unequip 응답이 정확히 같은 모양이 되도록,
   두 경로 모두 "인벤토리 조회+조인" 헬퍼 함수 하나를 공유하고 RPC는 그 헬퍼를
   다시 부르기 위한 트리거 역할만 한다).

**`p_equip = false` 경로:** 대상 행 소유권만 확인하고 `is_equipped=false,
equipped_slot=NULL`로 갱신 후 전체 인벤토리 반환 (마찬가지로 raw 행).

에러는 `create_character`와 동일하게 `RAISE EXCEPTION '<reason>' USING ERRCODE = 'P0001'`
패턴으로 던지고, Edge Function이 메시지 텍스트로 구분해서 적절한 HTTP 상태/이유
코드로 변환한다 (`characters.ts`의 기존 `create_character` 에러 매핑과 동일한 관례).

## 새 엔드포인트 (`characters.ts`)

기존 `charactersRoutes`(이미 `requireAuth` 미들웨어 적용됨)에 추가:

- **`GET /characters/me/inventory`** — 활성 캐릭터의 `character_inventory`를
  `item_templates`와 조인해서 조회, 각 슬롯에 이름/타입/장비슬롯/공격보너스/
  방어보너스/필요레벨/필요직업을 denormalize해서 반환 (클라이언트가 supabase-js를
  쓰지 않고 이 API로만 통신하므로, 화면에 필요한 정보를 서버가 다 채워서 내려줘야
  함). 활성 캐릭터가 없으면 기존 `/characters/me`와 동일하게 404
  `no_active_character`.
- **`POST /characters/me/inventory/:id/equip`** — `set_item_equipped(..., true)` 호출,
  성공 시 갱신된 인벤토리 배열 반환. RPC 예외를 `item_not_found`(404),
  `not_equippable`/`level_requirement_unmet`/`class_requirement_unmet`(400)로 매핑.
- **`POST /characters/me/inventory/:id/unequip`** — 위와 동일하되
  `set_item_equipped(..., false)`.

`InventorySlot` 타입(`src/types/api.ts`)을 다음 필드로 확장한다:
`item_name`, `item_type`, `equip_slot`, `attack_bonus`, `defense_bonus`,
`required_level`, `required_class`.

## 전투 스탯 반영 (클라이언트)

- `combatStore.init()`이 캐릭터를 로드할 때, 넘겨받은 `equipped_items`(또는
  인벤토리 중 `is_equipped=true`인 항목들)의 `attack_bonus`/`defense_bonus` 합을
  `character.attack_power`/`defense_power`(기본값)에 더해서 `player.attackPower`/
  `defensePower` 초기값을 계산한다 — 지금 로컬 스탯 배분을 얹는 방식과 동일한 위치.
- `characterStore`에 인벤토리 조회/장착/해제 액션을 추가한다 (`src/api/characters.ts`에
  대응 API 함수 3개 추가: `getInventory`, `equipItem`, `unequipItem`).
- 장착/해제 API 호출이 성공하면, 응답으로 받은 새 인벤토리 목록에서 새로 장착/해제된
  아이템의 보너스 델타를 계산해 `combatStore`에 즉시 반영하는 액션
  (`applyEquipmentDelta(attackDelta, defenseDelta)`)을 추가한다 — 전투 중 HP 등
  다른 상태를 건드리지 않고 공격력/방어력만 조정.

## 클라이언트 UI

`CharacterPanel.tsx`에 이미 있는 스탯 패널 위에 탭 두 개(스탯/인벤토리)를 추가한다.
인벤토리 탭은 슬롯 목록을 표시하고(이름, 장착 여부, 필요레벨/직업 미달 시 비활성화된
장착 버튼), 슬롯별로 장착/해제 버튼을 토글식으로 보여준다. 새 모달을 따로 만들지
않고 기존 패널 안에서 확장한다.

## 에러 처리 요약

| 상황 | HTTP | error/reason |
|---|---|---|
| 활성 캐릭터 없음 | 404 | `not_found` / `no_active_character` |
| 남의 인벤토리 항목 또는 존재하지 않는 id | 404 | `not_found` / `item_not_found` |
| 장착 불가 아이템(`equip_slot IS NULL`) | 400 | `validation_failed` / `not_equippable` |
| 레벨 부족 | 400 | `level_requirement_unmet` / `insufficient_level` |
| 직업 불일치 | 400 | `validation_failed` / `class_requirement_unmet` |

## 테스트 계획

- **DB/RPC:** `execute_sql`로 `set_item_equipped` 직접 호출 — 정상 장착, 슬롯 교체(같은
  슬롯에 다른 아이템 장착 시 기존 것 자동 해제), 레벨/직업 불일치 거부, 소유하지 않은
  캐릭터의 인벤토리 항목 거부를 각각 확인.
- **Edge Function:** `curl`로 세 엔드포인트 각각의 성공/실패 케이스.
- **클라이언트:** 새 캐릭터 생성 → 인벤토리 탭에서 시작 장비 2개 확인 → 장착 →
  `CharacterPanel`의 공격력/방어력 수치가 즉시 올라가는지 브라우저로 확인 → 해제 시
  원래대로 돌아오는지 확인.
