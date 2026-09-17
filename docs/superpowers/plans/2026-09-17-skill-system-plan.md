# Class Skill (MP/Cooldown/Skill Points) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each class one active skill (a stronger, MP/cooldown-gated basic attack), leveled with a new points currency separate from the stat system's `skill_points`, reusing the already-existing but unused `skill_templates`/`character_skills` tables.

**Architecture:** A new DB column + seed data + an advisory-locked RPC (mirroring `set_item_equipped`'s pattern) for atomic skill upgrades, one new edge-function route, and a `castSkill` combatStore action that shares its kill-handling logic with the existing `attackNearest` via an extracted `applyKill` helper. Skill data (mp cost/cooldown/multiplier) is hardcoded client-side (one skill per class, fixed forever in this pass) rather than fetched live.

**Tech Stack:** React 18 + React Three Fiber, Zustand, Supabase (Postgres + Hono edge function), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-skill-system-design.md`

## Global Constraints

- One skill per class, leveled 1-10 (`skill_templates.max_level = 10`).
- `skill_upgrade_points` is a separate currency from the stat system's `skill_points` — never share a pool, never let one column feed both systems.
- Per-level bonus: `effectiveMultiplier = baseDamageMultiplier * (1 + (skillLevel - 1) * 0.1)`.
- K key casts; silently no-ops (no error/toast) when on cooldown, out of MP, or unlearned.
- Skill visuals reuse the existing swing/projectile system exactly — no new animations or assets.
- MP regenerates +1/second, capped at `maxMp`, via a ticker mirroring `RespawnTicker`'s pattern exactly.

---

### Task 1: Database — skill_upgrade_points column, seed skills, upgrade RPC

**Files:**
- Create: `supabase/migrations/<timestamp1>_add_skill_upgrade_points.sql`
- Create: `supabase/migrations/<timestamp2>_upgrade_character_skill_rpc.sql`

**Interfaces:**
- Produces: `characters.skill_upgrade_points` column; 3 seeded `skill_templates` rows (one per class); RPC `upgrade_character_skill(p_user_id INT, p_character_id INT) RETURNS TABLE (skill_level INT, skill_upgrade_points INT)`. Task 2 calls this RPC by name with these exact two parameters.

- [ ] **Step 1: Apply the first migration (schema + seed)**

Call `mcp__plugin_supabase_supabase__apply_migration` with `project_id: "rfdxirssgsktnjgslocu"`, `name: "add_skill_upgrade_points"`, `query`:

```sql
ALTER TABLE characters
  ADD COLUMN skill_upgrade_points INT NOT NULL DEFAULT 0 CHECK (skill_upgrade_points >= 0);

INSERT INTO skill_templates (name, character_class, required_level, max_level, mp_cost, cooldown_seconds, range_distance, damage_multiplier)
VALUES
  ('강타', 'warrior', 1, 10, 15, 4, 2, 2.5),
  ('관통사격', 'archer', 1, 10, 15, 4, 7, 2.0),
  ('파이어볼', 'mage', 1, 10, 20, 5, 6, 2.2);
```

- [ ] **Step 2: Find the server-recorded version and write the local file**

Call `mcp__plugin_supabase_supabase__list_migrations` with `project_id: "rfdxirssgsktnjgslocu"`. Note the `version` of the `add_skill_upgrade_points` entry (call it `<timestamp1>`). Write the same SQL to `supabase/migrations/<timestamp1>_add_skill_upgrade_points.sql`.

- [ ] **Step 3: Apply the second migration (RPC)**

Call `apply_migration` again with `name: "upgrade_character_skill_rpc"`, `query`:

```sql
-- Atomically spend one skill_upgrade_point to raise the caller's own character's one
-- class skill by a level. Follows the same advisory-lock pattern as set_item_equipped
-- to avoid a double-click double-spending a point (the exact race already fixed once
-- this session for hotbar consumables).
CREATE OR REPLACE FUNCTION public.upgrade_character_skill(
  p_user_id INT,
  p_character_id INT
)
RETURNS TABLE (skill_level INT, skill_upgrade_points INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_template public.skill_templates;
  v_current_level INT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.skill_upgrade_points <= 0 THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_template
  FROM public.skill_templates
  WHERE character_class = v_char.character_class
  LIMIT 1;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'skill_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.level < v_template.required_level THEN
    RAISE EXCEPTION 'level_requirement_unmet' USING ERRCODE = 'P0001';
  END IF;

  SELECT cs.skill_level INTO v_current_level
  FROM public.character_skills cs
  WHERE cs.character_id = p_character_id AND cs.skill_template_id = v_template.id;

  IF v_current_level IS NOT NULL AND v_current_level >= v_template.max_level THEN
    RAISE EXCEPTION 'skill_maxed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.character_skills (character_id, skill_template_id, skill_level)
  VALUES (p_character_id, v_template.id, 1)
  ON CONFLICT (character_id, skill_template_id)
  DO UPDATE SET skill_level = public.character_skills.skill_level + 1, updated_at = NOW();

  UPDATE public.characters
  SET skill_upgrade_points = skill_upgrade_points - 1
  WHERE id = p_character_id;

  RETURN QUERY
    SELECT cs.skill_level, c.skill_upgrade_points
    FROM public.character_skills cs, public.characters c
    WHERE cs.character_id = p_character_id
      AND cs.skill_template_id = v_template.id
      AND c.id = p_character_id;
END;
$$;
```

- [ ] **Step 4: Find the version and write the second local file**

Same as Step 2, for `upgrade_character_skill_rpc` → `<timestamp2>`. Write the same SQL to `supabase/migrations/<timestamp2>_upgrade_character_skill_rpc.sql`.

- [ ] **Step 5: Verify**

Call `mcp__plugin_supabase_supabase__execute_sql` with `project_id: "rfdxirssgsktnjgslocu"`, `query: "SELECT name, character_class, mp_cost, cooldown_seconds, damage_multiplier FROM skill_templates ORDER BY character_class;"`. Expected: 3 rows (archer/mage/warrior) matching the table in Step 1. Then `query: "SELECT skill_upgrade_points FROM characters LIMIT 3;"` — expected: `0` for every row.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<timestamp1>_add_skill_upgrade_points.sql supabase/migrations/<timestamp2>_upgrade_character_skill_rpc.sql
git commit -m "feat: add skill_upgrade_points column, seed class skills, upgrade RPC"
```

---

### Task 2: Edge function — `POST /characters/me/skills/upgrade` + profile fields

**Files:**
- Modify: `supabase/functions/api/characters.ts`

**Interfaces:**
- Consumes: `upgrade_character_skill` RPC (Task 1); existing `getActiveCharacterId(admin, userId)` helper (already defined in this file, used by the inventory routes).
- Produces: route `POST /characters/me/skills/upgrade` → `{ skill_level: number; skill_upgrade_points: number }`. `toProfile()`'s output gains `skill_upgrade_points: number` and `skills: { skill_template_id: number; skill_level: number }[]`.

- [ ] **Step 1: Add a `fetchSkills` helper**

Right after the existing `fetchInventory` function (ends around the line that returns the mapped inventory array), add:

```ts
interface CharacterSkillRow {
  skill_template_id: number;
  skill_level: number;
}

async function fetchSkills(
  admin: ReturnType<typeof getAdminClient>,
  characterId: number,
): Promise<CharacterSkillRow[]> {
  const { data, error } = await admin
    .from("character_skills")
    .select("skill_template_id, skill_level")
    .eq("character_id", characterId);

  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Extend `toProfile()` to accept and include skills**

Change the function signature:

```ts
function toProfile(row: Record<string, unknown>, inventory: InventoryItemRow[], skills: CharacterSkillRow[]) {
```

Add two fields to the returned object, right after `skill_points: row.skill_points,`:

```ts
    skill_points: row.skill_points,
    skill_upgrade_points: row.skill_upgrade_points,
```

And right after `stat_wis: row.stat_wis,`, before `current_map_id: row.current_map_id,`, add:

```ts
    skills,
```

- [ ] **Step 3: Update the two call sites**

In `charactersRoutes.get("/me", ...)`, right after the existing `inventory = await fetchInventory(admin, data.id as number);` block (inside its `try`), add a second fetch and pass it through:

```ts
  let inventory: InventoryItemRow[];
  let skills: CharacterSkillRow[];
  try {
    inventory = await fetchInventory(admin, data.id as number);
    skills = await fetchSkills(admin, data.id as number);
  } catch (error) {
    console.error("inventory/skills fetch failed:", (error as Error).message);
    throw new ApiError(500, "internal_error", "inventory_fetch_failed", "인벤토리 조회 중 오류가 발생했습니다.");
  }

  return c.json(toProfile(data as Record<string, unknown>, inventory, skills));
```

(This replaces the existing `try { inventory = ...} catch {...}` block and the `return c.json(toProfile(data as Record<string, unknown>, inventory));` line right after it.)

- [ ] **Step 4: Add a skill-upgrade error mapper**

Right after `mapEquipRpcError`, add:

```ts
function mapSkillUpgradeRpcError(message: string | undefined): ApiError {
  if (message?.includes("character_not_found")) {
    return new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (message?.includes("insufficient_points")) {
    return new ApiError(400, "validation_failed", "insufficient_points", "스킬 강화 포인트가 부족합니다.");
  }
  if (message?.includes("skill_not_found")) {
    return new ApiError(404, "not_found", "skill_not_found", "해당 직업의 스킬을 찾을 수 없습니다.");
  }
  if (message?.includes("level_requirement_unmet")) {
    return new ApiError(400, "level_requirement_unmet", "insufficient_level", "레벨이 부족합니다.");
  }
  if (message?.includes("skill_maxed")) {
    return new ApiError(400, "validation_failed", "skill_maxed", "이미 최대 레벨입니다.");
  }
  console.error("upgrade_character_skill RPC failed:", message);
  return new ApiError(500, "internal_error", "skill_upgrade_failed", "스킬 강화 중 오류가 발생했습니다.");
}
```

- [ ] **Step 5: Add the route**

Right after the `PATCH /me/progress` route's closing `});`, add:

```ts
charactersRoutes.post("/me/skills/upgrade", async (c) => {
  const appUser = c.get("appUser");
  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("upgrade_character_skill", {
    p_user_id: appUser.id,
    p_character_id: characterId,
  });
  if (error) throw mapSkillUpgradeRpcError(error.message);

  const row = (data as { skill_level: number; skill_upgrade_points: number }[])[0];
  return c.json({ skill_level: row.skill_level, skill_upgrade_points: row.skill_upgrade_points });
});
```

- [ ] **Step 6: Deploy**

```bash
.tools/supabase/supabase.exe functions deploy api --project-ref rfdxirssgsktnjgslocu
```

- [ ] **Step 7: Verify**

Call `mcp__plugin_supabase_supabase__get_edge_function` with `project_id: "rfdxirssgsktnjgslocu"`, `function_slug: "api"`. Confirm the returned `characters.ts` source contains `upgrade_character_skill` and `fetchSkills`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/api/characters.ts
git commit -m "feat: add POST /characters/me/skills/upgrade route and profile skill fields"
```

---

### Task 3: Client types + API + syncProgress field

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/api/characters.ts`
- Modify: `src/stores/characterStore.test.ts`
- Modify: `src/mocks/handlers.ts`

**Interfaces:**
- Consumes: Task 2's route shape.
- Produces: `CharacterProfile` gains `skill_upgrade_points: number` and `skills: CharacterSkill[]`; new exported `CharacterSkill` interface; new `upgradeSkill(): Promise<{ skill_level: number; skill_upgrade_points: number }>`; `CharacterProgressUpdate` gains `skill_upgrade_points: number`.

- [ ] **Step 1: Add `CharacterSkill` and extend `CharacterProfile`**

In `src/types/api.ts`, right before the `CharacterProfile` interface, add:

```ts
export interface CharacterSkill {
  skill_template_id: number;
  skill_level: number;
}
```

In `CharacterProfile`, right after `skill_points: number;`, add:

```ts
  skill_upgrade_points: number;
```

Right after `stat_wis: number;`, before `current_map_id: number;`, add:

```ts
  skills: CharacterSkill[];
```

- [ ] **Step 2: Extend `CharacterProgressUpdate` and add `syncProgress`'s new field**

In `src/api/characters.ts`, in `CharacterProgressUpdate`, right after `gold: number;`, add:

```ts
  skill_upgrade_points: number;
```

- [ ] **Step 3: Add `upgradeSkill`**

Right after the `useItem` function (the file's last export), add:

```ts
export function upgradeSkill(): Promise<{ skill_level: number; skill_upgrade_points: number }> {
  return apiRequest('/characters/me/skills/upgrade', { method: 'POST' });
}
```

- [ ] **Step 4: Fix the now-incomplete test fixture**

In `src/stores/characterStore.test.ts`, the `profile` const builds a literal `CharacterProfile`. Add, right after `skill_points: 0,`:

```ts
  skill_upgrade_points: 0,
```

And right after `stat_wis: 5,`, before `current_map_id: 1,`:

```ts
  skills: [],
```

- [ ] **Step 5: Fix `src/mocks/handlers.ts`'s fixture the same way**

In this file, right after `skill_points: 0,` (line 95), add:

```ts
    skill_upgrade_points: 0,
```

Right after `stat_wis: 5,` (line 100), before `current_map_id: ...` (line 101), add:

```ts
    skills: [],
```

- [ ] **Step 6: Type-check and test**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` clean; all existing tests still pass (no behavior change yet, only types/an unused-so-far export).

- [ ] **Step 7: Commit**

```bash
git add src/types/api.ts src/api/characters.ts src/stores/characterStore.test.ts src/mocks/handlers.ts
git commit -m "feat: add skill fields to CharacterProfile and an upgradeSkill API call"
```

---

### Task 4: combatStore.ts — castSkill, tickMpRegen, shared kill logic

**Files:**
- Modify: `src/stores/combatStore.ts`
- Modify: `src/stores/combatStore.test.ts`

**Interfaces:**
- Consumes: `upgradeSkill` from `src/api/characters.ts` (Task 3); `CharacterProfile.skill_upgrade_points`/`skills` (Task 3).
- Produces: `PlayerCombatState` gains `skillUpgradePoints: number`, `skillLevel: number`, `skillCooldownUntil: number`. New exported `SKILL_BY_CLASS` constant and `SKILL_MAX_LEVEL = 10`. New store actions `castSkill(playerX, playerZ): AttackResult`, `tickMpRegen(): void`, `upgradeSkill(): Promise<void>`. `attackNearest`'s kill-handling is extracted into a private `applyKill` helper that `castSkill` also calls. Task 5 (CharacterMesh) calls `castSkill`; Task 6 (MpRegenTicker) calls `tickMpRegen`; Task 7 (CharacterPanel) reads `skillUpgradePoints`/`skillLevel` and calls `upgradeSkill`.

- [ ] **Step 1: Write the failing tests**

In `src/stores/combatStore.test.ts`, the file already has one `vi.mock('../api/characters', ...)` call near the top (before the imports) that only mocks `syncProgress`. Replace that existing call's body — don't add a second `vi.mock` for the same module — with:

```ts
vi.mock('../api/characters', () => ({
  syncProgress: vi.fn().mockResolvedValue(undefined),
  upgradeSkill: vi.fn(),
}));
```

Then add these `describe` blocks at the end of the file (after the existing `describe('combatStore attackNearest level-up sync', ...)` block):

```ts
describe('combatStore castSkill', () => {
  const monster: MonsterInstanceSummary = {
    instance_id: 1,
    monster_template_id: 1,
    name: 'Slime',
    level: 1,
    current_hp: 1000,
    max_hp: 1000,
    position_x: 0,
    position_y: 0,
    position_z: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCombatStore.getState().init(baseCharacter, [monster], true);
  });

  it('does nothing when the skill is unlearned (skillLevel 0)', () => {
    const result = useCombatStore.getState().castSkill(0, 0);
    expect(result.hit).toBe(false);
  });

  it('does nothing when on cooldown', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevel: 1, skillCooldownUntil: performance.now() + 10_000 } }));
    const result = useCombatStore.getState().castSkill(0, 0);
    expect(result.hit).toBe(false);
  });

  it('does nothing when MP is below the cost', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevel: 1, currentMp: 0 } }));
    const result = useCombatStore.getState().castSkill(0, 0);
    expect(result.hit).toBe(false);
  });

  it('hits the nearest monster, deducts MP, and sets a cooldown when ready', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevel: 1, currentMp: 20 } }));
    const before = performance.now();
    const result = useCombatStore.getState().castSkill(0, 0);
    const { player } = useCombatStore.getState();
    expect(result.hit).toBe(true);
    expect(result.instanceId).toBe(1);
    expect(player.currentMp).toBe(5); // warrior's 강타 costs 15, started at 20
    expect(player.skillCooldownUntil).toBeGreaterThan(before);
  });

  it('applies the per-level damage bonus (level 3 hits harder than level 1)', () => {
    // Pin the random damage-variance roll so the two casts are only comparing the
    // per-level multiplier, not noise from the (0.8 + Math.random() * 0.4) band.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      useCombatStore.setState((s) => ({ player: { ...s.player, skillLevel: 1, currentMp: 100 } }));
      useCombatStore.getState().castSkill(0, 0);
      const lowLevelDamage = useCombatStore.getState().monsters[1].maxHp - useCombatStore.getState().monsters[1].currentHp;

      useCombatStore.getState().init(baseCharacter, [monster], true);
      useCombatStore.setState((s) => ({ player: { ...s.player, skillLevel: 3, currentMp: 100 } }));
      useCombatStore.getState().castSkill(0, 0);
      const highLevelDamage = useCombatStore.getState().monsters[1].maxHp - useCombatStore.getState().monsters[1].currentHp;

      // Level 3 = base multiplier * 1.2 (per the +10%/level formula) vs level 1's bare
      // base multiplier, with the random band now pinned identically for both casts.
      expect(highLevelDamage).toBeGreaterThan(lowLevelDamage);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('a killing skill hit still runs the shared level-up/gold logic', () => {
    const weakMonster: MonsterInstanceSummary = { ...monster, current_hp: 1, max_hp: 1 };
    useCombatStore.getState().init({ ...baseCharacter, experience: 95 }, [weakMonster], true);
    useCombatStore.setState((s) => ({ player: { ...s.player, skillLevel: 1, currentMp: 100 } }));
    vi.clearAllMocks();

    const result = useCombatStore.getState().castSkill(0, 0);

    expect(result.killed).toBe(true);
    expect(result.leveledUp).toBe(true);
    expect(charactersApi.syncProgress).toHaveBeenCalledTimes(1);
  });
});

describe('combatStore tickMpRegen', () => {
  beforeEach(() => {
    useCombatStore.getState().init(baseCharacter, [], false);
  });

  it('adds 1 MP', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentMp: 10, maxMp: 20 } }));
    useCombatStore.getState().tickMpRegen();
    expect(useCombatStore.getState().player.currentMp).toBe(11);
  });

  it('caps at maxMp', () => {
    useCombatStore.setState((s) => ({ player: { ...s.player, currentMp: 20, maxMp: 20 } }));
    useCombatStore.getState().tickMpRegen();
    expect(useCombatStore.getState().player.currentMp).toBe(20);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/stores/combatStore.test.ts
```

Expected: FAIL — `castSkill`/`tickMpRegen` don't exist on the store yet.

- [ ] **Step 3: Add the new `PlayerCombatState` fields**

In `src/stores/combatStore.ts`, in the `PlayerCombatState` interface, right after `statWis: number;`, add:

```ts
  skillUpgradePoints: number;
  skillLevel: number;
  skillCooldownUntil: number;
```

- [ ] **Step 4: Add `SKILL_BY_CLASS` and `SKILL_MAX_LEVEL`**

Right after the `PRIMARY_ATTACK_STAT` constant, add:

```ts
export const SKILL_MAX_LEVEL = 10;
const SKILL_UPGRADE_POINTS_PER_LEVEL = 1;

export const SKILL_BY_CLASS: Record<
  CharacterProfile['character_class'],
  { name: string; mpCost: number; cooldownMs: number; baseDamageMultiplier: number }
> = {
  warrior: { name: '강타', mpCost: 15, cooldownMs: 4000, baseDamageMultiplier: 2.5 },
  archer: { name: '관통사격', mpCost: 15, cooldownMs: 4000, baseDamageMultiplier: 2.0 },
  mage: { name: '파이어볼', mpCost: 20, cooldownMs: 5000, baseDamageMultiplier: 2.2 },
};

// Each skill level above 1 adds +10% to the template's base multiplier.
function skillDamageMultiplier(baseDamageMultiplier: number, skillLevel: number): number {
  return baseDamageMultiplier * (1 + (skillLevel - 1) * 0.1);
}
```

- [ ] **Step 5: Extract `applyKill` from `attackNearest`**

Right before the `export const useCombatStore = create<CombatState>(...)` line, add:

```ts
// Shared by attackNearest and castSkill so a kill always applies identical exp/level-
// up/gold/skill-point logic regardless of which attack type landed the final hit.
function applyKill(
  player: PlayerCombatState,
  nearest: MonsterCombatState,
): { nextPlayer: PlayerCombatState; leveledUp: boolean; goldDropped: number } {
  const goldDropped = nearest.level * (4 + Math.floor(Math.random() * 8));
  const gainedExp = nearest.level * 20;
  let experience = player.experience + gainedExp;
  let level = player.level;
  let maxHp = player.maxHp;
  let currentHp = player.currentHp;
  let attackPower = player.attackPower;
  let skillPoints = player.skillPoints;
  let skillUpgradePoints = player.skillUpgradePoints;
  let expToNext = expToNextForLevel(level);
  let leveledUp = false;

  while (experience >= expToNext) {
    experience -= expToNext;
    level += 1;
    maxHp += 20;
    attackPower += 2;
    currentHp = maxHp;
    skillPoints += SKILL_POINTS_PER_LEVEL;
    skillUpgradePoints += SKILL_UPGRADE_POINTS_PER_LEVEL;
    expToNext = expToNextForLevel(level);
    leveledUp = true;
  }

  const nextPlayer: PlayerCombatState = {
    ...player,
    level,
    experience,
    expToNext,
    currentHp,
    maxHp,
    attackPower,
    gold: player.gold + goldDropped,
    skillPoints,
    skillUpgradePoints,
  };

  return { nextPlayer, leveledUp, goldDropped };
}
```

- [ ] **Step 6: Rewrite `attackNearest` to use `applyKill`**

Replace the existing `if (killed) { ... }` block and the `set({...})` call right after it:

```ts
    let nextPlayer = player;
    let leveledUp = false;
    let goldDropped: number | undefined;
    if (killed) {
      goldDropped = nearest.level * (4 + Math.floor(Math.random() * 8));
      const gainedExp = nearest.level * 20;
      let experience = player.experience + gainedExp;
      let level = player.level;
      let maxHp = player.maxHp;
      let currentHp = player.currentHp;
      let attackPower = player.attackPower;
      let skillPoints = player.skillPoints;
      let expToNext = expToNextForLevel(level);

      while (experience >= expToNext) {
        experience -= expToNext;
        level += 1;
        maxHp += 20;
        attackPower += 2;
        currentHp = maxHp;
        skillPoints += SKILL_POINTS_PER_LEVEL;
        expToNext = expToNextForLevel(level);
        leveledUp = true;
      }

      nextPlayer = {
        ...player,
        level,
        experience,
        expToNext,
        currentHp,
        maxHp,
        attackPower,
        gold: player.gold + goldDropped,
        skillPoints,
      };
    }

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
      lastAttackAt: now,
    });
```

with:

```ts
    const { nextPlayer, leveledUp, goldDropped } = killed
      ? applyKill(player, nearest)
      : { nextPlayer: player, leveledUp: false, goldDropped: undefined as number | undefined };

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
      lastAttackAt: now,
    });
```

- [ ] **Step 7: Add the new fields to the default player state and `init()`**

In the store's initial `player: {...}` literal, right after `statWis: 5,`, add:

```ts
    skillUpgradePoints: 0,
    skillLevel: 0,
    skillCooldownUntil: 0,
```

In `init()`, right after `statWis: character.stat_wis,`, add:

```ts
        skillUpgradePoints: character.skill_upgrade_points,
        // character.skills contains exactly 0 or 1 rows for the caller's own character
        // (one skill per class, and the array is scoped to this character already) — no
        // need to match by skill_template_id, just take the one row if it exists.
        skillLevel: character.skills[0]?.skill_level ?? 0,
        skillCooldownUntil: 0,
```

- [ ] **Step 8: Add `castSkill`**

Add to the `CombatState` interface, right after `attackNearest: (playerX: number, playerZ: number) => AttackResult;`:

```ts
  castSkill: (playerX: number, playerZ: number) => AttackResult;
```

Add the implementation, right after `attackNearest`'s closing `},`:

```ts
  castSkill: (playerX, playerZ) => {
    const now = performance.now();
    const { monsters, player } = get();
    if (player.skillLevel <= 0 || now < player.skillCooldownUntil) return { hit: false };

    const skill = SKILL_BY_CLASS[player.characterClass];
    if (player.currentMp < skill.mpCost) return { hit: false };

    let nearest: MonsterCombatState | null = null;
    let nearestDist = Infinity;
    for (const monster of Object.values(monsters)) {
      if (!monster.alive) continue;
      const dx = monster.position[0] - playerX;
      const dz = monster.position[2] - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist <= player.attackRange && dist < nearestDist) {
        nearest = monster;
        nearestDist = dist;
      }
    }
    if (!nearest) return { hit: false };

    const multiplier = skillDamageMultiplier(skill.baseDamageMultiplier, player.skillLevel);
    const damage = Math.max(1, Math.round(player.attackPower * multiplier * (0.8 + Math.random() * 0.4)));
    const nextHp = Math.max(0, nearest.currentHp - damage);
    const killed = nextHp === 0;

    const updatedMonster: MonsterCombatState = {
      ...nearest,
      currentHp: nextHp,
      alive: !killed,
      respawnAt: killed ? now + RESPAWN_DELAY_MS : null,
      lastHitAt: now,
    };

    const { nextPlayer: afterKill, leveledUp, goldDropped } = killed
      ? applyKill(player, nearest)
      : { nextPlayer: player, leveledUp: false, goldDropped: undefined as number | undefined };

    const nextPlayer: PlayerCombatState = {
      ...afterKill,
      currentMp: afterKill.currentMp - skill.mpCost,
      skillCooldownUntil: now + skill.cooldownMs,
    };

    set({
      monsters: { ...monsters, [nearest.instanceId]: updatedMonster },
      player: nextPlayer,
    });

    if (leveledUp) get().syncProgress();

    return { hit: true, instanceId: nearest.instanceId, damage, killed, leveledUp, goldDropped };
  },
```

- [ ] **Step 9: Add `tickMpRegen`**

Add to the `CombatState` interface, right after `tickRespawns: () => void;`:

```ts
  /** +1 MP, capped at maxMp — ticked once per elapsed second by MpRegenTicker. */
  tickMpRegen: () => void;
```

Add the implementation, right after `tickRespawns`'s closing `},` (the store's last field before the closing `}));`):

```ts
  tickMpRegen: () => {
    const { player } = get();
    if (player.currentMp >= player.maxMp) return;
    set({ player: { ...player, currentMp: Math.min(player.maxMp, player.currentMp + 1) } });
  },
```

- [ ] **Step 10: Add `upgradeSkill` and extend `syncProgress`'s payload**

Add to the `CombatState` interface, right after `syncProgress: () => void;`:

```ts
  /** Calls the server RPC and adopts its authoritative skill_level/skill_upgrade_points. */
  upgradeSkill: () => Promise<void>;
```

Add the implementation, right after `syncProgress`'s closing `},`:

```ts
  upgradeSkill: async () => {
    const { skill_level, skill_upgrade_points } = await charactersApi.upgradeSkill();
    const { player } = get();
    set({ player: { ...player, skillLevel: skill_level, skillUpgradePoints: skill_upgrade_points } });
  },
```

In `syncProgress`'s payload, right after `gold: player.gold,`, add:

```ts
        skill_upgrade_points: player.skillUpgradePoints,
```

- [ ] **Step 11: Run the tests to verify they pass**

```bash
npx vitest run src/stores/combatStore.test.ts
```

Expected: PASS, all tests green (including the pre-existing ones — `applyKill`'s extraction must not change `attackNearest`'s observable behavior).

- [ ] **Step 12: Type-check and run the full suite**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: no errors; all tests pass. `tsc` will surface `CharacterPanel.tsx` and `CharacterMesh.tsx` as unaffected (they don't reference the new fields yet) — no errors expected there since nothing removed any existing field they use.

- [ ] **Step 13: Commit**

```bash
git add src/stores/combatStore.ts src/stores/combatStore.test.ts
git commit -m "feat: add castSkill, tickMpRegen, upgradeSkill to combatStore"
```

---

### Task 5: CharacterMesh.tsx — K key casts the skill

**Files:**
- Modify: `src/components/game/CharacterMesh.tsx`

**Interfaces:**
- Consumes: `castSkill` from combatStore (Task 4).

- [ ] **Step 1: Select `castSkill` alongside `attackNearest`**

Change:

```ts
  const player = useCombatStore((s) => s.player);
  const attackNearest = useCombatStore((s) => s.attackNearest);
```

to:

```ts
  const player = useCombatStore((s) => s.player);
  const attackNearest = useCombatStore((s) => s.attackNearest);
  const castSkill = useCombatStore((s) => s.castSkill);
```

- [ ] **Step 2: Add a `castSkillAction` closure and a `KeyK` branch**

In the `useEffect` that registers `onKeyDown`/`onKeyUp`, right after the `function attack() { ... }` closure, add:

```ts
    function castSkillAction() {
      const result = castSkill(playerPosition.x, playerPosition.z);
      handleAttackResult(result);
    }
```

In `onKeyDown`, right after the `if (e.code === 'Space') { ... return; }` block, add:

```ts
      if (e.code === 'KeyK') {
        e.preventDefault();
        castSkillAction();
        return;
      }
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server if not already running. With a character that has `skillLevel >= 1` (set directly via SQL for this manual check: `UPDATE characters SET skill_upgrade_points = 1 WHERE id = <test character id>;` then upgrade via the panel once Task 7 lands — for now, just confirm pressing K with `skillLevel` still 0 does nothing, no console errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/game/CharacterMesh.tsx
git commit -m "feat: bind K to cast the class skill"
```

---

### Task 6: MpRegenTicker

**Files:**
- Modify: `src/components/game/Scene.tsx`

**Interfaces:**
- Consumes: `tickMpRegen` from combatStore (Task 4).

- [ ] **Step 1: Add the ticker component**

Right after the existing `RespawnTicker` function (same file), add:

```tsx
const MP_REGEN_INTERVAL_SEC = 1;

function MpRegenTicker() {
  const tickMpRegen = useCombatStore((s) => s.tickMpRegen);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current >= MP_REGEN_INTERVAL_SEC) {
      elapsed.current = 0;
      tickMpRegen();
    }
  });
  return null;
}
```

- [ ] **Step 2: Mount it**

Right after `<RespawnTicker />` in the returned JSX, add:

```tsx
      <MpRegenTicker />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

In the running game, use a skill or otherwise reduce MP below max (or just watch a freshly-logged-in character whose MP is already full — regen capping at max is silent and correct), confirm the HUD's MP bar climbs by 1 roughly once per second when below max.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/Scene.tsx
git commit -m "feat: add passive MP regen (+1/sec, capped at max)"
```

---

### Task 7: CharacterPanel.tsx — Skill tab

**Files:**
- Modify: `src/components/game/CharacterPanel.tsx`

**Interfaces:**
- Consumes: `SKILL_BY_CLASS`, `SKILL_MAX_LEVEL` from combatStore (Task 4); `player.skillUpgradePoints`/`skillLevel`; `upgradeSkill` action.

- [ ] **Step 1: Import the new combatStore exports**

Change:

```tsx
import { useCombatStore, statPointCost, type AllocatableStat } from '../../stores/combatStore';
```

to:

```tsx
import { useCombatStore, statPointCost, SKILL_BY_CLASS, SKILL_MAX_LEVEL, type AllocatableStat } from '../../stores/combatStore';
```

- [ ] **Step 2: Add the `SkillTab` component**

Right after the `EquipmentTab` function's closing `}`, add:

```tsx
function SkillTab({ character }: { character: CharacterProfile }) {
  const player = useCombatStore((s) => s.player);
  const upgradeSkill = useCombatStore((s) => s.upgradeSkill);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skill = SKILL_BY_CLASS[character.character_class];
  const canUpgrade = !pending && player.skillUpgradePoints > 0 && player.skillLevel < SKILL_MAX_LEVEL;

  async function handleUpgrade() {
    setError(null);
    setPending(true);
    try {
      await upgradeSkill();
    } catch (err) {
      setError(err instanceof Error ? err.message : '스킬 강화 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderRadius: 8,
          background: player.skillUpgradePoints > 0 ? 'rgba(232, 201, 122, 0.15)' : 'rgba(255,255,255,0.04)',
          marginBottom: 10,
        }}
      >
        <span style={{ color: '#e8c97a', fontSize: 13, fontWeight: 700 }}>스킬 강화 포인트</span>
        <span style={{ color: '#e8c97a', fontSize: 15, fontWeight: 700 }}>{player.skillUpgradePoints}</span>
      </div>

      {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        <div>
          <div style={{ color: '#f4f1e8', fontSize: 14, fontWeight: 700 }}>
            {skill.name} — Lv.{player.skillLevel}/{SKILL_MAX_LEVEL}
          </div>
          <div style={{ color: '#9aa08f', fontSize: 11, marginTop: 2 }}>
            MP {skill.mpCost} · 쿨다운 {skill.cooldownMs / 1000}초 · K로 시전
          </div>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={!canUpgrade}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #e8c97a',
            background: canUpgrade ? 'rgba(232, 201, 122, 0.2)' : 'rgba(255,255,255,0.05)',
            color: canUpgrade ? '#e8c97a' : '#6a6a5f',
            fontSize: 12,
            fontWeight: 700,
            cursor: canUpgrade ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          레벨업
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the tab**

Change the tab list type and buttons:

```tsx
  const [tab, setTab] = useState<'stats' | 'equipment'>('stats');
```

to:

```tsx
  const [tab, setTab] = useState<'stats' | 'equipment' | 'skill'>('stats');
```

Change:

```tsx
          {(['stats', 'equipment'] as const).map((t) => (
```

to:

```tsx
          {(['stats', 'equipment', 'skill'] as const).map((t) => (
```

Change the label ternary:

```tsx
              {t === 'stats' ? '스탯' : '장비'}
```

to:

```tsx
              {t === 'stats' ? '스탯' : t === 'equipment' ? '장비' : '스킬'}
```

Change the tab body's rendering:

```tsx
        {tab === 'stats' ? (
          <>
            ...
          </>
        ) : (
          <EquipmentTab />
        )}
```

to:

```tsx
        {tab === 'stats' ? (
          <>
            ...
          </>
        ) : tab === 'equipment' ? (
          <EquipmentTab />
        ) : (
          <SkillTab character={character} />
        )}
```

(Leave the `<>...</>` stats-tab body exactly as it is — only the outer `if/else` chain changes shape.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual browser verification**

Open the character panel (C), click the new "스킬" tab, confirm it shows the class's skill name/level/MP cost/cooldown and a "레벨업" button. Give the test character a skill_upgrade_point via SQL (`UPDATE characters SET skill_upgrade_points = 1 WHERE id = <id>;`), click 레벨업, confirm the level increments and the point count drops to 0, and confirm pressing K now actually casts (arrow/swing/bolt plays, monster takes increased damage).

- [ ] **Step 6: Commit**

```bash
git add src/components/game/CharacterPanel.tsx
git commit -m "feat: add a Skill tab to CharacterPanel"
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

Expected: all tests pass, including the new `combatStore.test.ts` skill/MP-regen suites.

- [ ] **Step 3: End-to-end browser pass**

In the running game: kill monsters until leveling up at least once, confirm a `skill_upgrade_points` increase alongside the existing stat `skill_points`; spend it in the new Skill tab; press K near a monster and confirm the hit lands, MP drops, damage is visibly larger than a basic hit, and K does nothing again until the cooldown (a few seconds) elapses; let MP sit below max and confirm it climbs back up roughly 1/second; log out and back in, confirm `skill_upgrade_points` and the learned skill's level both survived (via `syncProgress` for the points, and the profile's `skills` array for the level).

No commit for this task — it's a verification pass over Tasks 1-7's already-committed changes.
