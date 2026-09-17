# BackendX 이전 검토용 — Supabase 백엔드에 새로 추가된 기능 스펙

작성일: 2026-09-17
목적: `main`(BackendX 연동) 브랜치를 계속 쓸지, 지금까지 Supabase로 새로 만든 백엔드 기능을 BackendX 쪽에서도 구현 가능한지 확인하기 위한 자료. BackendX 담당자/지원팀에 그대로 전달해서 "이런 API/로직들을 추가로 구현할 수 있는가?"를 물어보는 용도.

## 1. 원래 스펙 (BackendX, 변경 없음)

`HANDOFF.md`에 정리된 Phase 1 스펙 그대로 — 회원가입/로그인/캐릭터 생성·선택·삭제/맵 입장, admin master-data(maps/monsters/items/drops/spawns/skills/quests/shops) CRUD. **단, 캐릭터 생성 시 500 에러가 4회 재현되어 미해결 상태였음** — 이 문서의 새 기능들을 검토하기 전에, 이 블로커가 먼저 해결됐는지 확인 필요.

## 2. 새로 추가된 기능 (BackendX 원래 스펙에는 없음)

### 2.1 인벤토리 / 장비

**데이터 모델**
- 새 테이블 `character_inventory`: `id, character_id, item_template_id, storage_type, slot_index, quantity, enchant_level, is_equipped, equipped_slot`
- `item_templates`에 컬럼 추가: `equip_slot`(null 가능 — null이면 장착 불가/소모품), `attack_bonus`, `defense_bonus`, `required_level`, `required_class`(null=전직업), `buy_price`, `sell_price`, `heal_hp`
- `characters`에 `equipped_items` (JSONB, 캐시용 — 실제 소스는 `character_inventory`)

**엔드포인트** (전부 `Authorization: Bearer <token>` 필요)
- `GET /characters/me/inventory` → `{ items: InventoryItem[] }`
- `POST /characters/me/inventory/:id/equip` / `.../unequip` → 장착/해제 후 `{ items: InventoryItem[] }`
  - **원자적 RPC로 처리해야 함** (`pg_advisory_xact_lock` 사용 중): 같은 `equipped_slot`에 다른 아이템이 이미 장착돼 있으면 자동 교체, 레벨/직업 요구조건 미달 시 실패
- `POST /characters/me/inventory/:id/sell` → 인벤토리 행 수량 1 감소(0이면 행 삭제) 후 `{ items: [...] }`. **골드는 서버가 건드리지 않음** — 클라이언트가 자기 골드를 알아서 조정 (아래 2.4 참고)
- `POST /characters/me/inventory/:id/use` → 소모품(heal_hp > 0) 사용, 수량 감소. **HP도 서버가 건드리지 않음** — 클라이언트가 `heal_hp` 값을 읽어서 알아서 적용

**InventoryItem 응답 형태** (item_templates와 join해서 평탄화):
```json
{ "id": 1, "item_template_id": 7, "slot_index": 0, "quantity": 3, "enchant_level": 0,
  "is_equipped": false, "equipped_slot": null,
  "item_name": "체력 물약", "item_type": "consumable", "equip_slot": null,
  "attack_bonus": 0, "defense_bonus": 0, "required_level": 1, "required_class": null,
  "buy_price": 15, "sell_price": 4, "heal_hp": 40 }
```

### 2.2 상점

- `GET /characters/me/shop?kind=merchant|blacksmith` → `{ items: ShopItem[] }` (blacksmith는 `item_type in (weapon, armor)`, merchant는 나머지)
- `POST /characters/me/inventory/buy` `{ item_template_id }` → 인벤토리에 추가(소모품은 기존 스택에 합침) 후 `{ items: [...] }`. **가격 검증/골드 차감 없음** — 클라이언트가 표시된 가격을 보고 자기 골드에서 차감

### 2.3 진행 상황 저장 (레벨/경험치/스탯/HP/MP)

