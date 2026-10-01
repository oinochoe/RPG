# 발견물(Discoveries) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월드에 조사할 수 있는 오브젝트·NPC(발견물)를 데이터로 정의하고, 조사하면 대사가 나오며 일부는 서버가 판정하는 보상(캐릭터당 한 번)을 준다. 그 틀 위에 초기 콘텐츠 약 24개를 올린다.

**Architecture:** `discoveries.ts`(순수 데이터·조건 판정·격자 검색)가 정의를 갖고, `DiscoveryProximity`가 가까운 발견물을 `uiStore.nearDiscoveryId`로 알리며, 기존 `interactions.ts`(Space·터치 행동 버튼·클릭 말 걸기)가 `DiscoveryDialog`를 연다. 보상이 있는 발견물은 `POST /characters/me/discoveries/:id/claim`으로 서버가 검증·지급한다(서버 표 `supabase/functions/api/discoveries.ts`가 보상 값의 유일한 출처).

**Tech Stack:** React 18 + R3F + zustand, Supabase(Postgres + Deno/Hono 엣지 함수), vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-discoveries-design.md`

## 스펙과 달라진 점 (구현 근거)

- **위치 검증은 하지 않는다(결정, Ruling).** 스펙은 요청에 현재 위치를 실어 거리를 검증한다고 했지만, 서버가 아는 위치는 15초 주기 저장이라 정확하지 않고(순간이동 주문서·빠른 이동으로 오탐), 어차피 클라이언트가 보고하는 값이라 위조가 가능하다. 킬 보고도 위치를 검증하지 않고 상한으로만 막는다. 실질적 방어선은 **한 캐릭터당 한 번 + 서버 표의 소량 보상 + 레벨 조건**이다. 요청 본문은 비운다(경로의 id만 사용). 최대 노출 = 서버 표의 전체 보상 합(수천 골드 수준)으로 제한된다.
- **지급은 하나의 RPC + 아이템 지급.** `claim_discovery` RPC가 한 트랜잭션에서 중복 방지 행 삽입과 XP/골드(`grant_progress`)를 처리하고, 아이템은 퀘스트 보상처럼 이어서 `grantInventoryItem`으로 준다. 아이템 지급이 실패하면 방금 넣은 행을 지워 다시 시도할 수 있게 한다.
- **순수 웃음 발견물의 "봤음" 기록**은 서버가 아니라 `localStorage`(캐릭터별, try/catch)에만 둔다.
- **`trigger` 종류는 이번 라운드 콘텐츠에서 최소한(2~3개)만 쓴다.** 틀(타입·감지)은 만들지만 대부분의 콘텐츠는 `inspect`/`npc`.
- **소품 렌더 반경은 60 유닛** 안의 발견물만 마운트한다.

## Global Constraints

- 보상 수치·보상 발견물의 존재는 **서버 표(`supabase/functions/api/discoveries.ts`)가 유일한 출처**다. 클라이언트 정의의 `reward`는 표시용 사본이고, 테스트가 서버 표와 일치함을 강제한다.
- `supabase/functions/api/discoveries.ts`는 import가 없는 순수 모듈(vitest가 직접 import한다).
- three.js 재질·색에는 CSS 변수 금지(hex). 라이트 추가 금지. 소품은 공유 지오메트리.
- 새 발견물 id는 영문 소문자·숫자·하이픈(예: `sulky-rock`), 서버 표와 같은 문자열.
- 주석은 영어(서버 파일은 기존 규약), **대사·이름·지도 문구는 한국어**, 커밋 메시지는 한글, 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- 작업은 워크트리에서 하고 `npm ci`한다(`node_modules` 심볼릭 링크 금지). 마이그레이션 SQL은 **적용하지 않고** 파일만 만든다(사용자가 SQL Editor에서 실행; 한 줄씩 짧은 문장으로, `BEGIN/COMMIT` 없이).
- 대소문자만 다른 파일명 쌍을 만들지 않는다(Windows). 특히 `DiscoveryDialog.tsx`와 `discoveries.ts`처럼 접두만 같은 건 괜찮지만 `Discoveries.ts`/`discoveries.ts`는 금지.

## Review Focus

- 같은 발견물을 두 번 요청해도 보상은 한 번만 지급된다(두 요청이 동시에 와도). (Task 2, 3)
- 서버 표에 없는 id, 레벨이 모자란 요청은 거절되고 아무것도 지급되지 않는다. (Task 2)
- 클라이언트가 값을 조작해도 보상 크기는 서버 표 값이다(요청 본문에 보상 필드가 없음). (Task 3)
- 아이템 지급 실패 시 중복 방지 행이 되돌려져 재시도할 수 있다. (Task 3)
- 근접 우선순위: 상점/퀘스트 NPC가 있는 곳에서는 기존 동작이 그대로이고, 발견물은 그 다음이다. (Task 4)
- 던전 안에서는 발견물 감지가 꺼진다. (Task 4)
- `requires`가 순환·존재하지 않는 id를 가리키면 정의 검증 테스트가 실패한다. (Task 1)
- 발견물 위치가 충돌물·강·마을 부지 안에 있지 않아 닿을 수 있다. (Task 1, 7)
- 숨겨진 발견물은 발견 전에 지도에 나타나지 않는다. (Task 6)
- 대사 패널이 열려 있는 동안 이동/전투 입력 중복 처리가 없다(기존 패널 규약). (Task 5)

---

### Task 1: 정의 타입, 조건 판정, 격자 검색, 정의 검증 (순수 로직)

**Files:**
- Create: `src/components/game/discoveries.ts` (타입 + 헬퍼 + 빈 `DISCOVERIES`; 실제 콘텐츠는 Task 7)
- Create: `src/components/game/discoveryLogic.ts` (조건 판정, 격자 인덱스, 정의 검증)
- Test: `src/components/game/discoveryLogic.test.ts`

**Interfaces:**
- Produces (`discoveries.ts`): `type DiscoveryKind = 'inspect' | 'npc' | 'trigger'`; `type PropPreset = 'rock' | 'signpost' | 'pit' | 'mushrooms' | 'sparkle' | 'statue' | 'none'`; `type Requirement = { type: 'level'; min: number } | { type: 'seen'; id: string } | { type: 'zone'; zone: 'village' | 'desert' | 'fairy' | 'orc' | 'bone' | 'ghoul' | 'field' }`; `interface DiscoveryReward { gold?: number; xp?: number; itemTemplateId?: number; itemName?: string; itemQty?: number }`; `interface DiscoveryDef { id; kind; name; position: [number, number]; radius: number; prop: PropPreset; npcKind?: NpcKind; hidden?: boolean; requires?: Requirement[]; lines: string[]; afterLines?: string[]; reward?: DiscoveryReward }`; `const DISCOVERIES: DiscoveryDef[] = []`.
- Produces (`discoveryLogic.ts`): `requirementMet(req, ctx: { level: number; seen: ReadonlySet<string>; zoneAt: (x: number, z: number) => string }, pos: [number, number]): boolean`, `isAvailable(def, ctx): boolean`, `buildGrid(defs, cell = 16)`, `queryGrid(grid, x, z, maxDist): DiscoveryDef[]`, `nearestInRange(grid, x, z, ctx): DiscoveryDef | null` (가장 가까운, 반경 안, 조건 충족, `trigger` 제외), `validateDefs(defs): string[]` (문제 설명 목록; 비어 있으면 통과).
- `NpcKind`는 `./NPC`의 타입을 `import type`으로만 가져온다(런타임 import 금지: three.js 번들 회피).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/game/discoveryLogic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DiscoveryDef } from './discoveries';
import { buildGrid, isAvailable, nearestInRange, queryGrid, requirementMet, validateDefs } from './discoveryLogic';

const def = (over: Partial<DiscoveryDef> & { id: string }): DiscoveryDef => ({
  kind: 'inspect',
  name: '테스트',
  position: [0, 0],
  radius: 2,
  prop: 'rock',
  lines: ['...'],
  ...over,
});
const ctx = (over: Partial<{ level: number; seen: string[]; zone: string }> = {}) => ({
  level: over.level ?? 1,
  seen: new Set(over.seen ?? []),
  zoneAt: () => over.zone ?? 'field',
});

describe('requirementMet / isAvailable', () => {
  it('checks level, seen and zone requirements', () => {
    expect(requirementMet({ type: 'level', min: 5 }, ctx({ level: 4 }), [0, 0])).toBe(false);
    expect(requirementMet({ type: 'level', min: 5 }, ctx({ level: 5 }), [0, 0])).toBe(true);
    expect(requirementMet({ type: 'seen', id: 'a' }, ctx({ seen: ['a'] }), [0, 0])).toBe(true);
    expect(requirementMet({ type: 'seen', id: 'a' }, ctx(), [0, 0])).toBe(false);
    expect(requirementMet({ type: 'zone', zone: 'desert' }, ctx({ zone: 'desert' }), [0, 0])).toBe(true);
    expect(requirementMet({ type: 'zone', zone: 'desert' }, ctx({ zone: 'field' }), [0, 0])).toBe(false);
  });
  it('a discovery with no requirements is always available; all requirements must hold', () => {
    expect(isAvailable(def({ id: 'x' }), ctx())).toBe(true);
    const d = def({ id: 'y', requires: [{ type: 'level', min: 3 }, { type: 'seen', id: 'x' }] });
    expect(isAvailable(d, ctx({ level: 3 }))).toBe(false);
    expect(isAvailable(d, ctx({ level: 3, seen: ['x'] }))).toBe(true);
  });
});

describe('grid search', () => {
  const defs = [def({ id: 'a', position: [0, 0] }), def({ id: 'b', position: [100, 100] }), def({ id: 'c', position: [3, 0], radius: 4 })];
  const grid = buildGrid(defs);
  it('finds only entries near the query point', () => {
    expect(queryGrid(grid, 0, 0, 10).map((d) => d.id).sort()).toEqual(['a', 'c']);
    expect(queryGrid(grid, 100, 100, 10).map((d) => d.id)).toEqual(['b']);
    expect(queryGrid(grid, -500, -500, 10)).toEqual([]);
  });
  it('picks the nearest in-range, available inspect/npc discovery', () => {
    expect(nearestInRange(grid, 2.5, 0, ctx())?.id).toBe('c'); // c is closer (0.5) than a (2.5)
    expect(nearestInRange(grid, 50, 50, ctx())).toBeNull();
  });
  it('ignores trigger discoveries and unavailable ones', () => {
    const g = buildGrid([def({ id: 't', kind: 'trigger' }), def({ id: 'locked', requires: [{ type: 'level', min: 9 }] })]);
    expect(nearestInRange(g, 0, 0, ctx())).toBeNull();
  });
  it('only counts a discovery when the player is within its own radius', () => {
    const g = buildGrid([def({ id: 'small', radius: 1 })]);
    expect(nearestInRange(g, 1.5, 0, ctx())).toBeNull();
    expect(nearestInRange(g, 0.9, 0, ctx())?.id).toBe('small');
  });
});

describe('validateDefs', () => {
  it('accepts a clean list', () => {
    expect(validateDefs([def({ id: 'a' }), def({ id: 'b', requires: [{ type: 'seen', id: 'a' }] })])).toEqual([]);
  });
  it('rejects duplicate ids, bad radius, empty lines, bad id characters', () => {
    const problems = validateDefs([def({ id: 'a' }), def({ id: 'a' }), def({ id: 'Bad_Id' }), def({ id: 'r', radius: 0 }), def({ id: 'l', lines: [] })]);
    expect(problems.join('\n')).toMatch(/duplicate/i);
    expect(problems.join('\n')).toMatch(/Bad_Id/);
    expect(problems.join('\n')).toMatch(/radius/i);
    expect(problems.join('\n')).toMatch(/lines/i);
  });
  it('rejects a seen-requirement that points nowhere or forms a cycle', () => {
    expect(validateDefs([def({ id: 'a', requires: [{ type: 'seen', id: 'ghost' }] })]).join()).toMatch(/ghost/);
    const cyc = validateDefs([def({ id: 'a', requires: [{ type: 'seen', id: 'b' }] }), def({ id: 'b', requires: [{ type: 'seen', id: 'a' }] })]);
    expect(cyc.join()).toMatch(/cycle/i);
  });
  it('requires an npc discovery to name its model kind, and rewards to be positive', () => {
    expect(validateDefs([def({ id: 'n', kind: 'npc' })]).join()).toMatch(/npcKind/);
    expect(validateDefs([def({ id: 'g', reward: { gold: -5 } })]).join()).toMatch(/reward/i);
    expect(validateDefs([def({ id: 'e', reward: {} })]).join()).toMatch(/reward/i);
  });
});
```

