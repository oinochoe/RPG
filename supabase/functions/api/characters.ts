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
        "item_templates(name, item_type, equip_slot, attack_bonus, defense_bonus, required_level, required_class)",
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
