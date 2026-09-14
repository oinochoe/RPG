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

function toProfile(row: Record<string, unknown>) {
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
    equipped_items: [],
    inventory: [],
  };
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

  return c.json(toProfile(data as Record<string, unknown>));
});
