import { Hono } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError, readJsonBody } from "./errors.ts";
import { requireAuth, AppUser } from "./authMiddleware.ts";

export const charactersRoutes = new Hono<{ Variables: { appUser: AppUser } }>();

charactersRoutes.use("*", requireAuth);

function toSummary(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    character_class: row.character_class,
    level: row.level,
    current_hp: row.current_hp,
    max_hp: row.max_hp,
    current_map_id: row.current_map_id,
  };
}

interface InventoryItemRow {
  id: number;
  item_template_id: number;
  slot_index: number;
  quantity: number;
  enchant_level: number;
  is_equipped: boolean;
  equipped_slot: string | null;
  item_name: string;
  item_type: string;
  equip_slot: string | null;
  attack_bonus: number;
  defense_bonus: number;
  required_level: number;
  required_class: string | null;
  buy_price: number;
  sell_price: number;
  heal_hp: number;
}

// Denormalizes character_inventory joined with item_templates into the shape the client
// needs to render the inventory panel — the client never talks to Postgres directly, so
// item name/stats have to be embedded here rather than looked up client-side.
async function fetchInventory(
  admin: ReturnType<typeof getAdminClient>,
  characterId: number,
): Promise<InventoryItemRow[]> {
  const { data, error } = await admin
    .from("character_inventory")
    .select(
      "id, item_template_id, slot_index, quantity, enchant_level, is_equipped, equipped_slot, " +
        "item_templates(name, item_type, equip_slot, attack_bonus, defense_bonus, required_level, required_class, buy_price, sell_price, heal_hp)",
    )
    .eq("character_id", characterId)
    .order("slot_index", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const item = row.item_templates as unknown as {
      name: string;
      item_type: string;
      equip_slot: string | null;
      attack_bonus: number;
      defense_bonus: number;
      required_level: number;
      required_class: string | null;
      buy_price: number;
      sell_price: number;
      heal_hp: number;
    };
    return {
      id: row.id,
      item_template_id: row.item_template_id,
      slot_index: row.slot_index,
      quantity: row.quantity,
      enchant_level: row.enchant_level,
      is_equipped: row.is_equipped,
      equipped_slot: row.equipped_slot,
      item_name: item.name,
      item_type: item.item_type,
      equip_slot: item.equip_slot,
      attack_bonus: item.attack_bonus,
      defense_bonus: item.defense_bonus,
      required_level: item.required_level,
      required_class: item.required_class,
      buy_price: item.buy_price,
      sell_price: item.sell_price,
      heal_hp: item.heal_hp,
    };
  });
}

function toProfile(row: Record<string, unknown>, inventory: InventoryItemRow[]) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    character_class: row.character_class,
    level: row.level,
    experience: row.experience,
    current_hp: row.current_hp,
    max_hp: row.max_hp,
    current_mp: row.current_mp,
    max_mp: row.max_mp,
    attack_power: row.attack_power,
    defense_power: row.defense_power,
    gold: row.gold,
    skill_points: row.skill_points,
    stat_str: row.stat_str,
    stat_dex: row.stat_dex,
    stat_con: row.stat_con,
    stat_int: row.stat_int,
    stat_wis: row.stat_wis,
    current_map_id: row.current_map_id,
    position_x: row.position_x,
    position_y: row.position_y,
    position_z: row.position_z,
    created_at: row.created_at,
    equipped_items: inventory
      .filter((item) => item.is_equipped)
      .map((item) => ({
        id: item.id,
        item_template_id: item.item_template_id,
        equipped_slot: item.equipped_slot,
        enchant_level: item.enchant_level,
        attack_bonus: item.attack_bonus,
        defense_bonus: item.defense_bonus,
      })),
    inventory,
  };
}

