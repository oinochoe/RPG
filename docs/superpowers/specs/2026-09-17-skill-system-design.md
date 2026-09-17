# Class basic skill (MP, cooldown, skill points) — design

## Goal

Give each class one active skill — a stronger version of their basic attack, gated by
MP and a cooldown, leveled up with a new points currency separate from the stat system's
`skill_points`. This is the deferred "skills" feature this session's stat-system work
explicitly scoped out. Full skill *trees* (multiple skills per class, passive skills,
skill selection UI) are out of scope — this is one skill per class, leveled 1-10.

## Data model

`skill_templates`/`character_skills` already exist in the schema (from the very first
migration), unused until now. No new tables — just:

1. Seed 3 rows into `skill_templates` (one per class):

| character_class | name | mp_cost | cooldown_seconds | damage_multiplier | range_distance | required_level | max_level |
|---|---|---|---|---|---|---|---|
| warrior | 강타 | 15 | 4 | 2.5 | 2 | 1 | 10 |
| archer | 관통사격 | 15 | 4 | 2.0 | 7 | 1 | 10 |
| mage | 파이어볼 | 20 | 5 | 2.2 | 6 | 1 | 10 |

`range_distance` is seeded for documentation only — the client reuses each class's
existing basic-attack range (`ATTACK_RANGE_BY_CLASS` in combatStore.ts) rather than
reading this column, since a skill's range equals its class's basic-attack range in
this design (no separate skill-range logic needed).

2. New column, `characters.skill_upgrade_points INT NOT NULL DEFAULT 0 CHECK
   (skill_upgrade_points >= 0)` — a **separate currency from `skill_points`** (which the
   stat system already claimed for STR/DEX/CON/INT/WIS). Granted +1 per level-up,
   alongside the existing +3 `skill_points`.

3. `character_skills` rows are created lazily on first upgrade (no row = skill level 0,
   unlearned) via the RPC below, not seeded.

## Client-side skill data

The 3 rows above are also hardcoded as a client-side constant table
(`SKILL_BY_CLASS` in combatStore.ts: name, mpCost, cooldownMs, baseDamageMultiplier).
This duplicates the seed data, but there is exactly one skill per class, fixed for
this pass — no drift risk, and it avoids a live `GET /skills` fetch and a new response
shape just to read 3 numbers that never change per-character. The only thing that
actually varies per character is `skill_level`, which comes from the profile response
(see below).

Per-level bonus: each skill level above 1 adds +10% to the template's
`damage_multiplier` (level 1 = base, level 10 = +90% i.e. ×1.9 the base multiplier).
Computed client-side: `effectiveMultiplier = baseDamageMultiplier * (1 + (skillLevel - 1) * 0.1)`.

## Server: profile response + upgrade route