Run: `npx vitest run src/components/game/discoveryLogic.test.ts` → FAIL (모듈 없음).

- [ ] **Step 2: `discoveries.ts` 작성**

```ts
import type { NpcKind } from './NPC';

// Plain data — no three.js, so stores and server-table tests can read it. The reward numbers here are a
// display copy: the real amounts live in supabase/functions/api/discoveries.ts (a test keeps them equal).

export type DiscoveryKind = 'inspect' | 'npc' | 'trigger';
export type PropPreset = 'rock' | 'signpost' | 'pit' | 'mushrooms' | 'sparkle' | 'statue' | 'none';
export type ZoneName = 'village' | 'desert' | 'fairy' | 'orc' | 'bone' | 'ghoul' | 'field';

export type Requirement =
  | { type: 'level'; min: number }
  | { type: 'seen'; id: string }
  | { type: 'zone'; zone: ZoneName };

export interface DiscoveryReward {
  gold?: number;
  xp?: number;
  itemTemplateId?: number;
  /** Shown in the dialog; the server decides what is actually granted. */
  itemName?: string;
  itemQty?: number;
}

export interface DiscoveryDef {
  /** Stable key, also the server table key. Lowercase letters, digits, hyphens. */
  id: string;
  kind: DiscoveryKind;
  name: string;
  position: [number, number];
  radius: number;
  prop: PropPreset;
  /** Model for an `npc` discovery (reuses NPC.tsx's kinds). */
  npcKind?: NpcKind;
  /** Hidden until found: not on the map and no sparkle hint. */
  hidden?: boolean;
  requires?: Requirement[];
  lines: string[];
  /** What it says once already seen/claimed. */
  afterLines?: string[];
  reward?: DiscoveryReward;
}

// Filled in by the content task (see discoveryContent.ts); kept separate so this file stays a pure type module.
export const DISCOVERIES: DiscoveryDef[] = [];
```

(콘텐츠 파일 구조는 Task 7에서 `discoveryContent.ts`가 `DISCOVERIES`를 채우도록 결정한다. 이 단계에서는 빈 배열이어도 된다. 타입은 `DiscoveryDef`의 `NpcKind` 가져오기가 순환을 만들지 않는지 `npx tsc -b`로 확인한다.)

- [ ] **Step 3: `discoveryLogic.ts` 구현**

```ts
import type { DiscoveryDef, Requirement } from './discoveries';

export interface DiscoveryContext {
  level: number;
  seen: ReadonlySet<string>;
  /** Which zone a point is in (see worldColliders' in*Zone helpers); injected so this file stays pure. */
  zoneAt: (x: number, z: number) => string;
}

export function requirementMet(req: Requirement, ctx: DiscoveryContext, pos: [number, number]): boolean {
  switch (req.type) {
    case 'level':
      return ctx.level >= req.min;
    case 'seen':
      return ctx.seen.has(req.id);
    case 'zone':
      return ctx.zoneAt(pos[0], pos[1]) === req.zone;
  }
}

export function isAvailable(def: DiscoveryDef, ctx: DiscoveryContext): boolean {
  return (def.requires ?? []).every((r) => requirementMet(r, ctx, def.position));
}

export interface DiscoveryGrid {
  cell: number;
  cells: Map<string, DiscoveryDef[]>;
}

const key = (cx: number, cz: number) => `${cx},${cz}`;

export function buildGrid(defs: readonly DiscoveryDef[], cell = 16): DiscoveryGrid {
  const cells = new Map<string, DiscoveryDef[]>();
  for (const d of defs) {
    const k = key(Math.floor(d.position[0] / cell), Math.floor(d.position[1] / cell));
    const list = cells.get(k);
    if (list) list.push(d);
    else cells.set(k, [d]);
  }
  return { cell, cells };
}

/** Everything in the cells that could be within `maxDist` of (x, z). Callers still check exact distance. */
export function queryGrid(grid: DiscoveryGrid, x: number, z: number, maxDist: number): DiscoveryDef[] {
  const r = Math.ceil(maxDist / grid.cell);
  const cx = Math.floor(x / grid.cell);
  const cz = Math.floor(z / grid.cell);
  const out: DiscoveryDef[] = [];
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iz = cz - r; iz <= cz + r; iz++) {
      const list = grid.cells.get(key(ix, iz));
      if (list) out.push(...list);
    }
  }
  return out;
}

const MAX_RADIUS_IN_GRID = 8;

/** The nearest inspect/npc discovery whose own radius contains the player and whose requirements hold. */
export function nearestInRange(grid: DiscoveryGrid, x: number, z: number, ctx: DiscoveryContext): DiscoveryDef | null {
  let best: DiscoveryDef | null = null;
  let bestDist = Infinity;
  for (const d of queryGrid(grid, x, z, MAX_RADIUS_IN_GRID)) {
    if (d.kind === 'trigger') continue;
    const dist = Math.hypot(x - d.position[0], z - d.position[1]);
    if (dist > d.radius || dist >= bestDist) continue;
    if (!isAvailable(d, ctx)) continue;
    best = d;
    bestDist = dist;
  }
  return best;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Human-readable problems with a definition list; empty means it is sound. */
export function validateDefs(defs: readonly DiscoveryDef[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) problems.push(`duplicate id: ${d.id}`);
    ids.add(d.id);
    if (!ID_PATTERN.test(d.id)) problems.push(`bad id (lowercase, digits, hyphens): ${d.id}`);
    if (!(d.radius > 0)) problems.push(`${d.id}: radius must be positive`);
    if (d.lines.length === 0 || d.lines.some((l) => l.trim() === '')) problems.push(`${d.id}: lines must be non-empty`);
    if (d.kind === 'npc' && !d.npcKind) problems.push(`${d.id}: an npc discovery needs npcKind`);
    if (d.reward) {
      const { gold, xp, itemTemplateId, itemQty } = d.reward;
      const hasAny = gold !== undefined || xp !== undefined || itemTemplateId !== undefined;
      if (!hasAny) problems.push(`${d.id}: reward is empty`);
      if (gold !== undefined && !(gold > 0)) problems.push(`${d.id}: reward gold must be positive`);
      if (xp !== undefined && !(xp > 0)) problems.push(`${d.id}: reward xp must be positive`);
      if (itemQty !== undefined && !(itemQty > 0)) problems.push(`${d.id}: reward itemQty must be positive`);
    }
  }
  for (const d of defs) {
    for (const r of d.requires ?? []) {
      if (r.type === 'seen' && !ids.has(r.id)) problems.push(`${d.id}: requires unknown discovery ${r.id}`);
    }
  }
  // Cycle check over `seen` requirements (depth-first with a path set).
  const byId = new Map(defs.map((d) => [d.id, d]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const r of byId.get(id)?.requires ?? []) {
      if (r.type === 'seen' && byId.has(r.id) && visit(r.id)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  };
  for (const d of defs) {
    if (visit(d.id)) {
      problems.push(`cycle in seen requirements involving ${d.id}`);
      break;
    }
  }
  return problems;
}
```

