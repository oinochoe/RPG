# Stat System (STR/DEX/CON/INT/WIS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-only 3-bucket stat system (공격력/방어력/최대체력) with a
5-stat allocation model (STR/DEX/CON/INT/WIS, class-differentiated), and persist
level/experience/stats to the `characters` table so progress survives logout.

**Architecture:** A new `stat_*` column group on `characters`, a new `PATCH
/characters/me/progress` edge function route mirroring the existing `PATCH
/characters/me/position` route, `combatStore.ts` extended with the 5 stat fields plus a
`characterClass`/`currentMp`/`maxMp` it didn't track before, and two small UI pieces
(rewritten `CharacterPanel` stats tab, new `LevelUpToast`).

**Tech Stack:** React 18 + React Three Fiber, Zustand, Supabase (Postgres + Hono edge
function), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-stat-system-design.md`

## Global Constraints

- Balance stays identical to today's numbers — this only renames/re-routes which button
  increments what (per spec's "Stat → derived value mapping" table).
- No periodic/debounced background sync — only event-driven saves, right after
  `allocateStat` and right after a level-up inside `attackNearest`.
- Gold/shop persistence stays client-only — out of scope.
- All 5 stats are always allocatable by every class, even where a class currently gets
  no numeric effect from a given stat.
- Supabase project ID for all MCP tool calls: `rfdxirssgsktnjgslocu`.

---

### Task 1: Database migration — add the 5 stat columns

**Files:**
- Create: `supabase/migrations/<timestamp>_add_character_stats.sql`

**Interfaces:**
- Produces: `characters.stat_str`, `characters.stat_dex`, `characters.stat_con`,
  `characters.stat_int`, `characters.stat_wis` — all `INT NOT NULL DEFAULT 5`, every
  later task reads/writes these exact column names.

- [ ] **Step 1: Apply the migration to the remote project**

Call the `mcp__plugin_supabase_supabase__apply_migration` tool with:
- `project_id`: `rfdxirssgsktnjgslocu`
- `name`: `add_character_stats`
- `query`:

```sql
ALTER TABLE characters
  ADD COLUMN stat_str INT NOT NULL DEFAULT 5 CHECK (stat_str >= 0),
  ADD COLUMN stat_dex INT NOT NULL DEFAULT 5 CHECK (stat_dex >= 0),
  ADD COLUMN stat_con INT NOT NULL DEFAULT 5 CHECK (stat_con >= 0),
  ADD COLUMN stat_int INT NOT NULL DEFAULT 5 CHECK (stat_int >= 0),
  ADD COLUMN stat_wis INT NOT NULL DEFAULT 5 CHECK (stat_wis >= 0);
```

- [ ] **Step 2: Find the server-recorded version**

Call `mcp__plugin_supabase_supabase__list_migrations` with `project_id:
"rfdxirssgsktnjgslocu"`. Note the `version` of the `add_character_stats` entry (a
`YYYYMMDDHHMMSS` timestamp string) — call it `<version>`.

- [ ] **Step 3: Write the local migration file to match**

Write the same SQL from Step 1 to
`supabase/migrations/<version>_add_character_stats.sql` (using the Write tool), so the
local migrations directory matches what's already applied remotely — this repo's
existing migrations all follow this apply-then-write-locally sequence (see
`supabase/migrations/20260916063450_add_potions.sql` for the naming precedent).

- [ ] **Step 4: Verify the columns exist with the right defaults**

Call `mcp__plugin_supabase_supabase__execute_sql` with `project_id:
"rfdxirssgsktnjgslocu"` and `query: "SELECT stat_str, stat_dex, stat_con, stat_int,
stat_wis FROM characters LIMIT 5;"`. Expected: every row shows `5` in all 5 columns (no
existing character has spent a stat point yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<version>_add_character_stats.sql
git commit -m "feat: add STR/DEX/CON/INT/WIS columns to characters"
```

---

### Task 2: Edge function — `PATCH /characters/me/progress`

**Files:**
- Modify: `supabase/functions/api/characters.ts`

**Interfaces:**
- Consumes: `characters.stat_str/stat_dex/stat_con/stat_int/stat_wis` (Task 1).
- Produces: route `PATCH /characters/me/progress`, request body `{ level, experience,
  skill_points, attack_power, defense_power, max_hp, current_hp, max_mp, current_mp,
  stat_str, stat_dex, stat_con, stat_int, stat_wis }` (all required non-negative
  integers), 200 response `{}`. Also extends `toProfile()`'s output with the 5 new
  fields, which Task 3's `CharacterProfile` type will declare.

- [ ] **Step 1: Add the 5 stat fields to `toProfile()`**

In `supabase/functions/api/characters.ts`, in the `toProfile` function, right after the
`skill_points: row.skill_points,` line, add:

```ts
    stat_str: row.stat_str,
    stat_dex: row.stat_dex,
    stat_con: row.stat_con,
    stat_int: row.stat_int,
    stat_wis: row.stat_wis,