`GET /characters/me` (`toProfile()`) gains two fields:
- `skill_upgrade_points: number`
- `skills: { skill_template_id: number; skill_level: number }[]` — array (matches
  `character_skills`' natural shape; a future multi-skill pass needs no reshaping),
  populated from any `character_skills` rows for this character. Empty array = no
  skill learned yet (level 0).

New RPC `upgrade_character_skill(p_user_id, p_character_id, p_skill_template_id)`,
following the same `pg_advisory_xact_lock` pattern as `set_item_equipped` (this is the
same race — a double-click must not double-spend a point, the exact bug already fixed
once this session for hotbar consumables):
1. Lock on `p_character_id`.
2. Verify the character belongs to `p_user_id` and `skill_upgrade_points > 0`, else
   raise `insufficient_points`.
3. Verify `p_skill_template_id` matches the caller's `character_class` and the
   character's `level >= skill_templates.required_level`, else raise
   `class_or_level_requirement_unmet`.
4. Upsert `character_skills` (insert at `skill_level = 1` if no row exists, else
   `skill_level = skill_level + 1`), capped at `skill_templates.max_level` (raise
   `skill_maxed` if already at max).
5. Decrement `characters.skill_upgrade_points` by 1.
6. Return the new `skill_level` and `skill_upgrade_points`.

New route `POST /characters/me/skills/upgrade` (no body — the caller's class
deterministically identifies which of the 3 seeded templates applies; the server looks
up the template by the caller's own `character_class`, mirroring how `/me/shop`
resolves catalog rows without the client naming an id up front). Maps the RPC's
exceptions to `ApiError`s the same way `mapEquipRpcError` does for
`set_item_equipped`. Response: `{ skill_level, skill_upgrade_points }`.

## Persistence: skill_upgrade_points via progress-save

`characters.skill_upgrade_points` is added as a 16th field to the existing
`PATCH /me/progress` payload/route/`CharacterProgressUpdate` (same event-driven
sync — right after a level-up grants a point, and right after spending one), matching
every other progression field's persistence path. `skill_level` itself does NOT go
through progress-save — the upgrade route above writes it immediately and
authoritatively the moment a point is spent, the same way equip/unequip write
immediately rather than waiting for a sync tick.

## Client: combatStore.ts

New `PlayerCombatState` fields: `mp` already exists (`currentMp`/`maxMp`); add
`skillUpgradePoints: number`, `skillLevel: number` (0 if unlearned), `skillCooldownUntil:
number` (a `performance.now()` timestamp, 0 = ready).

New action `castSkill(playerX, playerZ)`, structurally parallel to `attackNearest`:
1. If `performance.now() < skillCooldownUntil`, return `{ hit: false }` (silently no-op
   — no error message, matching the already-decided "MP 부족하거나 쿨다운 중이면 그냥
   안 나감" behavior).
2. If `skillLevel === 0` (not learned) or `player.currentMp < mpCost`, also silently
   no-op.
3. Otherwise, find the nearest monster in range exactly like `attackNearest` (same
   `player.attackRange`), compute damage as
   `Math.max(1, Math.round(player.attackPower * effectiveMultiplier * (0.8 +
   Math.random() * 0.4)))` (same randomization band as a basic hit, just multiplied),
   apply it, deduct `mpCost` from `currentMp`, set `skillCooldownUntil = now +
   cooldownMs`. Killed/level-up/gold-drop handling is identical to `attackNearest`'s
   existing logic (share the "apply a kill" helper rather than duplicating it — see
   Implementation Note below).
4. Returns the same `AttackResult` shape `attackNearest` does, so `CharacterMesh.tsx`'s
   existing `handleAttackResult` visual dispatch (swing for warrior, projectile for
   archer/mage) needs no branching for "was this a skill or a basic attack" — a skill
   hit plays the exact same swing/projectile visual as a basic hit in this pass. (A
   later pass could make skills visually distinct; out of scope here per the "reuse
   existing visuals" decision.)

New action `tickMpRegen(delta)`: accumulates elapsed seconds in a ref/local accumulator,
adds 1 MP per full elapsed second to `currentMp`, capped at `maxMp`. Ticked from a new
`MpRegenTicker` component mounted in `Scene.tsx` alongside the existing `RespawnTicker`
(same `useFrame` + accumulator pattern, not the same component — regen has nothing to
do with monster respawns).

**Implementation note on sharing kill-handling logic:** `attackNearest`'s `if (killed)`
block (exp gain, level-up loop, gold drop, `skill_points`/stat grant) is currently
inlined in that one function. `castSkill` needs the identical logic on a kill. Extract
it into a private helper (e.g. `applyKill(nearest, damage): { nextPlayer, leveledUp,
goldDropped }`) that both `attackNearest` and `castSkill` call — this is a refactor of
existing code the skill feature forces, not scope creep, since duplicating a
~20-line level-up loop verbatim would be the actual mistake.

## Client: CharacterMesh.tsx

- `onKeyDown` gains a `KeyK` branch calling a new `castSkillAction()` closure (parallel
  to the existing `attack()` closure), which calls `castSkill` and feeds the result
  through the same `handleAttackResult` used for basic attacks.
- No new click-to-cast path — skills are keyboard-only in this pass (basic attacks
  already support click-to-move-then-attack via `moveTarget.attackTargetId`; skills
  don't need that convenience for a single-skill-per-class first pass).

## Client: CharacterPanel.tsx

Third tab, "스킬", alongside 스탯/장비. Shows:
- The class's one skill's name, current level (0-10), MP cost, cooldown (seconds).
- "스킬 포인트" counter (`skillUpgradePoints`) — visually distinct from the stats tab's
  "스킬 포인트" label even though both currently render similarly, to avoid the player
  confusing the two currencies; this tab's counter gets a different label, e.g. "스킬
  강화 포인트".
- A single "레벨업" button, disabled when `skillUpgradePoints === 0` or already at
  `max_level` (10), calling the new upgrade API and refreshing `skillLevel`/
  `skillUpgradePoints` from the response.

## Testing

- `combatStore.test.ts`: `castSkill` — cooldown gating, MP gating, unlearned-skill
  no-op, damage formula (base multiplier and per-level bonus), cooldown timestamp set
  on a successful cast, shared kill-handling behaves identically to `attackNearest`'s
  (level-up, gold, skill_points/stat grants all still fire on a skill kill).
  `tickMpRegen` — caps at maxMp, accumulates fractional seconds correctly.
- Manual: verify all 3 classes' skill visuals reuse the existing swing/projectile
  paths correctly, K does nothing on cooldown/no-MP/unlearned, skill panel's upgrade
  button spends the new points pool (not the stat one), and `skill_upgrade_points`
  survives logout/login via progress-save.