- [ ] **Step 4: 통과 확인과 커밋**

Run: `npx vitest run src/components/game/discoveryLogic.test.ts && npx tsc -b`
Expected: PASS(모든 테스트), tsc 오류 없음.

```bash
git add src/components/game/discoveries.ts src/components/game/discoveryLogic.ts src/components/game/discoveryLogic.test.ts
git commit -m "feat(discoveries): 발견물 정의 타입, 조건 판정, 격자 검색, 정의 검증

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 — 마이그레이션, 서버 표, 지급 판정

**Files:**
- Create: `supabase/migrations/20261002010000_character_discoveries.sql`
- Create: `supabase/functions/api/discoveries.ts` (순수, import 없음)
- Test: `src/stores/discoveries.server.test.ts`

**Interfaces:**
- Produces (`discoveries.ts` 서버): `interface RewardEntry { minLevel: number; gold?: number; xp?: number; itemTemplateId?: number; itemQty?: number }`, `DISCOVERY_REWARDS: Record<string, RewardEntry>`(Task 7에서 채움; 이 작업에서는 아래 테스트용 소수의 항목만 두지 말고 **빈 객체**로 두되 `MAX_*` 상한 상수와 판정 함수를 완성), `MAX_GOLD_PER_DISCOVERY = 500`, `MAX_XP_PER_DISCOVERY = 200`, `MAX_ITEM_QTY = 5`, `type ClaimCheck = { ok: true; reward: RewardEntry } | { ok: false; reason: 'unknown_discovery' | 'level_too_low' }`, `checkClaim(id: string, level: number, table?: Record<string, RewardEntry>): ClaimCheck`, `validateRewardTable(table): string[]`.
- Produces (SQL): 테이블 `public.character_discoveries`, 함수 `public.claim_discovery(p_user_id INT, p_character_id INT, p_discovery_id TEXT, p_xp INT, p_gold INT) RETURNS BOOLEAN`(true = 새로 받음, 이미 받았으면 예외 `discovery_already_claimed`).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/discoveries.server.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_GOLD_PER_DISCOVERY, MAX_ITEM_QTY, MAX_XP_PER_DISCOVERY, checkClaim, validateRewardTable } from '../../supabase/functions/api/discoveries';

const table = {
  'sulky-rock': { minLevel: 1, gold: 40 },
  'deep-pit': { minLevel: 10, gold: 120, xp: 60, itemTemplateId: 12, itemQty: 2 },
};

describe('checkClaim', () => {
  it('accepts a known discovery at or above its level', () => {
    expect(checkClaim('sulky-rock', 1, table)).toEqual({ ok: true, reward: table['sulky-rock'] });
    expect(checkClaim('deep-pit', 10, table).ok).toBe(true);
  });
  it('rejects an unknown id (including prototype keys) and a too-low level', () => {
    expect(checkClaim('nope', 99, table)).toEqual({ ok: false, reason: 'unknown_discovery' });
    expect(checkClaim('constructor', 99, table)).toEqual({ ok: false, reason: 'unknown_discovery' });
    expect(checkClaim('__proto__', 99, table)).toEqual({ ok: false, reason: 'unknown_discovery' });
    expect(checkClaim('deep-pit', 9, table)).toEqual({ ok: false, reason: 'level_too_low' });
  });
});

describe('validateRewardTable', () => {
  it('accepts a sane table', () => {
    expect(validateRewardTable(table)).toEqual([]);
  });
  it('rejects empty, negative and over-cap rewards', () => {
    const bad = validateRewardTable({
      a: { minLevel: 1 },
      b: { minLevel: 1, gold: -1 },
      c: { minLevel: 1, gold: MAX_GOLD_PER_DISCOVERY + 1 },
      d: { minLevel: 1, xp: MAX_XP_PER_DISCOVERY + 1 },
      e: { minLevel: 1, itemTemplateId: 12, itemQty: MAX_ITEM_QTY + 1 },
      f: { minLevel: 0, gold: 1 },
    });
    const text = bad.join('\n');
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(text).toContain(id + ':');
  });
  it('requires an item quantity of at least 1 whenever an item is given (defaults to 1 when omitted)', () => {
    expect(validateRewardTable({ x: { minLevel: 1, itemTemplateId: 7 } })).toEqual([]);
    expect(validateRewardTable({ x: { minLevel: 1, itemTemplateId: 7, itemQty: 0 } }).join()).toMatch(/x:/);
  });
});
```

Run: `npx vitest run src/stores/discoveries.server.test.ts` → FAIL (모듈 없음).

- [ ] **Step 2: 서버 표 모듈 구현**

`supabase/functions/api/discoveries.ts`:

```ts
// Server-side discovery rewards — pure module with NO imports so vitest can import it (like drops.ts).
// A client "discovery" is only a place where something funny happens; anything that PAYS OUT must be listed
// here. The client sends just the discovery id; every amount below is read from this table, never from the
// request. Each character can claim each id once (character_discoveries primary key).
//
// Position is deliberately NOT verified: the server only knows the position the client last saved, and the
// kill reports are validated the same way (plausibility, not geometry). The real limits are once-per-
// character, the small amounts below, and the caps enforced by validateRewardTable.

export interface RewardEntry {
  minLevel: number;
  gold?: number;
  xp?: number;
  itemTemplateId?: number;
  itemQty?: number;
}

export const MAX_GOLD_PER_DISCOVERY = 500;
export const MAX_XP_PER_DISCOVERY = 200;
export const MAX_ITEM_QTY = 5;

// Filled in by the content task; ids match the client's discoveries (a test keeps the two in sync).
export const DISCOVERY_REWARDS: Record<string, RewardEntry> = {};

export type ClaimCheck = { ok: true; reward: RewardEntry } | { ok: false; reason: "unknown_discovery" | "level_too_low" };

export function checkClaim(
  id: string,
  level: number,
  table: Record<string, RewardEntry> = DISCOVERY_REWARDS,
): ClaimCheck {
  // hasOwn: "constructor"/"__proto__" must not resolve to something on Object.prototype.
  if (!Object.prototype.hasOwnProperty.call(table, id)) return { ok: false, reason: "unknown_discovery" };
  const reward = table[id];
  if (level < reward.minLevel) return { ok: false, reason: "level_too_low" };
  return { ok: true, reward };
}

export function validateRewardTable(table: Record<string, RewardEntry>): string[] {
  const problems: string[] = [];
  for (const [id, r] of Object.entries(table)) {
    if (!(r.minLevel >= 1)) problems.push(`${id}: minLevel must be at least 1`);
    if (r.gold === undefined && r.xp === undefined && r.itemTemplateId === undefined) problems.push(`${id}: empty reward`);
    if (r.gold !== undefined && !(r.gold > 0 && r.gold <= MAX_GOLD_PER_DISCOVERY)) {
      problems.push(`${id}: gold must be 1..${MAX_GOLD_PER_DISCOVERY}`);
    }
    if (r.xp !== undefined && !(r.xp > 0 && r.xp <= MAX_XP_PER_DISCOVERY)) {
      problems.push(`${id}: xp must be 1..${MAX_XP_PER_DISCOVERY}`);
    }
    if (r.itemQty !== undefined && !(Number.isInteger(r.itemQty) && r.itemQty >= 1 && r.itemQty <= MAX_ITEM_QTY)) {
      problems.push(`${id}: itemQty must be 1..${MAX_ITEM_QTY}`);
    }
  }
  return problems;
}
```

- [ ] **Step 3: 마이그레이션 작성** (적용하지 않는다)

`supabase/migrations/20261002010000_character_discoveries.sql` — 문장은 한 줄씩 짧게, `BEGIN/COMMIT` 없이, 함수는 `$fn$` 구분자 사용:

```sql
-- One row per (character, discovery) that paid out a reward: the primary key is what makes a reward claimable once.
-- Rewards themselves come from the edge function's server table (supabase/functions/api/discoveries.ts).
CREATE TABLE IF NOT EXISTS public.character_discoveries (character_id INT NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE, discovery_id TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (character_id, discovery_id));
ALTER TABLE public.character_discoveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_discovery(p_user_id INT, p_character_id INT, p_discovery_id TEXT, p_xp INT, p_gold INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_char public.characters;
  v_inserted INT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);
  SELECT * INTO v_char FROM public.characters WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;
  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.character_discoveries (character_id, discovery_id) VALUES (p_character_id, p_discovery_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'discovery_already_claimed' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_xp, 0) > 0 OR COALESCE(p_gold, 0) > 0 THEN
    PERFORM public.grant_progress(p_character_id, COALESCE(p_xp, 0), COALESCE(p_gold, 0));
  END IF;
  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_discovery(INT, INT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discovery(INT, INT, TEXT, INT, INT) TO service_role;
```