```

- [ ] **Step 2: Add the new route**

Right after the existing `charactersRoutes.patch("/me/position", ...)` route (ends
around line 328), add:

```ts
const PROGRESS_FIELDS = [
  "level",
  "experience",
  "skill_points",
  "attack_power",
  "defense_power",
  "max_hp",
  "current_hp",
  "max_mp",
  "current_mp",
  "stat_str",
  "stat_dex",
  "stat_con",
  "stat_int",
  "stat_wis",
] as const;

// Event-driven progress sync — called by the client right after allocateStat() and
// right after a kill causes a level-up (see combatStore.ts's syncProgress action). No
// periodic/debounced sync: this is the only writer of level/experience/stats/HP/MP back
// to the row, matching the "PATCH /me/position" route's pattern (plain flat update, no
// RPC/advisory-lock needed — no cross-row invariant to protect).
charactersRoutes.patch("/me/progress", async (c) => {
  const appUser = c.get("appUser");
  const body = await readJsonBody(c);

  const update: Record<string, number> = {};
  for (const field of PROGRESS_FIELDS) {
    const value = body[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new ApiError(400, "validation_failed", "invalid_progress", `${field}는 0 이상의 정수여야 합니다.`, field);
    }
    update[field] = value;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("characters")
    .update(update)
    .eq("user_id", appUser.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("character progress update failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "progress_update_failed", "진행 상황 저장 중 오류가 발생했습니다.");
  }
  if (!data) {
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }

  return c.json({}, 200);
});
```

- [ ] **Step 3: Deploy the edge function**

```bash
.tools/supabase/supabase.exe functions deploy api --project-ref rfdxirssgsktnjgslocu
```

- [ ] **Step 4: Verify by direct SQL round-trip**

Call `mcp__plugin_supabase_supabase__execute_sql` with `project_id:
"rfdxirssgsktnjgslocu"` and `query: "SELECT id, is_active FROM characters WHERE
is_active = true LIMIT 1;"` to find an active character's `id`. Full end-to-end
verification of the route (auth + HTTP call) happens naturally in Task 4's browser
testing once the client calls it — this step only confirms an active character exists
to update against (there's no local edge-function test harness in this repo; every
prior route in this file was verified the same way, live, per the session history in
the design spec).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/api/characters.ts
git commit -m "feat: add PATCH /characters/me/progress route"
```

---

### Task 3: Client API + types

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/api/characters.ts`

**Interfaces:**
- Consumes: Task 2's route shape.
- Produces: `CharacterProfile` gains `stat_str/stat_dex/stat_con/stat_int/stat_wis:
  number`; new `CharacterProgressUpdate` interface and `syncProgress(progress:
  CharacterProgressUpdate): Promise<void>` — Task 4's combatStore imports and calls
  this.

- [ ] **Step 1: Extend `CharacterProfile`**

In `src/types/api.ts`, in the `CharacterProfile` interface, right after `skill_points:
number;`, add:

```ts
  stat_str: number;
  stat_dex: number;
  stat_con: number;
  stat_int: number;
  stat_wis: number;
```

- [ ] **Step 2: Add `syncProgress` to the API client**

In `src/api/characters.ts`, right after the existing `updateCharacterPosition`
function, add:

```ts
export interface CharacterProgressUpdate {
  level: number;
  experience: number;
  skill_points: number;
  attack_power: number;
  defense_power: number;
  max_hp: number;
  current_hp: number;
  max_mp: number;
  current_mp: number;
  stat_str: number;
  stat_dex: number;
  stat_con: number;
  stat_int: number;
  stat_wis: number;
}

export function syncProgress(progress: CharacterProgressUpdate): Promise<void> {
  return apiRequest('/characters/me/progress', { method: 'PATCH', body: progress });
}
```

- [ ] **Step 3: Fix the now-incomplete test fixtures**

`src/stores/characterStore.test.ts` builds a literal `CharacterProfile` object (the
`profile` const) that will now fail to type-check since it's missing the 5 new
required fields. Add, right after `skill_points: 0,`:

```ts
  stat_str: 5,
  stat_dex: 5,
  stat_con: 5,
  stat_int: 5,
  stat_wis: 5,
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the existing test suite**

```bash
npx vitest run
```

Expected: all existing tests still pass (this task doesn't change behavior, only
types/a new unused-so-far export).

- [ ] **Step 6: Commit**

```bash
git add src/types/api.ts src/api/characters.ts src/stores/characterStore.test.ts
git commit -m "feat: add stat fields to CharacterProfile and a syncProgress API call"
```

---

### Task 4: combatStore — 5-stat system, escalating cost, progress sync

**Files:**
- Modify: `src/stores/combatStore.ts`
- Create: `src/stores/combatStore.test.ts`

**Interfaces:**
- Consumes: `syncProgress` from `src/api/characters.ts` (Task 3); `CharacterProfile`'s
  5 new fields (Task 3).
- Produces: `PlayerCombatState` gains `characterClass: CharacterProfile['character_class']`,
  `currentMp: number`, `maxMp: number`, `statStr/statDex/statCon/statInt/statWis:
  number`. `AllocatableStat` is now `'str' | 'dex' | 'con' | 'int' | 'wis'`. New
  exported `statPointCost(currentValue: number): number`. New store action
  `syncProgress: () => void`. Task 5 (HUD) reads `player.currentMp`/`player.maxMp`.
  Task 6 (CharacterPanel) reads `player.statStr/statDex/statCon/statInt/statWis` and
  imports `statPointCost` and `AllocatableStat`.

- [ ] **Step 1: Write the failing tests for the cost formula and allocation behavior**

Create `src/stores/combatStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  syncProgress: vi.fn().mockResolvedValue(undefined),
}));

