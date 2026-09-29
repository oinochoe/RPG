// Route-level tests for the server-authoritative economy (POST /me/kills, shop, loot, stats,
// vitals). The DB is faked (see fakeSupabaseAdmin.ts) so this checks the route logic; SQL is
// tested against a real Postgres separately.
//
// Run:  npx deno test --config supabase/tests/api/deno.json --allow-env --allow-read supabase/tests/api
import assert from "node:assert/strict";
import { Hono } from "hono";
import { charactersRoutes } from "../../functions/api/characters.ts";
import { ApiError, errorResponseFromApiError, unknownErrorResponse } from "../../functions/api/errors.ts";
import { reset, state, type Call } from "./fakeSupabaseAdmin.ts";

// Same error mapping index.ts installs, so a thrown ApiError becomes its real HTTP status.
const app = new Hono().route("/", charactersRoutes);
app.onError((err) => (err instanceof ApiError ? errorResponseFromApiError(err) : unknownErrorResponse(err)));

const CHAR_ID = 7;

function snapRow(over: Record<string, unknown> = {}) {
  return {
    r_level: 3, r_experience: 50, r_gold: 500, r_skill_points: 4, r_skill_upgrade_points: 1,
    r_max_hp: 140, r_max_mp: 20, r_attack_power: 14, r_defense_power: 5,
    r_stat_str: 5, r_stat_dex: 5, r_stat_con: 5, r_stat_int: 5, r_stat_wis: 5,
    r_progress_rev: "12", r_exp_gained: 0, r_gold_gained: 0, r_leveled_up: false, ...over,
  };
}
const ok = (data: unknown) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: { message } });

function setup() {
  reset();
  state.tables.characters = () => ({ data: { id: CHAR_ID } });
}