(`grant_progress`의 시그니처가 `(INT, INT, INT)` = `(character_id, xp, gold)`인지 `supabase/migrations/20260929010000_server_authoritative_economy.sql:80` 근처에서 확인하고, 다르면 호출 인자 순서를 맞춘다. 또한 `characters.id`의 타입이 INT인지, 다른 테이블의 RLS 켜기 패턴(`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 후 정책 없음 = 서비스 롤만)과 같은지 확인한다. 이 SQL은 문장 사이 빈 줄 외에는 한 줄씩이며, 사용자가 SQL Editor에서 두 번(테이블 → 함수)에 나눠 실행할 수 있게 파일 안에 `-- ==== 1 ====`/`-- ==== 2 ====` 구분 주석을 넣는다.)

- [ ] **Step 4: 통과 확인과 커밋**

Run: `npx vitest run src/stores/discoveries.server.test.ts && npx tsc -b && npx vitest run`
Expected: 전부 통과.

```bash
git add supabase/functions/api/discoveries.ts supabase/migrations/20261002010000_character_discoveries.sql src/stores/discoveries.server.test.ts
git commit -m "feat(discoveries): 서버 보상 표와 판정, character_discoveries 마이그레이션

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 서버 엔드포인트와 클라이언트 API·스토어

**Files:**
- Modify: `supabase/functions/api/characters.ts` (`GET /me/discoveries`, `POST /me/discoveries/:id/claim`)
- Modify: `src/api/characters.ts`, `src/types/api.ts` (타입)
- Create: `src/stores/discoveryStore.ts`
- Test: `src/stores/discoveryStore.test.ts`

**Interfaces:**
- Consumes: `checkClaim`/`DISCOVERY_REWARDS` (Task 2), 기존 `getActiveCharacterId`, `grantInventoryItem`, `fetchProgressSnapshot`, `fetchInventory`, `mapQuestRpcError`류의 에러 매핑 방식, `ApiError`.
- Produces (서버): `GET /characters/me/discoveries` → `{ claimed: string[] }`; `POST /characters/me/discoveries/:id/claim` → `{ progress: ProgressSnapshot, inventory: InventoryListResponse, reward: { gold: number; xp: number; item_template_id: number | null; item_qty: number } }`; 이미 받음 → 409 `ApiError(409,"conflict","discovery_already_claimed",...)`; 모르는 id → 404 `discovery_not_found`; 레벨 부족 → 403 `discovery_level_too_low`.
- Produces (클라이언트 `api/characters.ts`): `listClaimedDiscoveries(): Promise<{ claimed: string[] }>`, `claimDiscovery(id: string): Promise<ClaimDiscoveryResponse>`.
- Produces (`discoveryStore.ts`, zustand): `{ claimed: Set<string>; seen: Set<string>; loaded: boolean; load(characterId: number): Promise<void>; markSeen(characterId: number, id: string): void; markClaimed(id: string): void; reset(): void }`. `seen`은 `claimed`(서버)와 로컬 `localStorage`(키 `rpg.discoveries.seen.<characterId>`, JSON 배열, try/catch)의 합집합.

- [ ] **Step 1: 클라이언트 스토어 테스트 작성(실패)**

`src/stores/discoveryStore.test.ts` — 기존 스토어 테스트 패턴을 따라 `../api/characters`를 `vi.mock`으로 대체한다:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  listClaimedDiscoveries: vi.fn(),
}));

import * as api from '../api/characters';
import { useDiscoveryStore } from './discoveryStore';

describe('useDiscoveryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscoveryStore.getState().reset();
    vi.mocked(api.listClaimedDiscoveries).mockReset();
  });

  it('loads the server-claimed ids and treats them as seen', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockResolvedValue({ claimed: ['a', 'b'] });
    await useDiscoveryStore.getState().load(7);
    const s = useDiscoveryStore.getState();
    expect(s.loaded).toBe(true);
    expect([...s.claimed].sort()).toEqual(['a', 'b']);
    expect(s.seen.has('a')).toBe(true);
  });

  it('remembers merely-seen (reward-less) discoveries per character in localStorage', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockResolvedValue({ claimed: [] });
    await useDiscoveryStore.getState().load(7);
    useDiscoveryStore.getState().markSeen(7, 'funny-sign');
    expect(useDiscoveryStore.getState().seen.has('funny-sign')).toBe(true);
    useDiscoveryStore.getState().reset();
    await useDiscoveryStore.getState().load(7); // same character remembers
    expect(useDiscoveryStore.getState().seen.has('funny-sign')).toBe(true);
    useDiscoveryStore.getState().reset();
    await useDiscoveryStore.getState().load(8); // another character does not
    expect(useDiscoveryStore.getState().seen.has('funny-sign')).toBe(false);
  });

  it('still loads when the server call fails (offline is fine: nothing claimed)', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockRejectedValue(new Error('network'));
    await expect(useDiscoveryStore.getState().load(7)).resolves.toBeUndefined();
    expect(useDiscoveryStore.getState().loaded).toBe(true);
  });

  it('survives localStorage throwing', async () => {
    vi.mocked(api.listClaimedDiscoveries).mockResolvedValue({ claimed: [] });
    await useDiscoveryStore.getState().load(7);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => useDiscoveryStore.getState().markSeen(7, 'x')).not.toThrow();
    expect(useDiscoveryStore.getState().seen.has('x')).toBe(true);
    spy.mockRestore();
  });

  it('markClaimed adds to both claimed and seen', () => {
    useDiscoveryStore.getState().markClaimed('z');
    const s = useDiscoveryStore.getState();
    expect(s.claimed.has('z') && s.seen.has('z')).toBe(true);
  });
});
```

Run: `npx vitest run src/stores/discoveryStore.test.ts` → FAIL.

- [ ] **Step 2: 타입·API 함수·스토어 구현**

`src/types/api.ts`에 추가:

```ts
export interface ClaimDiscoveryResponse {
  progress: ProgressSnapshot;
  inventory: InventoryListResponse;
  reward: { gold: number; xp: number; item_template_id: number | null; item_qty: number };
}
```

`src/api/characters.ts`에 추가(`ClaimDiscoveryResponse` import):

```ts
export function listClaimedDiscoveries(): Promise<{ claimed: string[] }> {
  return apiRequest('/characters/me/discoveries');
}

export function claimDiscovery(id: string): Promise<ClaimDiscoveryResponse> {
  return apiRequest(`/characters/me/discoveries/${encodeURIComponent(id)}/claim`, { method: 'POST' });
}
```

`src/stores/discoveryStore.ts`:

```ts
import { create } from 'zustand';
import { listClaimedDiscoveries } from '../api/characters';

const seenKey = (characterId: number) => `rpg.discoveries.seen.${characterId}`;