import * as charactersApi from '../api/characters';
import { useCombatStore, statPointCost } from './combatStore';
import type { CharacterProfile, MonsterInstanceSummary } from '../types/api';

const baseCharacter: CharacterProfile = {
  id: 1,
  user_id: 1,
  name: 'Test',
  character_class: 'warrior',
  level: 1,
  experience: 0,
  current_hp: 100,
  max_hp: 100,
  current_mp: 20,
  max_mp: 20,
  attack_power: 10,
  defense_power: 5,
  gold: 100,
  skill_points: 3,
  current_map_id: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  stat_str: 5,
  stat_dex: 5,
  stat_con: 5,
  stat_int: 5,
  stat_wis: 5,
  created_at: '2026-09-16T00:00:00Z',
  equipped_items: [],
  inventory: [],
};

describe('statPointCost', () => {
  it('costs 1 point for values 1-9', () => {
    expect(statPointCost(1)).toBe(1);
    expect(statPointCost(9)).toBe(1);
  });

  it('costs 2 points starting at value 10', () => {
    expect(statPointCost(10)).toBe(2);
    expect(statPointCost(19)).toBe(2);
  });

  it('costs 3 points starting at value 20', () => {
    expect(statPointCost(20)).toBe(3);
  });
});

describe('combatStore allocateStat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCombatStore.getState().init(baseCharacter, [], false);
  });

  it("increments a warrior's attack_power when STR is spent", () => {
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.statStr).toBe(6);
    expect(player.attackPower).toBe(11);
    expect(player.skillPoints).toBe(2);
  });

  it('does not touch attack_power when a warrior spends on DEX (off-class stat)', () => {
    useCombatStore.getState().allocateStat('dex');
    const { player } = useCombatStore.getState();
    expect(player.statDex).toBe(6);
    expect(player.attackPower).toBe(10);
  });

  it('CON raises max HP and defense, and heals by the HP gained', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentHp: 90 } }));
    useCombatStore.getState().allocateStat('con');
    const { player } = useCombatStore.getState();
    expect(player.maxHp).toBe(108);
    expect(player.currentHp).toBe(98);
    expect(player.defensePower).toBe(6);
  });

  it('WIS raises max MP and restores MP by the amount gained', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentMp: 15 } }));
    useCombatStore.getState().allocateStat('wis');
    const { player } = useCombatStore.getState();
    expect(player.maxMp).toBe(24);
    expect(player.currentMp).toBe(19);
  });

  it('does nothing when skillPoints is below the cost', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillPoints: 0 } }));
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.statStr).toBe(5);
  });

  it('spends the escalating cost once a stat reaches 10', () => {
    useCombatStore.setState((s) => ({
      player: { ...s.player, statStr: 10, skillPoints: 5 },
    }));
    useCombatStore.getState().allocateStat('str');
    const { player } = useCombatStore.getState();
    expect(player.statStr).toBe(11);
    expect(player.skillPoints).toBe(3);
  });

  it('calls syncProgress after a successful allocation', () => {
    useCombatStore.getState().allocateStat('str');
    expect(charactersApi.syncProgress).toHaveBeenCalledTimes(1);
  });
});