async function post(path: string, body: unknown, method = "POST") {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const rpcNames = () => state.calls.filter((c) => c.kind === "rpc").map((c) => c.name);
const rpcCall = (name: string): Call | undefined => state.calls.find((c) => c.kind === "rpc" && c.name === name);

// ---------------------------------------------------------------- POST /me/kills

Deno.test("kills: a valid batch is applied, quest progress merged, drops paired to their kill index", async () => {
  setup();
  state.rpc.apply_kills = () => ok([snapRow({ r_exp_gained: 60, r_gold_gained: 40, r_leveled_up: true })]);
  state.rpc.report_quest_kill = (a) =>
    ok(a.p_monster_template_id === 1 ? [{ quest_template_id: 9, status: "in_progress", progress_count: 2 }] : []);
  // Both kills drop something (Math.random is pinned below); the fake issues one ticket per item.
  state.rpc.issue_drops = (a) => {
    assert.equal((a.p_item_ids as number[]).length, 2);
    return ok((a.p_item_ids as number[]).map((id, i) => ({ r_drop_id: `00000000-0000-4000-8000-00000000000${i}`, r_item_template_id: id, r_ordinal: i + 1 })));
  };
  // Describe whichever item ids the route asks about.
  state.tables.item_templates = (q) => ({
    data: ((q.filters["id in"] as number[]) ?? []).map((id) => ({ id, name: `item${id}`, item_type: "misc" })),
  });

  // Pin Math.random so every regular kill drops (weighted roll lands in an item, scroll roll misses).
  const realRandom = Math.random;
  const seq = [0.9, 0.999, 0.9, 0.999];
  let i = 0;
  Math.random = () => seq[i++ % seq.length];
  let res;
  try {
    res = await post("/me/kills", { kills: [{ template_id: 1, level: 2 }, { template_id: 4, level: 3 }] });
  } finally {
    Math.random = realRandom;
  }

  assert.equal(res.status, 200);
  assert.equal(res.json.progress.level, 3);
  assert.equal(res.json.progress.progress_rev, 12); // bigint string -> number
  assert.equal(res.json.progress.leveled_up, true);
  assert.deepEqual(rpcCall("apply_kills")?.args, { p_user_id: 1, p_character_id: CHAR_ID, p_kills: [{ level: 2 }, { level: 3 }] });
  assert.deepEqual(res.json.quests_updated, [{ quest_template_id: 9, status: "in_progress", progress_count: 2 }]);
  assert.equal(res.json.results.length, 2);
  assert.equal(res.json.results[0].index, 0);
  assert.equal(res.json.results[0].accepted, true);
  assert.equal(typeof res.json.results[0].drop.drop_id, "string");
  assert.equal(res.json.results[0].drop.item_template_id, 73); // slime table's last entry
  assert.equal(res.json.results[1].drop.item_template_id, 64); // cactus table's last entry
  assert.notEqual(res.json.results[0].drop.drop_id, res.json.results[1].drop.drop_id);
  assert.equal(res.json.boss_cooldowns, null);
});

Deno.test("kills: implausible reports are refused before touching the database", async () => {
  for (const kills of [
    [{ template_id: 1, level: 99 }], // above what a slime can be
    [{ template_id: 99, level: 1 }], // unknown monster
    [{ template_id: 5, level: 40 }], // world-boss template without a boss key
    [], // empty
    Array(26).fill({ template_id: 1, level: 1 }), // over the batch limit
  ]) {
    setup();
    const res = await post("/me/kills", { kills });
    assert.equal(res.status, 400);
    assert.equal(res.json.reason, "invalid_kills");
    assert.equal(rpcNames().length, 0);
  }
});

Deno.test("kills: the rate limit maps to 429 and does NOT burn a boss cooldown", async () => {
  setup();
  state.rpc.get_boss_cooldowns = () => ok([{ boss_key: "world_boss", available_at: null }]);
  state.rpc.apply_kills = () => fail("kill_rate_limited");
  state.rpc.record_boss_kill = () => ok([]);
  const res = await post("/me/kills", { kills: [{ template_id: 5, level: 40, boss_key: "world_boss" }] });
  assert.equal(res.status, 429);
  assert.equal(res.json.reason, "kill_rate_limited");
  assert.equal(rpcNames().includes("record_boss_kill"), false);
});

Deno.test("kills: a boss still on cooldown earns nothing; nothing is applied when every kill is refused", async () => {
  setup();
  const future = new Date(Date.now() + 3_600_000).toISOString();
  state.rpc.get_boss_cooldowns = () => ok([{ boss_key: "world_boss", available_at: future }]);
  state.rpc.progress_snapshot = () => ok([snapRow()]);
  const res = await post("/me/kills", { kills: [{ template_id: 5, level: 40, boss_key: "world_boss" }] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.results, [{ index: 0, accepted: false, reason: "boss_on_cooldown" }]);
  assert.equal(rpcNames().includes("apply_kills"), false);
  assert.equal(res.json.progress.gold, 500);
});

Deno.test("kills: a ready boss pays out, then its cooldown is recorded AFTER the reward, and returned", async () => {
  setup();
  let gets = 0;
  state.rpc.get_boss_cooldowns = () => ok(gets++ === 0 ? [{ boss_key: "orc_stronghold", available_at: null }] : [{ boss_key: "orc_stronghold", available_at: "2099-01-01T00:00:00Z" }]);
  state.rpc.apply_kills = () => ok([snapRow()]);
  state.rpc.record_boss_kill = () => ok([{ boss_key: "orc_stronghold", available_at: "2099-01-01T00:00:00Z" }]);
  state.rpc.report_quest_kill = () => ok([]);
  state.rpc.issue_drops = () => ok([]);
  const res = await post("/me/kills", { kills: [{ template_id: 6, level: 19, boss_key: "orc_stronghold" }] });
  assert.equal(res.status, 200);
  const names = rpcNames();
  assert.ok(names.indexOf("apply_kills") < names.indexOf("record_boss_kill"), names.join(","));
  assert.equal(res.json.boss_cooldowns[0].available_at, "2099-01-01T00:00:00Z");
});

Deno.test("kills: the same boss twice in one batch only pays once", async () => {
  setup();
  state.rpc.get_boss_cooldowns = () => ok([{ boss_key: "world_boss", available_at: null }]);
  state.rpc.apply_kills = () => ok([snapRow()]);
  state.rpc.record_boss_kill = () => ok([]);
  state.rpc.report_quest_kill = () => ok([]);
  state.rpc.issue_drops = () => ok([]);
  const boss = { template_id: 5, level: 40, boss_key: "world_boss" };
  const res = await post("/me/kills", { kills: [boss, boss] });
  assert.equal(res.status, 200);
  assert.equal((rpcCall("apply_kills")?.args?.p_kills as unknown[]).length, 1);
  assert.equal(res.json.results[1].accepted, false);
});

// ---------------------------------------------------------------- shop

function shopTables(item: { equip_slot: string | null; buy_price: number } | null) {
  state.tables.item_templates = () => ({ data: item ? { id: 7, ...item } : null });
  state.tables.character_inventory = ({ op, single }) => ({ data: op === "select" && !single ? [] : null });
}

Deno.test("buy: pays first, then grants; the price comes from the item template x quantity", async () => {
  setup();
  shopTables({ equip_slot: null, buy_price: 50 });
  state.rpc.spend_gold = () => ok([snapRow({ r_gold: 400, r_gold_gained: -150 })]);
  state.rpc.grant_inventory_item = () => ok(null);
  const res = await post("/me/inventory/buy", { item_template_id: 7, quantity: 3 });
  assert.equal(res.status, 201);
  assert.equal(rpcCall("spend_gold")?.args?.p_amount, 150);
  assert.equal(res.json.progress.gold, 400);
  // The stack-or-insert happens inside one RPC (serialized per character), never as separate
  // select/insert calls from the function, which is what used to split potion stacks.
  const grants = state.calls.filter((c) => c.kind === "rpc" && c.name === "grant_inventory_item");
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0].args, { p_character_id: CHAR_ID, p_item_template_id: 7, p_quantity: 3 });
  assert.equal(state.calls.some((c) => c.kind === "from" && c.name === "character_inventory" && c.op === "insert"), false);
});