function readSeen(characterId: number): string[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(seenKey(characterId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(characterId: number, ids: Iterable<string>): void {
  try {
    localStorage.setItem(seenKey(characterId), JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the in-memory set still works for this page load.
  }
}

interface DiscoveryState {
  /** Reward discoveries this character already collected (server truth). */
  claimed: Set<string>;
  /** Everything this character has looked at: claimed plus reward-less ones remembered locally. */
  seen: Set<string>;
  loaded: boolean;
  load: (characterId: number) => Promise<void>;
  markSeen: (characterId: number, id: string) => void;
  markClaimed: (id: string) => void;
  reset: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  claimed: new Set(),
  seen: new Set(),
  loaded: false,
  load: async (characterId) => {
    let claimed: string[] = [];
    try {
      claimed = (await listClaimedDiscoveries()).claimed;
    } catch {
      // Offline or an old server: nothing known to be claimed; the server still guards every claim.
    }
    set({ claimed: new Set(claimed), seen: new Set([...readSeen(characterId), ...claimed]), loaded: true });
  },
  markSeen: (characterId, id) => {
    const seen = new Set(get().seen).add(id);
    writeSeen(characterId, seen);
    set({ seen });
  },
  markClaimed: (id) => set((s) => ({ claimed: new Set(s.claimed).add(id), seen: new Set(s.seen).add(id) })),
  reset: () => set({ claimed: new Set(), seen: new Set(), loaded: false }),
}));
```

(`ProgressSnapshot`/`InventoryListResponse`가 `types/api.ts`에 이미 있다. `markSeen`은 호출자가 `activeCharacter.id`를 넘긴다.)

- [ ] **Step 3: 서버 엔드포인트 구현**

`characters.ts` 상단 import에 `import { checkClaim } from "./discoveries.ts";`(기존 import 확장자 규약에 맞춤)를 추가하고, `/me/quests/:id/claim` 라우트 근처에 추가한다(`/me/*`라 세션 검사가 자동 적용된다):

```ts
// Discoveries: places in the world that can pay out once per character. The client sends only the id; the
// amount, the level gate and the "already collected" rule all live here (see discoveries.ts).
charactersRoutes.get("/me/discoveries", async (c) => {
  const appUser = c.get("appUser");
  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);
  const { data, error } = await admin.from("character_discoveries").select("discovery_id").eq("character_id", characterId);
  if (error) {
    console.error("discoveries list failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "discovery_list_failed", "발견 기록을 불러오지 못했습니다.");
  }
  return c.json({ claimed: (data ?? []).map((r: { discovery_id: string }) => r.discovery_id) });
});

charactersRoutes.post("/me/discoveries/:id/claim", async (c) => {
  const appUser = c.get("appUser");
  const discoveryId = c.req.param("id");
  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data: charRow, error: charError } = await admin.from("characters").select("level").eq("id", characterId).single();
  if (charError || !charRow) {
    console.error("discovery claim: character lookup failed:", charError?.message);
    throw new ApiError(500, "internal_error", "discovery_claim_failed", "보상 처리 중 오류가 발생했습니다.");
  }

  const check = checkClaim(discoveryId, (charRow as { level: number }).level);
  if (!check.ok) {
    if (check.reason === "level_too_low") {
      throw new ApiError(403, "forbidden", "discovery_level_too_low", "아직 이 보상을 받을 수 있는 수준이 아닙니다.");
    }
    throw new ApiError(404, "not_found", "discovery_not_found", "해당 발견물을 찾을 수 없습니다.");
  }
  const { reward } = check;

  const { error } = await admin.rpc("claim_discovery", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_discovery_id: discoveryId,
    p_xp: reward.xp ?? 0,
    p_gold: reward.gold ?? 0,
  });
  if (error) {
    if (error.message?.includes("discovery_already_claimed")) {
      throw new ApiError(409, "conflict", "discovery_already_claimed", "이미 받은 보상입니다.");
    }
    if (error.message?.includes("character_not_found")) {
      throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
    }
    console.error("claim_discovery RPC failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "discovery_claim_failed", "보상 처리 중 오류가 발생했습니다.");
  }

  const itemQty = reward.itemQty ?? 1;
  if (reward.itemTemplateId !== undefined) {
    try {
      await grantInventoryItem(admin, characterId, reward.itemTemplateId, itemQty, {
        code: "discovery_item_grant_failed",
        message: "보상 아이템 지급 중 오류가 발생했습니다.",
      });
    } catch (err) {
      // Undo the claim row so the player can try again (gold/xp already granted are small; the next try
      // is refused as "already claimed" only if this delete failed, which we log).
      const { error: undoError } = await admin.from("character_discoveries").delete().eq("character_id", characterId).eq("discovery_id", discoveryId);
      if (undoError) console.error("discovery claim undo failed:", undoError.message);
      throw err;
    }
  }

  const progress = await fetchProgressSnapshot(admin, characterId).catch((e) => {
    console.error("progress snapshot failed after discovery claim:", (e as Error).message);
    throw new ApiError(500, "internal_error", "discovery_claim_failed", "보상 처리 중 오류가 발생했습니다.");
  });
  const inventory = await fetchInventory(admin, characterId);
  return c.json({
    progress,
    inventory,
    reward: {
      gold: reward.gold ?? 0,
      xp: reward.xp ?? 0,
      item_template_id: reward.itemTemplateId ?? null,
      item_qty: reward.itemTemplateId !== undefined ? itemQty : 0,
    },
  });
});
```

(`fetchInventory`와 `fetchProgressSnapshot`의 정확한 시그니처·반환 형태는 `/me/quests/:id/claim` 핸들러(`characters.ts` ~line 903-945)를 그대로 따른다. `characters` 테이블의 레벨 컬럼 이름이 `level`인지, `progress_snapshot`이 어떻게 레벨을 읽는지 확인해 이름을 맞춘다. 위 롤백 주석의 "gold/xp already granted"는 아이템 보상 발견물이 대개 gold/xp 없이 아이템만 주도록 Task 7에서 지키면 문제가 되지 않는다는 뜻이다.)

- [ ] **Step 4: 검증과 커밋**

Run: `npx tsc -b && npx vitest run`. 서버 핸들러는 Deno 환경 밖에서 실행할 수 없으므로 읽기 검증(경로가 `/me/*` 아래인지, 에러 코드, 롤백)을 보고서에 적는다.

```bash
git add supabase/functions/api/characters.ts src/api/characters.ts src/types/api.ts src/stores/discoveryStore.ts src/stores/discoveryStore.test.ts
git commit -m "feat(discoveries): 보상 수령·목록 엔드포인트와 클라이언트 API, 발견 기록 스토어

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 근접 감지와 상호작용 연결 (키보드·터치·클릭)

**Files:**
- Modify: `src/stores/uiStore.ts` (`nearDiscoveryId`, `discoveryDialogId`, `openDiscovery`/`closeDiscovery`)
- Create: `src/components/game/DiscoveryProximity.tsx`
- Modify: `src/components/game/interactions.ts` (`InteractKind`, `currentInteraction`, `talkToNearby`)
- Modify: `src/components/game/moveTarget.ts` (`TalkTarget`에 `discovery` 추가)
- Modify: `src/components/game/HUD.tsx`, `src/components/game/TouchHud.tsx` (프롬프트·라벨)
- Modify: `src/components/game/Scene.tsx` (`<DiscoveryProximity />` 마운트, `<QuestProximity />` 다음)
- Test: `src/components/game/interactions.test.ts` (케이스 추가), 필요 시 `uiStore` 테스트

**Interfaces:**
- Consumes: `buildGrid`, `nearestInRange`, `DISCOVERIES` (Task 1), `useDiscoveryStore` (Task 3), `worldColliders`의 구역 판정 함수들(`inFairyForestZone`, `inOrcVillageZone`, `inBoneFieldZone`, `inGhoulFieldZone`, `inDesertZone`, `inVillageClearZone`), `useCharacterStore`의 활성 캐릭터(레벨은 `useCombatStore.getState().player.level`).
- Produces: `uiStore.nearDiscoveryId: string | null`, `setNearDiscoveryId`, `discoveryDialogId: string | null`, `openDiscovery(id)`(`allPanelsClosedPatch`로 다른 패널을 닫고 연다), `closeDiscovery()`; `TalkTarget`의 새 변형 `{ type: 'discovery'; id: string }`; `InteractKind`에 `'discovery'`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/game/interactions.test.ts`의 기존 패턴을 읽고, 같은 방식으로 케이스를 추가한다:
1. 근처에 발견물만 있으면(`nearDiscoveryId = 'x'`, 상점·퀘스트·드랍 없음) `currentInteraction()`이 `'discovery'`, `talkToNearby()`가 `openDiscovery('x')`를 호출하고 true.
2. 상점이 같이 있으면 `'shop'`이 우선, 퀘스트가 있으면 `'quest'`가 우선(발견물은 그 다음). 드랍보다는 발견물이 우선하지 않는다는 점(우선순위 `shop > quest > discovery > pickup`)을 명시적으로 검증한다.
3. `openTalk({ type: 'discovery', id: 'x' })`가 `openDiscovery('x')`를 호출한다.
4. `interact()`(터치 행동 버튼)이 근처 발견물이 있을 때 몬스터 공격보다 먼저 `talkToNearby`로 처리된다.

Run: `npx vitest run src/components/game/interactions.test.ts` → FAIL.

- [ ] **Step 2: 구현**

`uiStore.ts`: 상태 `nearDiscoveryId: string | null`(초기 null), `discoveryDialogId: string | null`(초기 null), 액션 `setNearDiscoveryId(id)`, `openDiscovery(id)`(`set({ ...allPanelsClosedPatch(), discoveryDialogId: id })` — `allPanelsClosedPatch`가 다른 패널 플래그를 모두 닫는 기존 패턴), `closeDiscovery()`(`set({ discoveryDialogId: null })`). 다른 패널을 열 때(`openShop`/`openQuest` 등)는 `discoveryDialogId`를 건드리지 않아도 되지만, 대화창이 열린 채 다른 패널이 열려 겹치지 않도록 `allPanelsClosedPatch()` 반환값에 `discoveryDialogId: null`을 추가한다.

`moveTarget.ts`: `export type TalkTarget = ... | { type: 'quest'; name: string } | { type: 'discovery'; id: string };`

`interactions.ts`:
- `InteractKind = 'shop' | 'quest' | 'discovery' | 'pickup'`.
- `currentInteraction()`: shop → quest → `ui.nearDiscoveryId` → `'discovery'` → pickup 순.
- `talkToNearby()`: 퀘스트 분기 다음에 `if (ui.nearDiscoveryId) { ui.openDiscovery(ui.nearDiscoveryId); return true; }`.
- `openTalk`: `target.type === 'discovery'`이면 `ui.openDiscovery(target.id)`.

`DiscoveryProximity.tsx`(`QuestProximity`와 같은 형태):

```tsx
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { playerPosition } from './playerTransform';
import { DISCOVERIES } from './discoveries';
import { buildGrid, nearestInRange } from './discoveryLogic';
import { zoneAt } from './discoveryZones';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import { useCombatStore } from '../../stores/combatStore';

/** Tracks which discovery (if any) the player is standing close enough to inspect. Only sets a flag; Space/the touch
 * action button/clicking decide whether to open it (see interactions.ts). Off in the dungeon. */
export function DiscoveryProximity() {
  const currentArea = useWorldStore((s) => s.currentArea);
  const grid = useMemo(() => buildGrid(DISCOVERIES), []);

  useFrame(() => {
    const ui = useUIStore.getState();
    if (currentArea === 'dungeon') {
      if (ui.nearDiscoveryId !== null) ui.setNearDiscoveryId(null);
      return;
    }
    const ctx = { level: useCombatStore.getState().player.level, seen: useDiscoveryStore.getState().seen, zoneAt };
    const near = nearestInRange(grid, playerPosition.x, playerPosition.z, ctx);
    const id = near?.id ?? null;
    if (id !== ui.nearDiscoveryId) ui.setNearDiscoveryId(id);
  });

  return null;
}
```

그리고 `src/components/game/discoveryZones.ts`에 `export function zoneAt(x: number, z: number): string`을 만든다: `worldColliders.ts`의 `inVillageClearZone`(→ `'village'`), `inFairyForestZone`(`'fairy'`), `inOrcVillageZone`(`'orc'`), `inBoneFieldZone`(`'bone'`), `inGhoulFieldZone(x)`(`'ghoul'`), `inDesertZone(x)`(`'desert'`) 순으로 검사하고 아니면 `'field'`를 돌려준다(각 함수의 실제 시그니처를 읽어 맞춘다). 이 함수가 `DiscoveryZone`/`Requirement`의 `zone`과 같은 문자열 집합을 쓰는지 테스트로 고정한다(`discoveryZones.test.ts`: 알려진 좌표 몇 개 — 예: 마을 중심, 사막 안쪽, 요정의 숲 가장자리 안쪽 — 가 기대한 이름을 돌려준다).

`HUD.tsx`(데스크톱): `nearDiscoveryId`를 구독해 상점·퀘스트 프롬프트가 없을 때 `HudPrompt`로 `"{이름} 조사하기: Space"`를 보인다(이름은 `DISCOVERIES.find`로 조회, 없으면 표시 안 함). 우선순위는 상점 > 퀘스트 > 발견물 > 드랍으로 기존 JSX 조건에 맞춰 넣는다. `TouchHud.tsx`: 라벨 분기에 퀘스트 다음 `else if (nearDiscoveryId) { label = '조사'; hint = <이름>; }`.

`Scene.tsx`: `import { DiscoveryProximity } from './DiscoveryProximity';`와 `<QuestProximity />` 다음 줄에 `<DiscoveryProximity />`.

- [ ] **Step 3: 검증과 커밋**

Run: `npx tsc -b && npx vitest run && npm run build` 후 `git checkout public/mockServiceWorker.js`.
Expected: 통과, 빌드 성공.

```bash
git add src/stores/uiStore.ts src/components/game/DiscoveryProximity.tsx src/components/game/discoveryZones.ts src/components/game/discoveryZones.test.ts src/components/game/interactions.ts src/components/game/interactions.test.ts src/components/game/moveTarget.ts src/components/game/HUD.tsx src/components/game/TouchHud.tsx src/components/game/Scene.tsx
git commit -m "feat(discoveries): 발견물 근접 감지와 Space·행동 버튼·클릭 말 걸기 연결

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 대사 패널과 보상 수령 흐름

**Files:**
- Create: `src/components/game/DiscoveryDialog.tsx`
- Create: `src/components/game/discoveryDialogLogic.ts` (순수: 다음 줄/보상 상태 전이)
- Test: `src/components/game/discoveryDialogLogic.test.ts`, `src/components/game/DiscoveryDialog.test.tsx`
- Modify: `src/pages/GamePage.tsx` (패널 마운트, `QuestPanel` 옆)

**Interfaces:**
- Consumes: `DISCOVERIES`, `useUIStore.discoveryDialogId/closeDiscovery`, `useDiscoveryStore`, `claimDiscovery` (Task 3), `useCombatStore.adoptProgress`, `useCharacterStore.receiveInventory`, `GamePanel`(`components/ui/game-panel`), `useDraggablePanel`(QuestPanel 패턴 그대로).
- Produces (`discoveryDialogLogic.ts`): `type DialogPhase = { step: 'lines'; index: number } | { step: 'reward'; status: 'idle' | 'pending' | 'done' | 'failed' | 'already' }`, `startPhase(def, alreadySeen): DialogPhase`, `advance(def, phase): DialogPhase`, `linesFor(def, alreadySeen): string[]`.

동작 규칙:
- 이미 본 발견물(`seen`에 있음)은 `afterLines`(없으면 `lines`의 마지막 줄)를 보여주고 보상 단계 없이 닫는다.
- 처음 보는 발견물: `lines`를 한 줄씩 넘긴다(클릭/탭/Space). 마지막 줄에서 `reward`가 있으면 보상 단계로 가서 `claimDiscovery(id)`를 한 번 호출한다.
  - 성공: `markClaimed(id)`, `adoptProgress(result.progress)`, `receiveInventory(result.inventory)`, 패널에 "획득: 골드 N · 경험치 N · 아이템명 xN"를 표시.
  - 409 `discovery_already_claimed`: `markClaimed(id)`하고 "이미 받은 보상이다" 문구.
  - 그 외 실패: "…아무것도 찾지 못한 것 같다." + 다시 시도 버튼(재호출 가능).
- 보상 없는 발견물: 마지막 줄 다음에 닫고 `markSeen(characterId, id)`.
- 패널이 열려 있는 동안 중복 호출 방지(`pending` 중 버튼 비활성).

- [ ] **Step 1: 순수 전이 테스트 작성(실패)**

```ts
import { describe, expect, it } from 'vitest';
import type { DiscoveryDef } from './discoveries';
import { advance, linesFor, startPhase } from './discoveryDialogLogic';

const base: DiscoveryDef = { id: 'x', kind: 'inspect', name: '바위', position: [0, 0], radius: 2, prop: 'rock', lines: ['하나', '둘', '셋'] };
const paying: DiscoveryDef = { ...base, reward: { gold: 30 } };

describe('dialog logic', () => {
  it('walks the lines and then asks for the reward only if there is one', () => {
    let p = startPhase(paying, false);
    expect(p).toEqual({ step: 'lines', index: 0 });
    p = advance(paying, p);
    p = advance(paying, p);
    expect(p).toEqual({ step: 'lines', index: 2 });
    expect(advance(paying, p)).toEqual({ step: 'reward', status: 'idle' });
  });
  it('a reward-less discovery has no reward step: advancing past the last line is "done"', () => {
    const last = { step: 'lines', index: 2 } as const;
    expect(advance(base, last)).toEqual({ step: 'reward', status: 'done' });
  });
  it('an already-seen discovery shows its afterLines (or just the last line) and never asks for a reward', () => {
    expect(linesFor({ ...base, afterLines: ['또 왔네'] }, true)).toEqual(['또 왔네']);
    expect(linesFor(base, true)).toEqual(['셋']);
    expect(advance(paying, startPhase(paying, true))).toEqual({ step: 'reward', status: 'done' });
  });
});
```

Run → FAIL. 이어서 `discoveryDialogLogic.ts`를 구현한다(`linesFor`: 본 적 있으면 `afterLines ?? [lines.at(-1)]`, 아니면 `lines`; `startPhase`: `{step:'lines', index:0}`; `advance`: 다음 줄이 있으면 index+1, 마지막이면 보상이 있고 처음 보는 경우 `{step:'reward', status:'idle'}`, 아니면 `{step:'reward', status:'done'}`; `Array.at`이 lib에 없으면 `[length-1]`).

- [ ] **Step 2: 컴포넌트와 테스트**

`DiscoveryDialog.tsx`는 `QuestPanel.tsx`의 구조(`GamePanel`, `useDraggablePanel`, `frameStyle`/`onHeaderPointerDown`)를 읽고 같은 방식으로 만든다. `discoveryDialogId`가 null이면 null을 렌더. 열릴 때 `phase`를 `startPhase`로 초기화(id가 바뀌면 리셋). 본문은 현재 줄, 아래에 "다음" 버튼(마지막이면 보상 처리/닫기). 키보드 Space도 다음으로(기존 패널의 키 처리 규약을 확인해 충돌하지 않게; 입력 이벤트 중복은 기존 패널과 같은 방식으로 처리). 보상 단계는 위 동작 규칙대로. 닫기 시 보상 없는 발견물이면 `markSeen(characterId, id)`. `GamePage.tsx`에서 `QuestPanel` 옆에 `<DiscoveryDialog />`를 마운트한다.

`DiscoveryDialog.test.tsx`(기존 패널 테스트 패턴 참고; API는 `vi.mock('../../api/characters')`): (i) id가 null이면 아무것도 안 그림, (ii) 줄을 넘기다 마지막에 보상 요청이 한 번만 나가고 결과 문구가 보임, (iii) 409면 "이미 받은" 문구, (iv) 일반 실패면 재시도 버튼, (v) 이미 본 발견물은 afterLines만, 보상 요청 없음, (vi) 보상 없는 발견물을 끝까지 보면 `markSeen` 호출.

- [ ] **Step 3: 검증과 커밋**

Run: `npx tsc -b && npx vitest run && npm run build` 후 `git checkout public/mockServiceWorker.js`.

```bash
git add src/components/game/DiscoveryDialog.tsx src/components/game/DiscoveryDialog.test.tsx src/components/game/discoveryDialogLogic.ts src/components/game/discoveryDialogLogic.test.ts src/pages/GamePage.tsx
git commit -m "feat(discoveries): 대사 패널과 서버 보상 수령 흐름

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 소품·NPC 렌더, 힌트 반짝임, 클릭 조사, 지도 표시

**Files:**
- Create: `src/components/game/DiscoveryProps.tsx` (프리셋 렌더 + 발견물 NPC + 클릭 + 힌트)
- Create: `src/components/game/discoveryRender.ts` (순수: 렌더 반경 선택)
- Test: `src/components/game/discoveryRender.test.ts`
- Modify: `src/components/game/Scene.tsx` (`<DiscoveryProps />` 마운트), `src/components/game/WorldMap.tsx`, `src/components/game/MiniMap.tsx`

**Interfaces:**
- Consumes: `DISCOVERIES`, `isAvailable`, `useDiscoveryStore.seen`, `NPC`(NPC.tsx, `talk` prop에 `{ type: 'discovery', id }`), `clickToTalk`, 툰 재질 헬퍼(`toon.ts`/`outline.tsx`), `playerPosition`.
- Produces (`discoveryRender.ts`): `RENDER_RADIUS = 60`, `selectRenderable(defs, x, z, ctx): DiscoveryDef[]`(플레이어 `RENDER_RADIUS` 안이고 `isAvailable`이며 `prop !== 'none'` 또는 `kind === 'npc'`인 것만), 그리고 지도용 `selectMapMarkers(defs, seen): DiscoveryDef[]`(`hidden`이 아니거나 `seen`에 있는 것).

- [ ] **Step 1: 순수 선택 로직 테스트(실패)와 구현**

`discoveryRender.test.ts`: 반경 밖 제외, 조건 미충족 제외, `prop:'none'`인 비-npc 제외, `hidden`은 `seen`에 있어야 지도에 포함, `seen`에 없는 hidden은 제외, 숨겨지지 않은 것은 항상 포함. 구현은 위 인터페이스대로(`isAvailable`·`zoneAt` 사용).

- [ ] **Step 2: `DiscoveryProps.tsx` 구현**

- 매 일정 간격(예: 0.5초마다; `useFrame` 누적 시간으로, 매 프레임 아님)으로 `selectRenderable`을 다시 계산해 상태에 반영하고(리렌더 최소화: id 배열이 달라졌을 때만 `setState`), 선택된 것만 렌더한다. 던전에서는 아무것도 렌더하지 않는다.
- 프리셋별 소품(코드 생성, 공유 지오메트리 모듈 상수, 툰 재질, 라이트 없음): `rock`(찌그러진 십이면체), `signpost`(기둥 + 판자), `pit`(어두운 원판 + 가장자리 링), `mushrooms`(작은 구 여러 개 + 갓), `sparkle`(작은 발광 구/판, `toneMapped={false}`), `statue`(받침 + 원기둥 + 구). 색은 hex만. 각 소품은 `userData`나 보이지 않는 히트 실린더(반경 = `max(0.8, def.radius * 0.6)`; 폰에서 탭하기 쉽게 NPC의 `HIT_RADIUS_PX` 보정 방식 참고)를 두고 `onClick`에서 `event.stopPropagation(); clickToTalk({ type: 'discovery', id }, def.position)`.
- 아직 `seen`에 없고 `hidden`이 아닌 발견물은 소품 위에 약한 반짝임(작은 빌보드 플레어를 사인파로 깜빡; 새 라이트·파티클 풀 사용 없음)으로 힌트를 준다. `hidden`이면 힌트도 없다.
- `kind === 'npc'`인 발견물은 `<NPC position name kind={def.npcKind} talk={{ type:'discovery', id }} />`로 렌더(이 `NPC`는 이미 클릭 말 걸기와 히트 영역을 가진다). `Suspense fallback={null}`로 감싼다.
- `trigger` 종류는 소품 없이(보통 `prop:'none'`) `DiscoveryProximity`가 아닌 **이 컴포넌트의 시간 간격 검사**로 반경에 처음 들어갈 때 한 번 `openDiscovery(id)`를 호출한다(이미 `seen`이면 호출하지 않음).

- [ ] **Step 3: 지도 표시**

`WorldMap.tsx`와 `MiniMap.tsx`의 기존 마커(NPC/마을 표시)를 읽고 같은 방식으로 `selectMapMarkers(DISCOVERIES, seen)` 결과에 작은 표시(예: 느낌표 대신 작은 마름모, 색은 `THEME` 토큰이 아니라 해당 컴포넌트가 이미 쓰는 방식)를 추가한다. 호버/탭 툴팁에 이름(`def.name`)을 보여주면 좋지만 기존 툴팁 구조와 맞지 않으면 생략한다. `hidden`이면서 `seen`에 없는 것은 어디에도 그리지 않는다.

- [ ] **Step 4: 검증과 커밋**

Run: `npx tsc -b && npx vitest run && npm run build` 후 `git checkout public/mockServiceWorker.js`.

```bash
git add src/components/game/DiscoveryProps.tsx src/components/game/discoveryRender.ts src/components/game/discoveryRender.test.ts src/components/game/Scene.tsx src/components/game/WorldMap.tsx src/components/game/MiniMap.tsx
git commit -m "feat(discoveries): 소품·숨겨진 NPC 렌더, 반짝임 힌트, 클릭 조사, 지도 표시

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 초기 콘텐츠 약 24개와 균형·정합 테스트

**Files:**
- Create: `src/components/game/discoveryContent.ts` (정의 배열; `discoveries.ts`의 `DISCOVERIES`가 이것을 쓰도록 연결)
- Modify: `src/components/game/discoveries.ts` (`export const DISCOVERIES = DISCOVERY_CONTENT;` 형태로 연결, 순환 import 없게 `import type`/데이터 분리 유지)
- Modify: `supabase/functions/api/discoveries.ts` (`DISCOVERY_REWARDS` 채움)
- Test: `src/components/game/discoveryContent.test.ts`

**콘텐츠 사양**
- **총 24개.** 비율: 웃음(보상 없음) 14개 · 숨겨진 보상 7개 · 숨겨진 NPC 3명(보상은 소량 또는 없음). `trigger`는 최대 2개.
- **지역 분포(최소):** 마을 근처 3, 강·다리 주변 2, 사막 3, 요정의 숲 3, 오크 마을 3, 뼈의 들판 3, 구울 평원 3, 유적 근처 2, 필드 중앙부 2. (합이 24 이상이 되도록 조정)
- **위치:** 좌표는 `worldColliders.ts`의 구역 경계 함수(`fairyForestEdgeAt` 등)와 `VILLAGES`, `RUINS_POSITION`, `DUNGEON_ENTRANCES`, `FieldNpcs.tsx`의 위치를 읽어 **각 구역 안쪽**으로 잡고, 마을 부지(`inVillageClearZone`)·던전 입구 반경·강(`inRiverZone`)·기존 NPC 근처(5유닛 이내)와 겹치지 않게 한다. 닿을 수 있어야 하므로 충돌물(`rockColliders`/`treeColliders`/`desertPropColliders`) 반경 안에 있지 않게 한다(테스트가 검사).
- **톤:** 어스토니시아식 뻔뻔한 유머. 진지한 척하다 힘이 빠지는 문장, 소심한 몬스터·파업 중인 해골 같은 패러디, 게임 자체를 의식하는 농담, 표지판·바위·구덩이에 달린 어이없는 설명. 대사는 한 발견물당 2~4줄, 줄당 한두 문장. 욕설·성적·정치 소재 금지. 같은 농담을 반복하지 않는다.
- **보상 균형(서버 표와 같은 값):** 숨겨진 보상 7개는 골드 20~150, XP 10~80, 아이템(체력/마나 물약 id 7/12, 상급 8/13, 초록 물약 57, 소재 61/64/67/73/74/75 중에서) 수량 1~3, 아이템 보상은 gold/xp 없이 아이템만. 희귀 장비 보상은 **1~2개 이하**(예: 장비 id 9 강철 검, 11 사냥꾼의 장궁, 10 대현자의 지팡이 중 지역 컨셉에 맞는 것; 반드시 `minLevel` ≥ 8). `minLevel`은 지역 난이도에 맞춰(마을 근처 1, 사막 5, 요정의 숲/오크 마을 8~12, 뼈의 들판/구울 평원 12~16, 유적 근처 18) 정한다.
- **숨겨진 NPC 3명:** `kind:'npc'`, `npcKind`는 `NPC.tsx`의 기존 종류 중에서, `hidden:true`, `requires`로 레벨 또는 `seen`(다른 발견물을 먼저 봐야 나타남) 조건. 한 명은 `seen` 체인(예: 수상한 바위 → 구덩이 → 숨은 상인)으로 연결해 "연쇄 발견" 맛을 준다.
- 예시(톤 참고용, 그대로 써도 되고 다듬어도 된다):
  - `sulky-rock`(마을 근처, inspect, 보상 없음): "삐진 바위다.", "…돌이 삐질 수 있나? 아무튼 삐졌다.", "말을 걸면 더 삐질 것 같아 그냥 두기로 했다."
  - `striking-skeleton`(뼈의 들판, npc 아닌 inspect 소품, 보상 없음): 파업 팻말을 든 해골. "'오늘부터 무덤 야근 거부'라고 적혀 있다.", "해골은 이미 몇 년째 누워 있다. 파업이라기보다 낮잠 같다."
  - 숨겨진 보상 예: `cracked-jar`(사막, 체력 물약 2개, minLevel 5), `fairy-tip-jar`(요정의 숲, 마나 물약 3개, minLevel 8).

- [ ] **Step 1: 정합 테스트 작성(실패)**

`discoveryContent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DISCOVERIES } from './discoveries';
import { validateDefs } from './discoveryLogic';
import { zoneAt } from './discoveryZones';
import { DISCOVERY_REWARDS, validateRewardTable } from '../../../supabase/functions/api/discoveries';
import { resolveMovement, PLAYER_COLLISION_RADIUS } from './worldColliders';

describe('discovery content', () => {
  it('has the planned amount and mix', () => {
    expect(DISCOVERIES.length).toBeGreaterThanOrEqual(24);
    expect(DISCOVERIES.filter((d) => d.kind === 'trigger').length).toBeLessThanOrEqual(2);
    expect(DISCOVERIES.filter((d) => d.kind === 'npc').length).toBeGreaterThanOrEqual(3);
    expect(DISCOVERIES.filter((d) => d.reward).length).toBeGreaterThanOrEqual(7);
  });

  it('passes the structural validation', () => {
    expect(validateDefs(DISCOVERIES)).toEqual([]);
  });

  it('keeps client rewards and the server table identical, and the server table within its caps', () => {
    expect(validateRewardTable(DISCOVERY_REWARDS)).toEqual([]);
    const clientRewardIds = DISCOVERIES.filter((d) => d.reward).map((d) => d.id).sort();
    expect(Object.keys(DISCOVERY_REWARDS).sort()).toEqual(clientRewardIds);
    for (const d of DISCOVERIES.filter((x) => x.reward)) {
      const s = DISCOVERY_REWARDS[d.id];
      expect(s.gold, d.id).toBe(d.reward!.gold);
      expect(s.xp, d.id).toBe(d.reward!.xp);
      expect(s.itemTemplateId, d.id).toBe(d.reward!.itemTemplateId);
      expect(s.itemQty ?? (s.itemTemplateId ? 1 : undefined), d.id).toBe(d.reward!.itemQty ?? (d.reward!.itemTemplateId ? 1 : undefined));
      // The level gate the server enforces must not be easier than what the client requires.
      const clientMin = Math.max(1, ...((d.requires ?? []).filter((r) => r.type === 'level') as { min: number }[]).map((r) => r.min));
      expect(s.minLevel, d.id).toBeGreaterThanOrEqual(clientMin);
    }
  });

  it('keeps total payout modest and rare gear to at most two', () => {
    const gold = Object.values(DISCOVERY_REWARDS).reduce((n, r) => n + (r.gold ?? 0), 0);
    const xp = Object.values(DISCOVERY_REWARDS).reduce((n, r) => n + (r.xp ?? 0), 0);
    expect(gold).toBeLessThanOrEqual(1200);
    expect(xp).toBeLessThanOrEqual(500);
    const GEAR_IDS = [9, 10, 11];
    expect(Object.values(DISCOVERY_REWARDS).filter((r) => r.itemTemplateId !== undefined && GEAR_IDS.includes(r.itemTemplateId)).length).toBeLessThanOrEqual(2);
  });

  it('puts every discovery somewhere a player can actually stand and reach, in a real zone', () => {
    for (const d of DISCOVERIES) {
      const [x, z] = d.position;
      // Walking from 1.5 units away toward it must not be blocked right at the spot: the resolved position stays within 0.6 of the target.
      const resolved = resolveMovement(x + 1.5, z, -1.5, 0, PLAYER_COLLISION_RADIUS);
      expect(Math.hypot(resolved.x - x, resolved.z - z), d.id).toBeLessThan(2.1);
      expect(zoneAt(x, z), d.id).toBeTruthy();
    }
  });

  it('covers every region at least once', () => {
    const zones = new Set(DISCOVERIES.map((d) => zoneAt(d.position[0], d.position[1])));
    for (const z of ['village', 'desert', 'fairy', 'orc', 'bone', 'ghoul', 'field']) expect(zones.has(z), z).toBe(true);
  });
});
```

(마지막 두 위치 테스트의 정확한 형태는 `resolveMovement`의 시그니처(`worldColliders.ts:408`)를 읽고 맞춘다. 목적은 "소품이 충돌물 안에 묻혀 닿을 수 없는 일이 없게" 하는 것이다. 테스트가 너무 엄격해 정상 위치를 거부하면 위치를 옮겨 해결하고, 조건을 느슨하게 하지 않는다.)

Run → FAIL (콘텐츠 없음).

- [ ] **Step 2: 콘텐츠 작성**

`discoveryContent.ts`에 위 사양대로 24개 이상을 `DiscoveryDef[]`로 작성하고 `discoveries.ts`의 `DISCOVERIES`가 이것을 가리키게 한다(`import { DISCOVERY_CONTENT } from './discoveryContent'` → `export const DISCOVERIES: DiscoveryDef[] = DISCOVERY_CONTENT;`; 순환이 생기면 `discoveryContent.ts`가 `discoveries.ts`의 **타입만** `import type`하도록 유지). 서버 표 `DISCOVERY_REWARDS`에 보상 있는 발견물을 모두 같은 값으로 채운다(`minLevel` 포함). 구역별 좌표는 `zoneAt`과 위 정합 테스트로 확인하며 조정한다.

- [ ] **Step 3: 통과 확인과 커밋**

Run: `npx vitest run src/components/game/discoveryContent.test.ts && npx tsc -b && npx vitest run`
Expected: 전부 통과. 대사는 사용자가 나중에 다듬을 초안이라고 보고서에 적는다.

```bash
git add src/components/game/discoveryContent.ts src/components/game/discoveries.ts supabase/functions/api/discoveries.ts src/components/game/discoveryContent.test.ts
git commit -m "feat(discoveries): 초기 발견물 24개와 서버 보상 표, 정합·균형 테스트

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 시각 확인, 문서, 배포

**Files:**
- Modify: `HANDOFF.md`, `docs/superpowers/specs/2026-10-01-discoveries-design.md`

- [ ] **Step 1: 개발 서버로 확인**

워크트리에서 `npx vite --port 5199`. Playwright(MCP)로 로그인 → 캐릭터 선택 후 `playerTransform`으로 발견물 몇 곳(마을 근처 inspect, 사막 보상 발견물, 숨겨진 NPC 연쇄의 첫 단계, trigger)으로 순간이동해 확인한다: (1) 소품·NPC가 보이고 힌트 반짝임, (2) Space로 조사 → 대사 패널 → 마지막에 보상 요청(MSW 목에는 이 엔드포인트가 없으므로 `src/mocks/handlers.ts`에 `GET /characters/me/discoveries`와 `POST .../claim`을 추가해 개발 서버에서 흐름이 보이게 한다: claim은 서버 표 값을 쓰지 않고 간단한 고정 응답이면 된다), (3) 이미 본 뒤에는 afterLines, (4) 폰 뷰포트(390×844)에서 행동 버튼 "조사" 라벨과 탭 조사, (5) 지도에 발견한 것만 표시, (6) 콘솔 오류 없음, (7) 상점/퀘스트 NPC 근처에서 기존 동작 유지. 스크린샷은 `.playwright-mcp/`에 저장해 확인하고 마지막에 지운다.

- [ ] **Step 2: 문서**

HANDOFF.md에 "## 발견물 (웃음·히든 콘텐츠)" 섹션을 추가한다(한국어): 구조(`discoveries.ts`→`discoveryContent.ts`, `discoveryLogic.ts`, `DiscoveryProximity`, `DiscoveryDialog`, `DiscoveryProps`, 서버 `discoveries.ts` + `claim_discovery` + `character_discoveries`), 새 발견물 추가 방법(정의 한 항목; 보상이 있으면 서버 표에도 같은 id·값 — 테스트가 강제), 규칙(보상은 서버 표만 진실, 위치 비검증 + 한 번만 + 상한, 콘텐츠 정합 테스트가 위치/존/균형을 지킴), 한계(서버는 위치를 검증하지 않음, 웃음 발견물의 "봤음"은 localStorage), 배포 순서. 스펙에는 위치 검증 비채택(Ruling), 보상 지급 RPC 구조, 파일 목록을 반영한다.

- [ ] **Step 3: 최종 검증과 마이그레이션 지점**

`npx tsc -b && npx vitest run && npm run build`(`public/mockServiceWorker.js`는 되돌린다). 커밋. **멈춤 지점:** 컨트롤러가 사용자에게 `supabase/migrations/20261002010000_character_discoveries.sql`을 SQL Editor에서 실행해 달라고 요청한다(파일 안의 `==== 1 ====`/`==== 2 ====` 구분대로 테이블 → 함수 순으로 두 번에 나눠, `BEGIN/COMMIT` 없이). 적용 확인을 받은 뒤 `git push origin HEAD:main`(프런트 자동 배포) → 반영 확인 후 엣지 함수 배포(`npx -y supabase@latest functions deploy api --project-ref rfdxirssgsktnjgslocu --no-verify-jwt`). 이 순서가 안전한 이유: 새 프런트는 옛 함수와 만나도 `GET /me/discoveries`가 실패해(404) `load`가 빈 상태로 계속하고 보상 발견물만 "…아무것도 찾지 못한 것 같다."로 실패하며 게임은 정상이다. 함수를 먼저 배포하면 `claim_discovery`가 없는 DB에서 보상 요청이 500이 될 뿐 다른 기능은 영향이 없다.

- [ ] **Step 4: 배포 후 확인**

`https://rfdxirssgsktnjgslocu.supabase.co/functions/v1/api/health` 200과 인증 없는 `GET /characters/me/discoveries`가 401임을 확인하고(`www.roleplaying.kr/api`는 SPA 폴백이라 확인 수단이 아니다), `https://www.roleplaying.kr` 200, `https://roleplaying.kr` 308을 확인한다. 사용자에게 실제 접속해 몇 곳을 조사하고 보상 한 번 받아 보라고 요청한다(두 번째 시도는 "이미 받은 보상"이어야 한다). 워크트리·개발 서버·`.playwright-mcp` 파일을 정리한다.