// Maps set_item_equipped's RAISE EXCEPTION messages (see
// supabase/migrations/20260916050730_set_item_equipped_rpc.sql) to the API contract's
// error envelope, the same convention create_character/select_character already use.
function mapEquipRpcError(message: string | undefined): ApiError {
  if (message?.includes("character_not_found")) {
    return new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (message?.includes("item_not_found")) {
    return new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  if (message?.includes("not_equippable")) {
    return new ApiError(400, "validation_failed", "not_equippable", "장착할 수 없는 아이템입니다.", "id");
  }
  if (message?.includes("level_requirement_unmet")) {
    return new ApiError(400, "level_requirement_unmet", "insufficient_level", "레벨이 부족합니다.", "id");
  }
  if (message?.includes("class_requirement_unmet")) {
    return new ApiError(400, "validation_failed", "class_requirement_unmet", "이 직업은 착용할 수 없는 아이템입니다.", "id");
  }
  console.error("set_item_equipped RPC failed:", message);
  return new ApiError(500, "internal_error", "equip_failed", "아이템 장착/해제 중 오류가 발생했습니다.");
}

charactersRoutes.post("/", async (c) => {
  const appUser = c.get("appUser");
  const { name, character_class } = await readJsonBody(c);
  if (!name || typeof name !== "string" || name.length < 2 || name.length > 16) {
    throw new ApiError(400, "validation_failed", "invalid_name", "이름은 2~16자여야 합니다.", "name");
  }
  if (typeof character_class !== "string" || !["warrior", "mage", "archer"].includes(character_class)) {
    throw new ApiError(400, "validation_failed", "invalid_class", "유효하지 않은 직업입니다.", "character_class");
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("create_character", {
    p_user_id: appUser.id,
    p_name: name,
    p_class: character_class,
  });

  if (error) {
    // Don't leak raw Postgres error text to the client — log server-side
    // and return static messages only (Task 6 lesson).
    console.error("create_character RPC failed:", error.code, error.message);
    if (error.code === "23505") {
      throw new ApiError(409, "conflict", "name_already_taken", "이미 사용 중인 캐릭터 이름입니다.", "name");
    }
    if (error.message?.includes("max_characters_reached")) {
      throw new ApiError(400, "limit_exceeded", "max_characters_reached", "생성 가능한 최대 캐릭터 수를 초과했습니다.");
    }
    throw new ApiError(500, "internal_error", "character_creation_failed", "캐릭터 생성 중 오류가 발생했습니다.");
  }

  return c.json(toSummary(data as Record<string, unknown>), 201);
});

charactersRoutes.get("/", async (c) => {
  const appUser = c.get("appUser");
  const page = Number(c.req.query("page") ?? "1");
  const pageSize = Number(c.req.query("page_size") ?? "20");
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = getAdminClient();
  const { data, error, count } = await admin
    .from("characters")
    .select("*", { count: "exact" })
    .eq("user_id", appUser.id)
    .is("deleted_at", null)
    .range(from, to);

  if (error) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("characters list query failed:", error.message);
    throw new ApiError(500, "internal_error", "list_failed", "캐릭터 목록을 불러오는 중 오류가 발생했습니다.");
  }

  return c.json({
    items: (data ?? []).map(toSummary),
    page,
    page_size: pageSize,
    total: count ?? 0,
  });
});

// Step 3 design decision: active-character selection is tracked server-side
// via a real `characters.is_active` column (see migration
// 20260914090500_character_active_selection.sql) rather than the stand-in
// "lowest id" behavior from the brief. This route calls the atomic
// `select_character` RPC, which clears any previously active character for
// this user and activates the requested one in a single transaction.
charactersRoutes.post("/:id/select", async (c) => {
  const appUser = c.get("appUser");
  const characterId = Number(c.req.param("id"));
  if (!Number.isInteger(characterId)) {
    throw new ApiError(404, "not_found", "character_not_found", "해당 캐릭터를 찾을 수 없습니다.", "character_id");
  }

  const admin = getAdminClient();
  const { error } = await admin.rpc("select_character", {
    p_user_id: appUser.id,
    p_character_id: characterId,
  });

  if (error) {
    if (error.message?.includes("character_not_found")) {
      throw new ApiError(404, "not_found", "character_not_found", "해당 캐릭터를 찾을 수 없습니다.", "character_id");
    }
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("select_character RPC failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "character_select_failed", "캐릭터 선택 중 오류가 발생했습니다.");
  }

  return c.json({}, 200);
});

charactersRoutes.delete("/:id", async (c) => {
  const appUser = c.get("appUser");
  const characterId = Number(c.req.param("id"));
  if (!Number.isInteger(characterId)) {
    throw new ApiError(404, "not_found", "character_not_found", "해당 캐릭터를 찾을 수 없습니다.", "character_id");
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("characters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", characterId)
    .eq("user_id", appUser.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("character delete failed:", error.message);
    throw new ApiError(500, "internal_error", "character_delete_failed", "캐릭터 삭제 중 오류가 발생했습니다.");
  }
  if (!data) {
    throw new ApiError(404, "not_found", "character_not_found", "해당 캐릭터를 찾을 수 없습니다.", "character_id");
  }

  return c.json({}, 200);
});

// Persists the caller's active character's last-known world position (and the map it was
// taken on) so a later login resumes roughly where they left off, instead of always
// spawning back at the character's creation-time position. Called periodically and on
// logout by the client — see PositionSync.tsx and authStore.ts respectively. Dungeon floors
// aren't a distinct backend map yet, so saves while inside one still carry the field map id
// the client was last on; that's an accepted simplification until the backend grows real
// dungeon-instance tracking.
charactersRoutes.patch("/me/position", async (c) => {
  const appUser = c.get("appUser");
  const body = await readJsonBody(c);
  const { position_x, position_y, position_z, current_map_id } = body;

  for (const [field, value] of [
    ["position_x", position_x],
    ["position_y", position_y],
    ["position_z", position_z],
  ] as const) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new ApiError(400, "validation_failed", "invalid_position", `${field}는 정수여야 합니다.`, field);
    }
  }
  if (current_map_id !== undefined && (typeof current_map_id !== "number" || !Number.isInteger(current_map_id))) {
    throw new ApiError(400, "validation_failed", "invalid_map_id", "current_map_id는 정수여야 합니다.", "current_map_id");
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("characters")
    .update({
      position_x,
      position_y,
      position_z,
      ...(current_map_id !== undefined ? { current_map_id } : {}),
    })
    .eq("user_id", appUser.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("character position update failed:", error.code, error.message);
    if (error.code === "23503") {
      throw new ApiError(400, "validation_failed", "invalid_map_id", "존재하지 않는 맵입니다.", "current_map_id");
    }
    throw new ApiError(500, "internal_error", "position_update_failed", "위치 저장 중 오류가 발생했습니다.");
  }
  if (!data) {
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }

  return c.json({}, 200);
});

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

charactersRoutes.get("/me", async (c) => {
  const appUser = c.get("appUser");
  const admin = getAdminClient();

  // Step 3: filter on the real is_active column (see migration
  // 20260914090500_character_active_selection.sql) rather than falling
  // back to "lowest id" — this reflects the character the user actually
  // selected via POST /characters/:id/select.
  const { data, error } = await admin
    .from("characters")
    .select("*")
    .eq("user_id", appUser.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("characters/me query failed:", error.message);
    throw new ApiError(500, "internal_error", "active_character_lookup_failed", "활성 캐릭터 조회 중 오류가 발생했습니다.");
  }
  if (!data) {
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }

  let inventory: InventoryItemRow[];
  try {
    inventory = await fetchInventory(admin, data.id as number);
  } catch (error) {
    console.error("inventory fetch failed:", (error as Error).message);
    throw new ApiError(500, "internal_error", "inventory_fetch_failed", "인벤토리 조회 중 오류가 발생했습니다.");
  }

  return c.json(toProfile(data as Record<string, unknown>, inventory));
});

async function getActiveCharacterId(
  admin: ReturnType<typeof getAdminClient>,
  userId: number,
): Promise<number> {
  const { data, error } = await admin
    .from("characters")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("active character lookup failed:", error.message);
    throw new ApiError(500, "internal_error", "active_character_lookup_failed", "활성 캐릭터 조회 중 오류가 발생했습니다.");
  }
  if (!data) {
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  return data.id as number;
}

charactersRoutes.get("/me/inventory", async (c) => {
  const appUser = c.get("appUser");
  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  try {
    const inventory = await fetchInventory(admin, characterId);
    return c.json({ items: inventory });
  } catch (error) {
    console.error("inventory fetch failed:", (error as Error).message);
    throw new ApiError(500, "internal_error", "inventory_fetch_failed", "인벤토리 조회 중 오류가 발생했습니다.");
  }
});

// Shop catalog and buy/sell. Gold itself lives client-side only (combatStore.player.gold —
// see the inventory/equipment design doc's note that combat/currency was never made
// server-authoritative), so these routes deliberately do NOT validate or touch gold at
// all — they only add/remove inventory rows. The client checks the price against its own
// gold before calling buy, and adjusts its local gold after either call succeeds.
// 대장장이 sells equipment (weapon/armor), 상인 sells everything else (consumables etc. —
// none seeded yet, so the merchant's shop is genuinely empty for now, matching reality,
// rather than showing the blacksmith's items under both NPCs).
const BLACKSMITH_ITEM_TYPES = ["weapon", "armor"];

charactersRoutes.get("/me/shop", async (c) => {
  const kind = c.req.query("kind");
  if (kind !== "merchant" && kind !== "blacksmith") {
    throw new ApiError(400, "validation_failed", "invalid_request", "kind은 merchant 또는 blacksmith여야 합니다.", "kind");
  }

  const admin = getAdminClient();
  let query = admin
    .from("item_templates")
    .select(
      "id, name, item_type, equip_slot, required_level, required_class, attack_bonus, defense_bonus, buy_price, sell_price, heal_hp",
    )
    .gt("buy_price", 0);
  query = kind === "blacksmith" ? query.in("item_type", BLACKSMITH_ITEM_TYPES) : query.not("item_type", "in", `(${BLACKSMITH_ITEM_TYPES.join(",")})`);
  const { data, error } = await query.order("id", { ascending: true });

  if (error) {
    console.error("shop catalog query failed:", error.message);
    throw new ApiError(500, "internal_error", "shop_catalog_failed", "상점 목록을 불러오는 중 오류가 발생했습니다.");
  }

  return c.json({ items: data ?? [] });
});

charactersRoutes.post("/me/inventory/buy", async (c) => {
  const appUser = c.get("appUser");
  const { item_template_id } = await readJsonBody(c);
  if (typeof item_template_id !== "number" || !Number.isInteger(item_template_id)) {
    throw new ApiError(400, "validation_failed", "invalid_request", "item_template_id는 정수여야 합니다.", "item_template_id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data: item, error: itemError } = await admin
    .from("item_templates")
    .select("id, equip_slot")
    .eq("id", item_template_id)
    .gt("buy_price", 0)
    .maybeSingle();
  if (itemError) {
    console.error("shop item lookup failed:", itemError.message);
    throw new ApiError(500, "internal_error", "shop_item_lookup_failed", "상점 아이템 조회 중 오류가 발생했습니다.");
  }
  if (!item) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "item_template_id");
  }

  // Non-equippable items (consumables) stack onto an existing row instead of cluttering
  // the list with one row per purchase — equippable gear always gets its own row since
  // each piece may end up with its own enchant_level down the line.
  if (item.equip_slot === null) {
    const { data: stack, error: stackError } = await admin
      .from("character_inventory")
      .select("id, quantity")
      .eq("character_id", characterId)
      .eq("item_template_id", item_template_id)
      .maybeSingle();
    if (stackError) {
      console.error("inventory stack lookup failed during buy:", stackError.message);
      throw new ApiError(500, "internal_error", "buy_failed", "아이템 구매 중 오류가 발생했습니다.");
    }
    if (stack) {
      const { error: updateError } = await admin
        .from("character_inventory")
        .update({ quantity: stack.quantity + 1 })
        .eq("id", stack.id);
      if (updateError) {
        console.error("inventory stack update failed during buy:", updateError.message);
        throw new ApiError(500, "internal_error", "buy_failed", "아이템 구매 중 오류가 발생했습니다.");
      }
      const inventory = await fetchInventory(admin, characterId);
      return c.json({ items: inventory }, 201);
    }
  }

  const { data: existing, error: slotError } = await admin
    .from("character_inventory")
    .select("slot_index")
    .eq("character_id", characterId)
    .order("slot_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (slotError) {
    console.error("inventory slot lookup failed:", slotError.message);
    throw new ApiError(500, "internal_error", "buy_failed", "아이템 구매 중 오류가 발생했습니다.");
  }
  const nextSlot = existing ? existing.slot_index + 1 : 0;

  const { error: insertError } = await admin.from("character_inventory").insert({
    character_id: characterId,
    item_template_id,
    storage_type: "inventory",
    slot_index: nextSlot,
    quantity: 1,
    enchant_level: 0,
    is_equipped: false,
    equipped_slot: null,
  });
  if (insertError) {
    console.error("inventory insert failed during buy:", insertError.message);
    throw new ApiError(500, "internal_error", "buy_failed", "아이템 구매 중 오류가 발생했습니다.");
  }

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory }, 201);
});

// Shared by sell/use: decrements a stack by one, deleting the row once it hits zero.
// Returns false if the row doesn't exist (or isn't owned by this character).
async function decrementOrDeleteInventoryRow(
  admin: ReturnType<typeof getAdminClient>,
  inventoryId: number,
  characterId: number,
): Promise<boolean> {
  const { data: row, error: rowError } = await admin
    .from("character_inventory")
    .select("id, quantity")
    .eq("id", inventoryId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) return false;

  if (row.quantity > 1) {
    const { error } = await admin.from("character_inventory").update({ quantity: row.quantity - 1 }).eq("id", row.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("character_inventory").delete().eq("id", row.id);
    if (error) throw error;
  }
  return true;
}

charactersRoutes.post("/me/inventory/:id/sell", async (c) => {
  const appUser = c.get("appUser");
  const inventoryId = Number(c.req.param("id"));
  if (!Number.isInteger(inventoryId)) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  let sold: boolean;
  try {
    sold = await decrementOrDeleteInventoryRow(admin, inventoryId, characterId);
  } catch (error) {
    console.error("inventory update failed during sell:", (error as Error).message);
    throw new ApiError(500, "internal_error", "sell_failed", "아이템 판매 중 오류가 발생했습니다.");
  }
  if (!sold) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory });
});