Deno.test("buy: not enough gold -> 400 insufficient_gold and no item is granted", async () => {
  setup();
  shopTables({ equip_slot: null, buy_price: 50 });
  state.rpc.spend_gold = () => fail("insufficient_gold");
  const res = await post("/me/inventory/buy", { item_template_id: 7 });
  assert.equal(res.status, 400);
  assert.equal(res.json.reason, "insufficient_gold");
  assert.equal(rpcNames().includes("grant_inventory_item"), false);
});

Deno.test("buy: if handing over the item fails, the gold is refunded", async () => {
  setup();
  shopTables({ equip_slot: null, buy_price: 50 });
  state.rpc.grant_inventory_item = () => fail("boom");
  state.rpc.spend_gold = () => ok([snapRow()]);
  state.rpc.grant_progress = () => ok([snapRow()]);
  const res = await post("/me/inventory/buy", { item_template_id: 7, quantity: 2 });
  assert.equal(res.status, 500);
  assert.equal(res.json.reason, "buy_failed");
  assert.deepEqual(rpcCall("grant_progress")?.args, { p_character_id: CHAR_ID, p_exp: 0, p_gold: 100 });
});

Deno.test("buy: gear can't be bought in bulk, and a non-shop item is not found", async () => {
  setup();
  shopTables({ equip_slot: "weapon", buy_price: 500 });
  assert.equal((await post("/me/inventory/buy", { item_template_id: 7, quantity: 2 })).json.reason, "not_stackable");
  setup();
  shopTables(null);
  assert.equal((await post("/me/inventory/buy", { item_template_id: 7 })).status, 404);
  assert.equal(rpcNames().includes("spend_gold"), false);
});