describe('combatStore attackNearest level-up sync', () => {
  it('calls syncProgress when a kill causes a level-up', () => {
    const highXpCharacter: CharacterProfile = { ...baseCharacter, experience: 95 };
    const monster: MonsterInstanceSummary = {
      instance_id: 1,
      monster_template_id: 1,
      name: 'Slime',
      level: 5,
      current_hp: 1,
      max_hp: 1,
      position_x: 0,
      position_y: 0,
      position_z: 0,
    };
    useCombatStore.getState().init(highXpCharacter, [monster], true);
    useCombatStore.setState({ lastAttackAt: -Infinity });
    vi.clearAllMocks();

    useCombatStore.getState().attackNearest(0, 0);

    expect(charactersApi.syncProgress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/stores/combatStore.test.ts
```

Expected: FAIL — `statPointCost` is not exported, `AllocatableStat`'s `'str'` etc. don't
exist yet, `player.statStr`/`currentMp`/`maxMp` are undefined.

- [ ] **Step 3: Extend `PlayerCombatState`**

In `src/stores/combatStore.ts`, replace:

```ts
interface PlayerCombatState {
  level: number;
  experience: number;
  expToNext: number;
  currentHp: number;
  maxHp: number;
  attackPower: number;
  defensePower: number;
  attackRange: number;
  gold: number;
  skillPoints: number;
}
```

with:

```ts
interface PlayerCombatState {
  level: number;
  experience: number;
  expToNext: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  attackPower: number;
  defensePower: number;
  attackRange: number;
  gold: number;
  skillPoints: number;
  characterClass: CharacterProfile['character_class'];
  statStr: number;
  statDex: number;
  statCon: number;
  statInt: number;
  statWis: number;
}
```

- [ ] **Step 4: Replace the stat-gain constants and `AllocatableStat`**

Replace:

```ts
// Stat points granted on each level-up, spent via allocateStat.
const SKILL_POINTS_PER_LEVEL = 3;
const STAT_GAIN = {
  attack: { attackPower: 1 },
  defense: { defensePower: 1 },
  hp: { maxHp: 8 },
} as const;
export type AllocatableStat = keyof typeof STAT_GAIN;
```

with:

```ts
// Stat points granted on each level-up, spent via allocateStat.
const SKILL_POINTS_PER_LEVEL = 3;

export type AllocatableStat = 'str' | 'dex' | 'con' | 'int' | 'wis';

const STAT_FIELD: Record<AllocatableStat, 'statStr' | 'statDex' | 'statCon' | 'statInt' | 'statWis'> = {
  str: 'statStr',
  dex: 'statDex',
  con: 'statCon',
  int: 'statInt',
  wis: 'statWis',
};

// CON and WIS affect every class the same way; STR/DEX/INT only affect the class whose
// primary attack stat they are (see PRIMARY_ATTACK_STAT below) — spending on an
// off-class attack stat still spends the point and raises the counter, it just has no
// numeric effect yet (design spec's explicit "off-class stats stay allocatable" call).
const STAT_GAIN = {
  con: { maxHp: 8, defensePower: 1 },
  wis: { maxMp: 4 },
} as const;

// Point cost to raise a stat from its current value to the next — Ragnarok-style
// escalating cost: 1~9 costs 1, 10~19 costs 2, 20~29 costs 3, etc.
export function statPointCost(currentValue: number): number {
  return Math.floor(currentValue / 10) + 1;
}

const PRIMARY_ATTACK_STAT: Record<CharacterProfile['character_class'], AllocatableStat> = {
  warrior: 'str',
  archer: 'dex',
  mage: 'int',
};
```

- [ ] **Step 5: Add the `syncProgress` action to the `CombatState` interface**

In the `CombatState` interface, right after the `allocateStat` line, add:

```ts
  /**
   * Pushes the current progress snapshot (level/experience/stats/HP/MP/skill points) to
   * the server. Called right after allocateStat and right after a level-up inside
   * attackNearest — no periodic/debounced sync (design spec's "simpler" scope
   * decision). Best-effort: a failed save just means a slightly stale resume next
   * login, same as PositionSync.tsx's handling.
   */
  syncProgress: () => void;
```

- [ ] **Step 6: Import the API module**

At the top of the file, add:

```ts
import * as charactersApi from '../api/characters';
```

- [ ] **Step 7: Update the default `player` state and `init()`**

Replace the store's initial `player: {...}` literal:

```ts
  player: {
    level: 1,
    experience: 0,
    expToNext: 100,
    currentHp: 1,
    maxHp: 1,
    attackPower: 10,
    defensePower: 0,
    attackRange: ATTACK_RANGE_BY_CLASS.warrior,
    gold: 0,
    skillPoints: 0,
  },
```

with:

```ts
  player: {
    level: 1,
    experience: 0,
    expToNext: 100,
    currentHp: 1,
    maxHp: 1,
    currentMp: 1,
    maxMp: 1,
    attackPower: 10,
    defensePower: 0,
    attackRange: ATTACK_RANGE_BY_CLASS.warrior,
    gold: 0,
    skillPoints: 0,
    characterClass: 'warrior',
    statStr: 5,
    statDex: 5,
    statCon: 5,
    statInt: 5,
    statWis: 5,
  },
```

Then in `init()`, replace:

```ts
      player: {
        level: character.level,
        experience: character.experience,
        expToNext: expToNextForLevel(character.level),
        currentHp: character.current_hp,
        maxHp: character.max_hp,
        attackPower: character.attack_power + attackBonus,
        defensePower: character.defense_power + defenseBonus,
        attackRange: ATTACK_RANGE_BY_CLASS[character.character_class],
        gold: character.gold,
        skillPoints: character.skill_points,
      },
```

with:

```ts
      player: {
        level: character.level,
        experience: character.experience,
        expToNext: expToNextForLevel(character.level),
        currentHp: character.current_hp,
        maxHp: character.max_hp,
        currentMp: character.current_mp,
        maxMp: character.max_mp,
        attackPower: character.attack_power + attackBonus,
        defensePower: character.defense_power + defenseBonus,
        attackRange: ATTACK_RANGE_BY_CLASS[character.character_class],
        gold: character.gold,
        skillPoints: character.skill_points,
        characterClass: character.character_class,
        statStr: character.stat_str,
        statDex: character.stat_dex,
        statCon: character.stat_con,
        statInt: character.stat_int,
        statWis: character.stat_wis,
      },
```

- [ ] **Step 8: Rewrite `allocateStat`**

Replace the entire existing `allocateStat` implementation:

```ts
  allocateStat: (stat) => {
    const { player } = get();
    if (player.skillPoints <= 0) return;
    const skillPoints = player.skillPoints - 1;
    if (stat === 'attack') {
      set({ player: { ...player, skillPoints, attackPower: player.attackPower + STAT_GAIN.attack.attackPower } });
    } else if (stat === 'defense') {
      set({ player: { ...player, skillPoints, defensePower: player.defensePower + STAT_GAIN.defense.defensePower } });
    } else {
      // Spending a point into max HP heals by the same amount, rather than leaving the
      // player at the same currentHp/maxHp ratio they had before allocating.
      const gain = STAT_GAIN.hp.maxHp;
      set({
        player: { ...player, skillPoints, maxHp: player.maxHp + gain, currentHp: player.currentHp + gain },
      });
    }
  },
```

with:

```ts
  allocateStat: (stat) => {
    const { player } = get();
    const field = STAT_FIELD[stat];
    const currentValue = player[field];
    const cost = statPointCost(currentValue);
    if (player.skillPoints < cost) return;

    const nextPlayer: PlayerCombatState = {
      ...player,
      skillPoints: player.skillPoints - cost,
      [field]: currentValue + 1,
    };

    if (stat === PRIMARY_ATTACK_STAT[player.characterClass]) {
      nextPlayer.attackPower = player.attackPower + 1;
    }
    if (stat === 'con') {
      // Spending into CON heals by the HP gained, rather than leaving the player at the
      // same currentHp/maxHp ratio they had before allocating.
      nextPlayer.maxHp = player.maxHp + STAT_GAIN.con.maxHp;
      nextPlayer.currentHp = player.currentHp + STAT_GAIN.con.maxHp;
      nextPlayer.defensePower = player.defensePower + STAT_GAIN.con.defensePower;
    }
    if (stat === 'wis') {
      nextPlayer.maxMp = player.maxMp + STAT_GAIN.wis.maxMp;
      nextPlayer.currentMp = player.currentMp + STAT_GAIN.wis.maxMp;
    }

    set({ player: nextPlayer });
    get().syncProgress();
  },
```

- [ ] **Step 9: Add the `syncProgress` action**

Right after `allocateStat`'s closing `},`, add:

```ts
  syncProgress: () => {
    const { player } = get();
    charactersApi
      .syncProgress({
        level: player.level,
        experience: player.experience,
        skill_points: player.skillPoints,
        attack_power: player.attackPower,
        defense_power: player.defensePower,
        max_hp: player.maxHp,
        current_hp: player.currentHp,
        max_mp: player.maxMp,
        current_mp: player.currentMp,
        stat_str: player.statStr,
        stat_dex: player.statDex,
        stat_con: player.statCon,
        stat_int: player.statInt,
        stat_wis: player.statWis,
      })
      .catch(() => {
        // Best-effort — a missed save just means a slightly stale resume next login,
        // not worth surfacing to the player (same handling as PositionSync.tsx).
      });
  },
```

- [ ] **Step 10: Call `syncProgress` from `attackNearest`'s level-up path**

In `attackNearest`, right after the `set({ monsters: ..., player: nextPlayer,
lastAttackAt: now });` call and before the `return { hit: true, ... }` line, add:

```ts

    if (leveledUp) get().syncProgress();
```

- [ ] **Step 11: Run the tests to verify they pass**

```bash
npx vitest run src/stores/combatStore.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 12: Type-check and run the full suite**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: no type errors; all tests (old and new) pass. `tsc` will also surface every
other file that still references the removed `'attack' | 'defense' | 'hp'`
`AllocatableStat` values (`CharacterPanel.tsx`) — that's expected and fixed in Task 6.

- [ ] **Step 13: Commit**

```bash
git add src/stores/combatStore.ts src/stores/combatStore.test.ts
git commit -m "feat: 5-stat allocation (STR/DEX/CON/INT/WIS) with escalating cost and progress sync"
```

---

### Task 5: HUD — live MP bar

**Files:**
- Modify: `src/components/game/HUD.tsx`
- Modify: `src/pages/GamePage.tsx`

**Interfaces:**
- Consumes: `player.currentMp`/`player.maxMp` from Task 4's `combatStore`.
- Produces: `HUD` no longer takes a `character` prop.

- [ ] **Step 1: Wire the MP bar to the live store value**

In `src/components/game/HUD.tsx`, replace:

```tsx
        <Bar ratio={character.max_mp > 0 ? character.current_mp / character.max_mp : 0} color="#5b8bd5" label={`MP ${character.current_mp}/${character.max_mp}`} />
```

with:

```tsx
        <Bar ratio={player.maxMp > 0 ? player.currentMp / player.maxMp : 0} color="#5b8bd5" label={`MP ${player.currentMp}/${player.maxMp}`} />
```

- [ ] **Step 2: Drop the now-unused `character` prop**

`character` was only used on that one line. Replace:

```tsx
export function HUD({ character }: { character: CharacterProfile }) {
```

with:

```tsx
export function HUD() {
```

And remove the now-unused import line:

```tsx
import type { CharacterProfile } from '../../types/api';
```

- [ ] **Step 3: Update the call site**

In `src/pages/GamePage.tsx`, replace:

```tsx
      <HUD character={activeCharacter} />
```

with:

```tsx
      <HUD />
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/HUD.tsx src/pages/GamePage.tsx
git commit -m "feat: wire the HUD MP bar to live combatStore state"
```

---

### Task 6: CharacterPanel — 5-stat UI

**Files:**
- Modify: `src/components/game/CharacterPanel.tsx`

**Interfaces:**
- Consumes: `statPointCost`, `AllocatableStat` from Task 4's `combatStore`;
  `player.statStr/statDex/statCon/statInt/statWis/attackPower/defensePower/maxHp/maxMp`.

- [ ] **Step 1: Replace the import and `STAT_ROWS`**

Replace:

```tsx
import { useCombatStore, type AllocatableStat } from '../../stores/combatStore';
```

with:

```tsx
import { useCombatStore, statPointCost, type AllocatableStat } from '../../stores/combatStore';
```

Replace:

```tsx
const STAT_ROWS: { stat: AllocatableStat; label: string; gain: string }[] = [
  { stat: 'attack', label: '공격력', gain: '+1' },
  { stat: 'defense', label: '방어력', gain: '+1' },
  { stat: 'hp', label: '최대 체력', gain: '+8' },
];
```

with:

```tsx
const STAT_ROWS: { stat: AllocatableStat; label: string }[] = [
  { stat: 'str', label: 'STR (힘)' },
  { stat: 'dex', label: 'DEX (민첩)' },
  { stat: 'con', label: 'CON (체력)' },
  { stat: 'int', label: 'INT (지식)' },
  { stat: 'wis', label: 'WIS (정신력)' },
];
```

- [ ] **Step 2: Update `StatRow` to show the point cost instead of a fixed gain string**

Replace the `StatRow` function's props and body:

```tsx
function StatRow({
  label,
  value,
  gain,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  gain: string;
  canAllocate: boolean;
  onAllocate: () => void;
}) {
```

with:

```tsx
function StatRow({
  label,
  value,
  cost,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  cost: number;
  canAllocate: boolean;
  onAllocate: () => void;
}) {
```

And replace the button's `title` attribute:

```tsx
          title={`${gain} (포인트 1 소모)`}
```

with:

```tsx
          title={`다음 1점: ${cost} 포인트`}
```

- [ ] **Step 3: Rewrite the stats tab body**

Replace:

```tsx
        {tab === 'stats' ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 8,
                background: canAllocate ? 'rgba(232, 201, 122, 0.15)' : 'rgba(255,255,255,0.04)',
                marginBottom: 8,
              }}
            >
              <span style={{ color: '#e8c97a', fontSize: 13, fontWeight: 700 }}>스킬 포인트</span>
              <span style={{ color: '#e8c97a', fontSize: 15, fontWeight: 700 }}>{player.skillPoints}</span>
            </div>

            <div>
              {STAT_ROWS.map(({ stat, label, gain }) => (
                <StatRow
                  key={stat}
                  label={label}
                  value={stat === 'attack' ? player.attackPower : stat === 'defense' ? player.defensePower : player.maxHp}
                  gain={gain}
                  canAllocate={canAllocate}
                  onAllocate={() => allocateStat(stat)}
                />
              ))}
            </div>
          </>
        ) : (
          <EquipmentTab />
        )}
```

with:

```tsx
        {tab === 'stats' ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 8,
                background: canAllocate ? 'rgba(232, 201, 122, 0.15)' : 'rgba(255,255,255,0.04)',
                marginBottom: 8,
              }}
            >
              <span style={{ color: '#e8c97a', fontSize: 13, fontWeight: 700 }}>스킬 포인트</span>
              <span style={{ color: '#e8c97a', fontSize: 15, fontWeight: 700 }}>{player.skillPoints}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                marginBottom: 10,
                fontSize: 12,
                color: '#cfe8d0',
              }}
            >
              <span>공격력 {player.attackPower}</span>
              <span>방어력 {player.defensePower}</span>
              <span>최대체력 {player.maxHp}</span>
              <span>최대마나 {player.maxMp}</span>
            </div>

            <div>
              {STAT_ROWS.map(({ stat, label }) => {
                const value = statValue[stat];
                const cost = statPointCost(value);
                return (
                  <StatRow
                    key={stat}
                    label={label}
                    value={value}
                    cost={cost}
                    canAllocate={player.skillPoints >= cost}
                    onAllocate={() => allocateStat(stat)}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <EquipmentTab />
        )}
```

- [ ] **Step 4: Add the `STAT_VALUE` lookup and drop the now-unused `canAllocate`**

Right before the `return (` in `CharacterPanel`, replace:

```tsx
  const canAllocate = player.skillPoints > 0;
```

with:

```tsx
  const statValue: Record<AllocatableStat, number> = {
    str: player.statStr,
    dex: player.statDex,
    con: player.statCon,
    int: player.statInt,
    wis: player.statWis,
  };
```

(The old `canAllocate` was a single boolean gating all 3 old rows identically; the new
per-row cost varies per stat, so each `StatRow` now computes its own `canAllocate` from
`player.skillPoints >= cost` inline, as shown in Step 3.)

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. This also confirms no other file still references the old
`'attack' | 'defense' | 'hp'` `AllocatableStat` values.

- [ ] **Step 6: Manual browser verification**

Start the dev server if not already running (`npm run dev`), open the game, press `C`
to open the character panel, and confirm:
- 5 rows (STR/DEX/CON/INT/WIS) show, each with a value and a `+` button.
- The derived summary (공격력/방어력/최대체력/최대마나) shows above them.
- Clicking `+` on the active class's primary attack stat (e.g. STR for a warrior)
  increases both the STR value and the 공격력 summary number.
- Clicking `+` on an off-class attack stat (e.g. DEX for a warrior) increases only the
  DEX value, not 공격력.
- Clicking `+` on CON increases both CON and 최대체력 (and heals proportionally);
  clicking `+` on WIS increases both WIS and 최대마나.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/CharacterPanel.tsx
git commit -m "feat: rewrite CharacterPanel stats tab for the 5-stat system"
```

---

### Task 7: Level-up toast + confetti

**Files:**
- Create: `src/components/game/LevelUpToast.tsx`
- Modify: `src/pages/GamePage.tsx`

**Interfaces:**
- Consumes: `player.level` from `combatStore` (Task 4).
- Produces: `LevelUpToast` component, mounted once in `GamePage`.

- [ ] **Step 1: Create the component**

Write `src/components/game/LevelUpToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';

interface Particle {
  id: number;
  left: number;
  color: string;
  delay: number;
}

const PARTICLE_COLORS = ['#e8c97a', '#57c25b', '#5b8bd5', '#e0538a', '#f4f1e8'];
const PARTICLE_COUNT = 24;
const VISIBLE_MS = 2600;

/**
 * Watches combatStore's player level and fires a brief toast + CSS confetti burst the
 * moment it increases — otherwise a level-up is silent unless the player happens to
 * open the character panel and notice unspent skill points.
 */
export function LevelUpToast() {
  const level = useCombatStore((s) => s.player.level);
  const previousLevel = useRef(level);
  const [visible, setVisible] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (level > previousLevel.current) {
      setParticles(
        Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
          id: i,
          left: Math.random() * 100,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          delay: Math.random() * 0.3,
        })),
      );
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), VISIBLE_MS);
    }
    previousLevel.current = level;
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [level]);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483647, overflow: 'hidden' }}>
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: '-5%',
            left: `${p.left}%`,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: p.color,
            animation: `rpg-confetti-fall 1.8s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 22px',
          borderRadius: 10,
          background: 'rgba(15, 17, 13, 0.85)',
          border: '2px solid #e8c97a',
          color: '#e8c97a',
          fontWeight: 700,
          fontSize: 16,
          animation: 'rpg-levelup-pop 0.4s ease-out',
        }}
      >
        레벨업! 스탯 포인트를 배분하세요.
      </div>
      <style>{`
        @keyframes rpg-confetti-fall {
          from { transform: translateY(0) rotate(0deg); opacity: 1; }
          to { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
        @keyframes rpg-levelup-pop {
          from { transform: translateX(-50%) scale(0.6); opacity: 0; }
          to { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `GamePage`**

In `src/pages/GamePage.tsx`, add the import:

```tsx
import { LevelUpToast } from '../components/game/LevelUpToast';
```

And add `<LevelUpToast />` right after `<HUD />`:

```tsx
      <HUD />
      <LevelUpToast />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual browser verification**

In the running game, kill a monster to trigger a level-up (or temporarily lower
`expToNextForLevel`'s return value in `combatStore.ts` to force one quickly, then
revert that temporary change before committing). Confirm the toast text and confetti
particles appear for a few seconds and then disappear on their own, and that they don't
block clicks on anything underneath (`pointerEvents: 'none'` on the wrapper).

- [ ] **Step 5: Commit**

```bash
git add src/components/game/LevelUpToast.tsx src/pages/GamePage.tsx
git commit -m "feat: add level-up toast with a confetti burst"
```

---

### Task 8: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

Expected: all tests pass, including the new `combatStore.test.ts` suite.

- [ ] **Step 3: End-to-end browser pass**

In the running game: log in as each of the 3 classes in turn (or one character,
switched via 캐릭터 선택), allocate a few points into each of the 5 stats, confirm the
right derived numbers move, kill a monster to level up and see the toast, then log out
and back in and confirm the character's level/stats/HP/MP survived (this is the actual
proof that `PATCH /characters/me/progress` round-trips correctly — Task 2's route
alone can't be verified without a client to call it).

No commit for this task — it's a verification pass over Tasks 1-7's already-committed
changes.