- `PATCH /characters/me/progress` — body에 아래 14개 필드 **전부 필수**, 각각 0 이상 정수 + 필드별 상한 검증:
```json
{ "level": 3, "experience": 40, "skill_points": 2,
  "attack_power": 15, "defense_power": 7,
  "max_hp": 140, "current_hp": 140, "max_mp": 20, "current_mp": 20,
  "stat_str": 5, "stat_dex": 8, "stat_con": 6, "stat_int": 5, "stat_wis": 5 }
```
  → `characters` 테이블의 해당 컬럼들을 그대로 업데이트, `{}` 반환. **레벨업/스탯 배분 로직 자체는 클라이언트가 계산**해서 결과값만 보냄 — 서버는 "이 값이 타입/범위에 맞는가"만 검증하고 그대로 저장.
- `characters` 테이블에 새 컬럼: `current_mp, max_mp, attack_power, defense_power, skill_points, stat_str, stat_dex, stat_con, stat_int, stat_wis` — 전부 정수, 기본값 있음 (스탯 5종은 5, 나머지는 게임 밸런스값)

**BackendX에서 확인 필요한 점**: 이 라우트는 "게임 로직 없이 그냥 값을 받아서 저장"이라 커스텀 서버 코드 없이도 admin API 스키마 확장만으로 될 수도 있음. 단, 필드별 상한값 검증(예: `level <= 999`)은 필요.

### 2.4 위치 저장

- `PATCH /characters/me/position` `{ position_x, position_y, position_z, current_map_id? }` (정수) → 로그아웃 후 재접속 시 마지막 위치로 복귀시키기 위한 주기적 저장(15초 간격) + 로그아웃 시 1회.

### 2.5 설계상 중요한 특징 — "클라이언트 권위(client-authoritative)" 패턴

이번 Supabase 백엔드는 전투 계산(공격력·데미지·경험치·레벨업)과 골드를 **전부 클라이언트 메모리에서 계산**하고, 서버는:
- 인벤토리 행 CRUD와 아이템 템플릿 데이터만 관리 (골드/HP는 절대 검증 안 함)
- 위 2.3의 `progress` 라우트로 "결과값 저장"만 담당 (계산 로직은 없음)

이건 명시적으로 선택한 설계(속도/단순성 우선, 추후 PvP/공유 경제가 생기면 재검토)라서, BackendX에서 똑같이 구현하려면 **복잡한 게임 로직을 서버에 새로 짤 필요는 없고**, 단순 CRUD + 타입/범위 검증 엔드포인트 몇 개만 추가하면 됨. 다만 아래 항목은 원자성(atomic)이 필요:
- 장착/해제 시 "같은 슬롯 기존 아이템 자동 해제" — 동시 요청 시 레이스 컨디션 방지

## 3. BackendX에 물어볼 질문 리스트

1. 캐릭터 생성 500 에러가 해결됐는가? (선결 조건)
2. `character_inventory` 같은 새 테이블/관계를 admin에서 직접 만들 수 있는가, 아니면 BackendX 쪽에서 스키마 마이그레이션을 해줘야 하는가?
3. `item_templates`에 커스텀 컬럼(`equip_slot`, `attack_bonus` 등)을 추가할 수 있는가?
4. "장착 시 같은 슬롯 자동 교체" 같은 원자적 트랜잭션 로직을 커스텀 엔드포인트로 추가할 수 있는가, 아니면 admin API로 표현 가능한 범위 내에서만 가능한가?
5. 위 2.1~2.4의 엔드포인트들을 커스텀 라우트로 추가하는 데 걸리는 기간/비용은?

## 4. 결론 (검토 결과, 별도 논의 필요)

지금 시점에는 위 질문들에 대한 답이 없어서 "가능한지" 확정할 수 없음 — 이 문서를 BackendX에 전달해서 회신을 받은 뒤 판단.