Deno.test("sell: the server credits the template's sell_price x quantity (never a client number)", async () => {
  setup();
  state.tables.character_inventory = ({ op, single }) => {
    if (op === "select" && single) return { data: { id: 33, quantity: 5, item_templates: { sell_price: 25 } } };
    return { data: [] };
  };
  state.rpc.grant_progress = () => ok([snapRow({ r_gold: 575, r_gold_gained: 75 })]);
  const res = await post("/me/inventory/33/sell", { quantity: 3, price: 999999 });
  assert.equal(res.status, 200);
  assert.deepEqual(rpcCall("grant_progress")?.args, { p_character_id: CHAR_ID, p_exp: 0, p_gold: 75 });
  assert.equal(res.json.progress.gold, 575);
  assert.equal(res.json.sold_quantity, 3);
});

Deno.test("sell: nothing is credited when the stack is too small", async () => {
  setup();
  state.tables.character_inventory = ({ op, single }) =>
    op === "select" && single ? { data: { id: 33, quantity: 1, item_templates: { sell_price: 25 } } } : { data: [] };
  const res = await post("/me/inventory/33/sell", { quantity: 5 });
  assert.equal(res.status, 400);
  assert.equal(res.json.reason, "insufficient_quantity");
  assert.equal(rpcNames().includes("grant_progress"), false);
});

// ---------------------------------------------------------------- loot / stats / vitals

Deno.test("loot: only a well-formed ticket is accepted, and the ticket decides the item", async () => {
  setup();
  assert.equal((await post("/me/inventory/loot", { item_template_id: 47 })).status, 400); // the old exploit
  assert.equal((await post("/me/inventory/loot", { drop_id: "not-a-uuid" })).status, 400);
  assert.equal(rpcNames().length, 0);

  state.tables.character_inventory = ({ op, single }) => ({ data: op === "select" && !single ? [] : null });
  state.rpc.redeem_drop = () => ok(12);
  state.rpc.grant_inventory_item = () => ok(null);
  const ticket = "0a1b2c3d-0000-4000-8000-000000000001";
  const res = await post("/me/inventory/loot", { drop_id: ticket, item_template_id: 47 });
  assert.equal(res.status, 201);
  assert.equal(rpcCall("redeem_drop")?.args?.p_drop_id, ticket);
  // the ticket's item is what gets granted, not the 47 the client tried to slip in
  assert.deepEqual(rpcCall("grant_inventory_item")?.args, { p_character_id: CHAR_ID, p_item_template_id: 12, p_quantity: 1 });
});

Deno.test("loot: a used/expired/foreign ticket is 404", async () => {
  setup();
  state.rpc.redeem_drop = () => fail("drop_not_found");
  const res = await post("/me/inventory/loot", { drop_id: "0a1b2c3d-0000-4000-8000-000000000001" });
  assert.equal(res.status, 404);
  assert.equal(res.json.reason, "drop_not_found");
});

Deno.test("stats: validates the stat and maps point errors", async () => {
  setup();
  assert.equal((await post("/me/stats/allocate", { stat: "luck" })).status, 400);
  state.rpc.allocate_stat = () => fail("insufficient_points");
  const refused = await post("/me/stats/allocate", { stat: "str" });
  assert.equal(refused.status, 400);
  assert.equal(refused.json.reason, "insufficient_points");
  state.rpc.allocate_stat = () => ok([snapRow({ r_stat_str: 6, r_skill_points: 3 })]);
  const done = await post("/me/stats/allocate", { stat: "str" });
  assert.equal(done.status, 200);
  assert.equal(done.json.progress.stat_str, 6);
});

Deno.test("progress: only current HP/MP are written; gold/level/etc. sent by a cheater are ignored", async () => {
  setup();
  state.rpc.sync_character_vitals = () => ok(null);
  const res = await post("/me/progress", { level: 999, gold: 999999999, experience: 1, current_hp: 40, current_mp: 7 }, "PATCH");
  assert.equal(res.status, 200);
  assert.deepEqual(rpcCall("sync_character_vitals")?.args, { p_user_id: 1, p_character_id: CHAR_ID, p_hp: 40, p_mp: 7 });
  // nothing else was written
  assert.equal(state.calls.some((c) => c.kind === "from" && c.op === "update"), false);
  assert.equal((await post("/me/progress", { current_hp: "x", current_mp: 1 }, "PATCH")).status, 400);
});
