# Stat system (STR/DEX/CON/INT/WIS) + server-persisted progression

## Goal

Replace the existing 3-bucket stat allocation (공격력/방어력/최대체력, client-memory
only) with a 5-stat system — STR/DEX/CON/INT/WIS — where each class's attack power is
driven by a different primary stat, and make level/experience/stat progression survive
logout by finally writing it back to the `characters` table (today `level`,
`experience`, `attack_power`, `defense_power`, `skill_points`, `current_hp`, `max_hp`,
`current_mp`, `max_mp` are read once at `init()` and never written back — see
combatStore.ts's existing comments documenting that as a deliberate prior choice).

Also in scope: a level-up notification (toast + a small firework/confetti visual) so a
player with unspent points actually notices.

Out of scope for this pass:
- Gold/shop persistence (stays client-only, unrelated to this feature)
- Any periodic/debounced background sync — only event-driven saves (see Sync below)
- Restricting stat points to a class's own relevant stats — all 5 are always
  allocatable, even where a class currently gets no effect from a given stat
- Ragnarok's full stat model (AGI/LUK, crit, evasion, cast time, attack speed) — this
  game has none of those combat mechanics yet; adopting them is a separate, much larger
  effort
- The deferred skill system (MP cost, skill trees) — WIS→max MP is wired here since the
  HUD already shows an MP bar, but nothing spends MP yet

## Data model

New migration adds 5 columns to `characters`, all defaulting to 5 for every class (no
per-class starting spread — classes already differ via their existing base
`attack_power`/`defense_power`/`max_hp`/`max_mp`/weapon/attack-range, which this change
doesn't touch):

```sql
ALTER TABLE characters
  ADD COLUMN stat_str INT NOT NULL DEFAULT 5 CHECK (stat_str >= 0),
  ADD COLUMN stat_dex INT NOT NULL DEFAULT 5 CHECK (stat_dex >= 0),
  ADD COLUMN stat_con INT NOT NULL DEFAULT 5 CHECK (stat_con >= 0),
  ADD COLUMN stat_int INT NOT NULL DEFAULT 5 CHECK (stat_int >= 0),
  ADD COLUMN stat_wis INT NOT NULL DEFAULT 5 CHECK (stat_wis >= 0);
```

(`stat_` prefix on all five, rather than a bare `int` column, since `int` collides with
the Postgres type keyword.)

`create_character` RPC needs no change — the new columns' defaults cover character
creation.

## Stat → derived value mapping

Balance stays identical to today's numbers; this only renames/re-routes which button
increments what, so it's not a rebalance:

| Stat | Effect | Rate |
|---|---|---|
| STR | 전사의 `attack_power` (다른 직업은 효과 없음) | +1 / point |
| DEX | 궁수의 `attack_power` (다른 직업은 효과 없음) | +1 / point |
| INT | 마법사의 `attack_power` (다른 직업은 효과 없음) | +1 / point |
| CON | `max_hp` (모든 직업) | +8 / point |
| CON | `defense_power` (모든 직업, 소량) | +1 / point |
| WIS | `max_mp` (모든 직업) | +4 / point |

A class's two non-primary attack stats (e.g. a mage's STR/DEX) are still allocatable —
the point spends, the counter goes up — but have no numeric effect yet, same as the
user explicitly chose. CON and WIS affect every class the same way.

Point cost to raise a stat from value `v` to `v+1`: `floor(v / 10) + 1` (Ragnarok-style
— 1~9 costs 1, 10~19 costs 2, 20~29 costs 3, ...). `SKILL_POINTS_PER_LEVEL` stays 3,
unchanged.

## Client: combatStore.ts

`PlayerCombatState` gains `statStr/statDex/statCon/statInt/statWis: number`.

`AllocatableStat` changes from `'attack' | 'defense' | 'hp'` to
`'str' | 'dex' | 'con' | 'int' | 'wis'`.

`allocateStat`:
1. Compute this stat's point cost from its *current* value via the formula above; bail
   if `skillPoints < cost`.
2. Increment the stat counter.
3. Apply the derived effect(s) from the mapping table above, only when applicable to
   the active character's class for STR/DEX/INT (CON/WIS always apply). Spending into
   CON/WIS heals/restores by the same amount added (mirrors the current maxHp-on-
   allocate behavior) rather than leaving current/max at the same ratio.
4. Call the new `syncProgress()` action (fire-and-forget, matches the existing
   best-effort error handling PositionSync.tsx uses).

`attackNearest`'s level-up loop keeps its existing per-level gains (`maxHp += 20`,
`attackPower += 2` — these are on top of stat-driven gains, unchanged) and, in addition
to setting `leveledUp: true`, also triggers `syncProgress()` once after the loop
(covers however many levels were gained in one kill).

New `init()` behavior: also read `stat_str/stat_dex/stat_con/stat_int/stat_wis` off
`CharacterProfile` into the new state fields.

## Sync: `PATCH /characters/me/progress`

Mirrors the existing `PATCH /characters/me/position` route (same auth, same
"update the active character's row" shape, no RPC/advisory-lock needed since it's a
single flat update with no cross-row invariant to protect). Body:

```
{ level, experience, skill_points, attack_power, defense_power, max_hp, current_hp,
  max_mp, current_mp, stat_str, stat_dex, stat_con, stat_int, stat_wis }
```

All fields required, validated as integers ≥ 0 (mirrors position route's per-field
validation loop). Route does a plain `.update(...).eq('user_id', appUser.id).eq(
'is_active', true).is('deleted_at', null)`.

Client: new `syncProgress(payload)` in `src/api/characters.ts`, and a
`useCombatStore.syncProgress()` action that builds the payload from current `player`
state and calls it, swallowing errors the same way `PositionSync` does (best-effort;
a missed save just means a slightly stale resume next login).

Explicitly no interval-based/periodic sync component — only called right after
`allocateStat` and right after a level-up inside `attackNearest`. Gold, HP lost to
monster damage mid-fight, etc. are not synced by this feature (matches "simpler"
scope decision) — only stops mattering because HP/MP already fully restore on
level-up and respawn.

## UI

`CharacterPanel.tsx`'s `STAT_ROWS` becomes 5 rows (STR/DEX/CON/INT/WIS), each showing
the raw stat value and its per-point cost (from the cost formula, so the button can
show e.g. "다음 1점: 2 포인트" and disable once `skillPoints < cost`). Derived numbers
(공격력/방어력/최대체력/최대마나) move to a small read-only summary above the 5 rows.

Level-up feedback: when `attackNearest` returns `leveledUp: true`, show a brief toast
("레벨업! 스탯 포인트를 배분하세요.") plus a lightweight CSS confetti/firework burst
overlay (a handful of colored particles bursting from the center, matching the site's
existing plain-CSS/no-new-dependency approach — no game-asset particle system). Both
live in a new small component mounted once in `Scene.tsx`/`GamePage.tsx`, triggered by
watching `combatStore.player.level` for an increase (a `useRef` holding the previous
level, compare each render/frame).

## Testing

- `combatStore.test.ts` (new or extended): cost formula at boundaries (9→10, 10→11,
  19→20), CON/WIS healing-on-allocate behavior, off-class stat spend doing nothing to
  attack_power, `syncProgress` payload shape.
- `characters.ts` edge function: manual verification only (no existing test harness for
  edge functions in this repo — matches how equip/unequip/buy/sell routes were verified
  earlier this session, via direct Supabase queries + browser testing).
- Browser: allocate each of the 5 stats as each class, confirm the right derived number
  moves (or doesn't); log out/in, confirm level/stats survived; kill a monster to level
  up, confirm the toast/firework fires and points landed.
