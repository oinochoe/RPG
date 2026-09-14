import { Hono } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError, readJsonBody } from "./errors.ts";
import { requireAuth, AppUser } from "./authMiddleware.ts";

export const mapsRoutes = new Hono<{ Variables: { appUser: AppUser } }>();

mapsRoutes.use("*", requireAuth);

mapsRoutes.post("/enter-map", async (c) => {
  const appUser = c.get("appUser");
  const { map_id } = await readJsonBody(c);
  if (typeof map_id !== "number") {
    throw new ApiError(400, "validation_failed", "invalid_request", "map_id는 숫자여야 합니다.", "map_id");
  }

  const admin = getAdminClient();
  const { data: map, error: mapError } = await admin
    .from("map_templates")
    .select("*")
    .eq("id", map_id)
    .maybeSingle();

  if (mapError) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("map_templates lookup failed:", mapError.message);
    throw new ApiError(500, "internal_error", "map_lookup_failed", "맵 조회 중 오류가 발생했습니다.");
  }
  if (!map) {
    throw new ApiError(404, "not_found", "map_not_found", "해당 맵을 찾을 수 없습니다.", "map_id");
  }

  // Active-character lookup uses the real `characters.is_active` column and
  // `select_character` RPC introduced in Task 7 (migration
  // 20260914090500_character_active_selection.sql), not the brief's stale
  // "lowest id" stand-in — this keeps the "no active character" gate here
  // consistent with GET /characters/me and POST /characters/:id/select.
  const { data: character, error: charError } = await admin
    .from("characters")
    .select("id, level, current_hp")
    .eq("user_id", appUser.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (charError) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("active character lookup failed:", charError.message);
    throw new ApiError(500, "internal_error", "active_character_lookup_failed", "활성 캐릭터 조회 중 오류가 발생했습니다.");
  }
  if (!character) {
    throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (character.level < map.required_level) {
    throw new ApiError(400, "level_requirement_unmet", "insufficient_level", "입장 가능한 레벨이 부족합니다.");
  }
  if (character.current_hp <= 0) {
    throw new ApiError(400, "character_dead", "revive_required", "사망 상태에서는 맵을 이동할 수 없습니다. 부활이 필요합니다.");
  }

  const { error: updateError } = await admin
    .from("characters")
    .update({
      current_map_id: map.id,
      position_x: map.spawn_x,
      position_y: map.spawn_y,
      position_z: map.spawn_z,
    })
    .eq("id", character.id);

  if (updateError) {
    // Don't leak raw Postgres error text to the client (Task 6 lesson).
    console.error("character position update failed:", updateError.message);
    throw new ApiError(500, "internal_error", "enter_map_failed", "맵 입장 처리 중 오류가 발생했습니다.");
  }

  return c.json({
    map_id: map.id,
    map_name: map.name,
    position_x: map.spawn_x,
    position_y: map.spawn_y,
    position_z: map.spawn_z,
    dungeon_instance_id: null,
    monsters: [],
  });
});