// Consuming a potion. Like buy/sell, doesn't touch HP itself — that lives in
// combatStore.player.currentHp client-side, same as the rest of combat. The client reads
// the item's heal_hp from its own already-loaded inventory state (this row, before the
// call) and applies it locally once this call succeeds; the server's only job is
// confirming the item exists, is actually consumable, and decrementing/removing it.
charactersRoutes.post("/me/inventory/:id/use", async (c) => {
  const appUser = c.get("appUser");
  const inventoryId = Number(c.req.param("id"));
  if (!Number.isInteger(inventoryId)) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data: row, error: rowError } = await admin
    .from("character_inventory")
    .select("id, item_templates(heal_hp)")
    .eq("id", inventoryId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (rowError) {
    console.error("inventory lookup failed during use:", rowError.message);
    throw new ApiError(500, "internal_error", "use_failed", "아이템 사용 중 오류가 발생했습니다.");
  }
  if (!row) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  const template = row.item_templates as unknown as { heal_hp: number } | null;
  if (!template || template.heal_hp <= 0) {
    throw new ApiError(400, "validation_failed", "not_usable", "사용할 수 없는 아이템입니다.", "id");
  }

  try {
    await decrementOrDeleteInventoryRow(admin, inventoryId, characterId);
  } catch (error) {
    console.error("inventory update failed during use:", (error as Error).message);
    throw new ApiError(500, "internal_error", "use_failed", "아이템 사용 중 오류가 발생했습니다.");
  }

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory });
});

charactersRoutes.post("/me/inventory/:id/equip", async (c) => {
  const appUser = c.get("appUser");
  const inventoryId = Number(c.req.param("id"));
  if (!Number.isInteger(inventoryId)) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { error } = await admin.rpc("set_item_equipped", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_inventory_id: inventoryId,
    p_equip: true,
  });
  if (error) throw mapEquipRpcError(error.message);

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory });
});

charactersRoutes.post("/me/inventory/:id/unequip", async (c) => {
  const appUser = c.get("appUser");
  const inventoryId = Number(c.req.param("id"));
  if (!Number.isInteger(inventoryId)) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { error } = await admin.rpc("set_item_equipped", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_inventory_id: inventoryId,
    p_equip: false,
  });
  if (error) throw mapEquipRpcError(error.message);

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory });
});
