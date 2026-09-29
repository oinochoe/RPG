import { Hono } from "hono";
import { getAdminClient } from "./supabaseAdmin.ts";
import { ApiError, readJsonBody } from "./errors.ts";
import { requireAuth, AppUser } from "./authMiddleware.ts";
import { BOSSES, parseKillBatch, type KillReport } from "./economyRules.ts";
import { rollDropEntry } from "./drops.ts";

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
  restore_mp: number;
  teleport_target: string | null;
  haste_duration_sec: number;
  enchant_scroll_type: "weapon" | "armor" | "blessed" | "cursed" | null;
}

// Flat bonus per enchant_level, added to whichever of attack_bonus/defense_bonus is the
// item's own non-zero "primary" stat (every item_templates row is single-purpose: weapons
// have attack_bonus>0/defense_bonus=0 and vice versa for armor) — baked into fetchInventory's
// response below rather than sent as a separate field, so callers that already sum
// attack_bonus/defense_bonus across equipped items (see characterStore.ts's
// sumEquippedBonus) get the enchanted total for free with no client-side change.
const ENCHANT_BONUS_PER_LEVEL = 2;

// Denormalizes character_inventory joined with item_templates into the shape the client
// needs to render the inventory panel — the client never talks to Postgres directly, so
// item name/stats have to be embedded here rather than looked up client-side.
async function fetchInventory(
  admin: ReturnType<typeof getAdminClient>,
  characterId: number,
): Promise<InventoryItemRow[]> {
  const { data, error } = await admin
    .from("character_inventory")
    // One plain string literal on purpose: supabase-js derives the result type from the literal, and a
    // "a" + "b" concatenation widens to `string`, which collapses every row to GenericStringError.
    .select(
      "id, item_template_id, slot_index, quantity, enchant_level, is_equipped, equipped_slot, item_templates(name, item_type, equip_slot, attack_bonus, defense_bonus, required_level, required_class, buy_price, sell_price, heal_hp, restore_mp, teleport_target, haste_duration_sec, enchant_scroll_type)",
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
      restore_mp: number;
      teleport_target: string | null;
      haste_duration_sec: number;
      enchant_scroll_type: "weapon" | "armor" | "blessed" | "cursed" | null;
    };
    const enchantBonus = row.enchant_level * ENCHANT_BONUS_PER_LEVEL;
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
      attack_bonus: item.attack_bonus > 0 ? item.attack_bonus + enchantBonus : item.attack_bonus,
      defense_bonus: item.defense_bonus > 0 ? item.defense_bonus + enchantBonus : item.defense_bonus,
      required_level: item.required_level,
      required_class: item.required_class,
      buy_price: item.buy_price,
      sell_price: item.sell_price,
      heal_hp: item.heal_hp,
      restore_mp: item.restore_mp,
      teleport_target: item.teleport_target,
      haste_duration_sec: item.haste_duration_sec,
      enchant_scroll_type: item.enchant_scroll_type,
    };
  });
}

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

interface CharacterQuestRow {
  quest_template_id: number;
  status: string;
  progress_count: number;
}

async function fetchQuests(
  admin: ReturnType<typeof getAdminClient>,
  characterId: number,
): Promise<CharacterQuestRow[]> {
  const { data, error } = await admin
    .from("character_quests")
    .select("quest_template_id, status, progress_count")
    .eq("character_id", characterId);

  if (error) throw error;
  return data ?? [];
}

interface BossCooldownRow {
  boss_key: string;
  available_at: string | null;
}

async function fetchBossCooldowns(
  admin: ReturnType<typeof getAdminClient>,
  characterId: number,
): Promise<BossCooldownRow[]> {
  const { data, error } = await admin.rpc("get_boss_cooldowns", { p_character_id: characterId });
  if (error) throw error;
  return (data as BossCooldownRow[]) ?? [];
}

function toProfile(
  row: Record<string, unknown>,
  inventory: InventoryItemRow[],
  skills: CharacterSkillRow[],
  quests: CharacterQuestRow[],
  bossCooldowns: BossCooldownRow[],
) {
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
    skill_upgrade_points: row.skill_upgrade_points,
    progress_rev: row.progress_rev,
    stat_str: row.stat_str,
    stat_dex: row.stat_dex,
    stat_con: row.stat_con,
    stat_int: row.stat_int,
    stat_wis: row.stat_wis,
    skills,
    active_quests: quests,
    boss_cooldowns: bossCooldowns,
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

// ---- server-authoritative economy helpers (see the design doc + the economy migration) ----------

interface ProgressSnapshot {
  level: number;
  experience: number;
  gold: number;
  skill_points: number;
  skill_upgrade_points: number;
  max_hp: number;
  max_mp: number;
  attack_power: number;
  defense_power: number;
  stat_str: number;
  stat_dex: number;
  stat_con: number;
  stat_int: number;
  stat_wis: number;
  progress_rev: number;
  exp_gained: number;
  gold_gained: number;
  leveled_up: boolean;
}

// The RPCs return columns prefixed r_ (to avoid clashing with characters' own column names).
function toSnapshot(row: Record<string, unknown>): ProgressSnapshot {
  return {
    level: row.r_level as number,
    experience: row.r_experience as number,
    gold: row.r_gold as number,
    skill_points: row.r_skill_points as number,
    skill_upgrade_points: row.r_skill_upgrade_points as number,
    max_hp: row.r_max_hp as number,
    max_mp: row.r_max_mp as number,
    attack_power: row.r_attack_power as number,
    defense_power: row.r_defense_power as number,
    stat_str: row.r_stat_str as number,
    stat_dex: row.r_stat_dex as number,
    stat_con: row.r_stat_con as number,
    stat_int: row.r_stat_int as number,
    stat_wis: row.r_stat_wis as number,
    // bigint comes back as a JSON number (small enough here) or a string depending on the driver.
    progress_rev: Number(row.r_progress_rev),
    exp_gained: (row.r_exp_gained as number) ?? 0,
    gold_gained: (row.r_gold_gained as number) ?? 0,
    leveled_up: Boolean(row.r_leveled_up),
  };
}

function snapshotFromRpc(data: unknown): ProgressSnapshot {
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) throw new Error("progress RPC returned no row");
  return toSnapshot(row);
}

async function fetchProgressSnapshot(admin: ReturnType<typeof getAdminClient>, characterId: number): Promise<ProgressSnapshot> {
  const { data, error } = await admin.rpc("progress_snapshot", { p_character_id: characterId });
  if (error) throw error;
  return snapshotFromRpc(data);
}

// Maps the economy RPCs' RAISE EXCEPTION messages to the API error envelope.
function mapEconomyRpcError(message: string | undefined): ApiError {
  if (message?.includes("character_not_found")) {
    return new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (message?.includes("insufficient_gold")) {
    return new ApiError(400, "validation_failed", "insufficient_gold", "골드가 부족합니다.");
  }
  if (message?.includes("insufficient_points")) {
    return new ApiError(400, "validation_failed", "insufficient_points", "스탯 포인트가 부족합니다.");
  }
  if (message?.includes("invalid_stat")) {
    return new ApiError(400, "validation_failed", "invalid_stat", "알 수 없는 스탯입니다.", "stat");
  }
  if (message?.includes("kill_rate_limited")) {
    return new ApiError(429, "rate_limited", "kill_rate_limited", "너무 빠르게 처치를 보고했습니다. 잠시 후 다시 시도해주세요.");
  }
  if (message?.includes("invalid_kills")) {
    return new ApiError(400, "validation_failed", "invalid_kills", "처치 보고가 올바르지 않습니다.", "kills");
  }
  if (message?.includes("drop_not_found")) {
    return new ApiError(404, "not_found", "drop_not_found", "이미 사라졌거나 주울 수 없는 아이템입니다.", "drop_id");
  }
  console.error("economy RPC failed:", message);
  return new ApiError(500, "internal_error", "economy_failed", "처리 중 오류가 발생했습니다.");
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

// Maps enchant_item's RAISE EXCEPTION messages (see
// supabase/migrations/20260923043517_enchant_scrolls_drop_only.sql, the latest rewrite) to
// the API error envelope.
function mapEnchantRpcError(message: string | undefined): ApiError {
  if (message?.includes("character_not_found")) {
    return new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (message?.includes("item_not_found")) {
    return new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  if (message?.includes("not_enchantable")) {
    return new ApiError(400, "validation_failed", "not_enchantable", "인챈트할 수 없는 아이템입니다.", "id");
  }
  if (message?.includes("enchant_maxed")) {
    return new ApiError(400, "validation_failed", "enchant_maxed", "이미 최대 강화 수치입니다.", "id");
  }
  if (message?.includes("scroll_required")) {
    return new ApiError(400, "validation_failed", "scroll_required", "강화 주문서가 필요합니다.", "scroll_inventory_id");
  }
  if (message?.includes("scroll_not_found")) {
    return new ApiError(404, "not_found", "scroll_not_found", "해당 주문서를 찾을 수 없습니다.", "scroll_inventory_id");
  }
  if (message?.includes("not_a_scroll")) {
    return new ApiError(400, "validation_failed", "not_a_scroll", "강화 주문서가 아닙니다.", "scroll_inventory_id");
  }
  const blessedMin = message?.match(/blessed_requires_plus(\d+)/);
  if (blessedMin) {
    return new ApiError(400, "validation_failed", "blessed_requires_min_level", `+${blessedMin[1]} 이상부터 사용할 수 있는 주문서입니다.`, "scroll_inventory_id");
  }
  if (message?.includes("weapon_scroll_on_armor")) {
    return new ApiError(400, "validation_failed", "wrong_scroll_target", "무기 강화 주문서는 무기에만 사용할 수 있습니다.", "scroll_inventory_id");
  }
  if (message?.includes("armor_scroll_on_weapon")) {
    return new ApiError(400, "validation_failed", "wrong_scroll_target", "방어구 강화 주문서는 방어구에만 사용할 수 있습니다.", "scroll_inventory_id");
  }
  if (message?.includes("cursed_requires_plus1")) {
    return new ApiError(400, "validation_failed", "cursed_requires_plus1", "+1 이상부터 사용할 수 있는 주문서입니다.", "scroll_inventory_id");
  }
  console.error("enchant_item RPC failed:", message);
  return new ApiError(500, "internal_error", "enchant_failed", "인챈트 중 오류가 발생했습니다.");
}

// Maps accept_quest/report_quest_kill/claim_quest_reward's RAISE EXCEPTION messages (see
// supabase/migrations/20260922090000_add_quest_system.sql) to the API error envelope.
function mapQuestRpcError(message: string | undefined): ApiError {
  if (message?.includes("character_not_found")) {
    return new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (message?.includes("quest_not_found")) {
    return new ApiError(404, "not_found", "quest_not_found", "해당 퀘스트를 찾을 수 없습니다.", "id");
  }
  if (message?.includes("level_requirement_unmet")) {
    return new ApiError(400, "level_requirement_unmet", "insufficient_level", "레벨이 부족합니다.");
  }
  if (message?.includes("already_accepted")) {
    return new ApiError(409, "conflict", "already_accepted", "이미 수락한 퀘스트입니다.", "id");
  }
  if (message?.includes("quest_not_ready")) {
    return new ApiError(400, "validation_failed", "quest_not_ready", "아직 목표를 달성하지 못했습니다.", "id");
  }
  if (message?.includes("quest_already_claimed")) {
    return new ApiError(409, "conflict", "quest_already_claimed", "이미 보상을 받은 퀘스트입니다.", "id");
  }
  console.error("quest RPC failed:", message);
  return new ApiError(500, "internal_error", "quest_action_failed", "퀘스트 처리 중 오류가 발생했습니다.");
}

// Grants `quantity` of an item into a character's inventory (quest rewards, world drops, shop
// purchases all go through here). The stack-or-insert itself lives in the grant_inventory_item
// RPC, which serializes per character: doing "look for a stack, else insert" from this function
// let concurrent grants each miss the other's row and split one potion stack into several rows
// (and a character with two rows of an item could then never pick that item up again).
async function grantInventoryItem(
  admin: ReturnType<typeof getAdminClient>,
  characterId: number,
  itemTemplateId: number,
  quantity: number,
  failure: { code: string; message: string } = {
    code: "quest_reward_grant_failed",
    message: "퀘스트 보상 지급 중 오류가 발생했습니다.",
  },
): Promise<void> {
  const { error } = await admin.rpc("grant_inventory_item", {
    p_character_id: characterId,
    p_item_template_id: itemTemplateId,
    p_quantity: quantity,
  });
  if (error) {
    console.error("grant_inventory_item RPC failed:", error.message);
    throw new ApiError(500, "internal_error", failure.code, failure.message);
  }
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

// The ONLY progress the client may still write: current HP/MP (clamped to the server's maxima by
// sync_character_vitals). Level/exp/gold/stats/attack/max HP+MP are server-owned now — they change
// only through POST /me/kills, quest claims, shop calls and POST /me/stats/allocate (see the
// economy migration). Older clients still send the full progress object; every other field is
// deliberately ignored rather than rejected so they keep working until they reload.
charactersRoutes.patch("/me/progress", async (c) => {
  const appUser = c.get("appUser");
  const body = await readJsonBody(c);

  for (const field of ["current_hp", "current_mp"] as const) {
    const value = body[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
      throw new ApiError(400, "validation_failed", "invalid_progress", `${field}는 0 이상의 정수여야 합니다.`, field);
    }
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { error } = await admin.rpc("sync_character_vitals", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_hp: body.current_hp,
    p_mp: body.current_mp,
  });
  if (error) {
    if (error.message?.includes("character_not_found")) {
      throw new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
    }
    console.error("character vitals update failed:", error.code, error.message);
    throw new ApiError(500, "internal_error", "progress_update_failed", "진행 상황 저장 중 오류가 발생했습니다.");
  }

  return c.json({}, 200);
});

// The client's report of monsters it killed. The server can't see monsters (they live in the
// client), so this validates plausibility — known monster kind, level within what that kind can
// ever be, boss respawn cooldown, and a rate limit (token bucket in apply_kills) — then does the
// reward math itself: exp/gold/level-ups, quest progress, boss cooldown, and drops (rolled here
// and handed back as single-use tickets). See the design doc's "잔여 위험" for what this can't stop.
charactersRoutes.post("/me/kills", async (c) => {
  const appUser = c.get("appUser");
  const body = await readJsonBody(c);

  const parsed = parseKillBatch(body.kills);
  if (!parsed.ok) {
    throw new ApiError(400, "validation_failed", "invalid_kills", "처치 보고가 올바르지 않습니다.", "kills");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  // Bosses only pay out when their server-tracked respawn cooldown is up. Checked read-only here
  // and recorded AFTER the rewards apply, so a rate-limit refusal doesn't burn a boss cooldown.
  let bossCooldowns: BossCooldownRow[] = [];
  if (parsed.kills.some((k) => k.boss_key)) {
    try {
      bossCooldowns = await fetchBossCooldowns(admin, characterId);
    } catch (error) {
      console.error("boss cooldown lookup failed during kills:", (error as Error).message);
      throw new ApiError(500, "internal_error", "kill_report_failed", "처치 보고 처리 중 오류가 발생했습니다.");
    }
  }
  const nowMs = Date.now();
  const bossOnCooldown = (bossKey: string) => {
    const entry = bossCooldowns.find((cd) => cd.boss_key === bossKey);
    return !!entry?.available_at && new Date(entry.available_at).getTime() > nowMs;
  };

  const results: Record<string, unknown>[] = [];
  const accepted: { index: number; kill: KillReport }[] = [];
  const seenBosses = new Set<string>();
  parsed.kills.forEach((kill, index) => {
    if (kill.boss_key && (bossOnCooldown(kill.boss_key) || seenBosses.has(kill.boss_key))) {
      results[index] = { index, accepted: false, reason: "boss_on_cooldown" };
      return;
    }
    if (kill.boss_key) seenBosses.add(kill.boss_key);
    accepted.push({ index, kill });
  });

  if (accepted.length === 0) {
    const progress = await fetchProgressSnapshot(admin, characterId).catch((error) => {
      console.error("progress snapshot failed:", (error as Error).message);
      throw new ApiError(500, "internal_error", "kill_report_failed", "처치 보고 처리 중 오류가 발생했습니다.");
    });
    return c.json({ progress, results, quests_updated: [], boss_cooldowns: null });
  }

  const { data: applied, error: applyError } = await admin.rpc("apply_kills", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_kills: accepted.map((a) => ({ level: a.kill.level })),
  });
  if (applyError) throw mapEconomyRpcError(applyError.message);
  const progress = snapshotFromRpc(applied);

  // Record boss kills (starts the respawn cooldown). A race that already recorded one just means
  // the cooldown is already running — nothing to undo, the reward has been given once.
  let bossRecorded = false;
  for (const { kill } of accepted) {
    if (!kill.boss_key) continue;
    const { error } = await admin.rpc("record_boss_kill", {
      p_user_id: appUser.id,
      p_character_id: characterId,
      p_boss_key: kill.boss_key,
    });
    if (error && !error.message?.includes("boss_on_cooldown")) {
      console.error("record_boss_kill failed during kills:", error.message);
    }
    bossRecorded = bossRecorded || !error;
  }

  // Quest progress: one report per accepted kill, merged by quest (later rows are newer).
  const questsUpdated = new Map<number, unknown>();
  for (const { kill } of accepted) {
    const { data, error } = await admin.rpc("report_quest_kill", {
      p_user_id: appUser.id,
      p_character_id: characterId,
      p_monster_template_id: kill.template_id,
    });
    if (error) {
      console.error("report_quest_kill failed during kills:", error.message);
      continue;
    }
    for (const row of (data as { quest_template_id: number }[] | null) ?? []) {
      questsUpdated.set(row.quest_template_id, row);
    }
  }

  // Drops: rolled here, issued as tickets (pending_drops), described from item_templates.
  const rolls: { index: number; itemId: number }[] = [];
  for (const { index, kill } of accepted) {
    const bossName = kill.boss_key ? BOSSES[kill.boss_key].name : "";
    const entry = rollDropEntry(kill.template_id, bossName);
    if (entry) rolls.push({ index, itemId: entry.itemTemplateId });
  }
  const dropByIndex = new Map<number, Record<string, unknown>>();
  if (rolls.length > 0) {
    const { data: tickets, error: ticketError } = await admin.rpc("issue_drops", {
      p_user_id: appUser.id,
      p_character_id: characterId,
      p_item_ids: rolls.map((r) => r.itemId),
    });
    if (ticketError) {
      console.error("issue_drops failed:", ticketError.message);
    } else {
      const ids = [...new Set(rolls.map((r) => r.itemId))];
      const { data: items, error: itemsError } = await admin
        .from("item_templates")
        .select("id, name, item_type")
        .in("id", ids);
      if (itemsError) console.error("drop item lookup failed:", itemsError.message);
      const itemById = new Map((items ?? []).map((it: { id: number; name: string; item_type: string }) => [it.id, it]));
      for (const t of (tickets as { r_drop_id: string; r_item_template_id: number; r_ordinal: number }[]) ?? []) {
        const roll = rolls[t.r_ordinal - 1];
        const item = itemById.get(t.r_item_template_id);
        if (!roll || !item) continue;
        dropByIndex.set(roll.index, {
          drop_id: t.r_drop_id,
          item_template_id: t.r_item_template_id,
          item_name: item.name,
          item_type: item.item_type,
        });
      }
    }
  }

  for (const { index } of accepted) {
    const drop = dropByIndex.get(index);
    results[index] = drop ? { index, accepted: true, drop } : { index, accepted: true };
  }

  let bossCooldownsOut: BossCooldownRow[] | null = null;
  if (bossRecorded) {
    try {
      bossCooldownsOut = await fetchBossCooldowns(admin, characterId);
    } catch (error) {
      console.error("boss cooldown refresh failed:", (error as Error).message);
    }
  }

  return c.json({
    progress,
    results,
    quests_updated: [...questsUpdated.values()],
    boss_cooldowns: bossCooldownsOut,
  });
});

// Spend stat points on one stat (server-side allocate_stat: cost, derived gains). The client
// still predicts locally and then adopts the returned snapshot.
charactersRoutes.post("/me/stats/allocate", async (c) => {
  const appUser = c.get("appUser");
  const { stat } = await readJsonBody(c);
  if (typeof stat !== "string" || !["str", "dex", "con", "int", "wis"].includes(stat)) {
    throw new ApiError(400, "validation_failed", "invalid_stat", "알 수 없는 스탯입니다.", "stat");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("allocate_stat", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_stat: stat,
  });
  if (error) throw mapEconomyRpcError(error.message);

  return c.json({ progress: snapshotFromRpc(data) });
});

charactersRoutes.post("/me/skills/upgrade", async (c) => {
  const appUser = c.get("appUser");
  const { skill_template_id } = await readJsonBody(c);
  if (typeof skill_template_id !== "number" || !Number.isInteger(skill_template_id)) {
    throw new ApiError(400, "validation_failed", "invalid_request", "skill_template_id는 정수여야 합니다.", "skill_template_id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("upgrade_character_skill", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_skill_template_id: skill_template_id,
  });
  if (error) throw mapSkillUpgradeRpcError(error.message);

  const row = (data as { skill_level: number; skill_upgrade_points: number }[])[0];
  return c.json({ skill_level: row.skill_level, skill_upgrade_points: row.skill_upgrade_points });
});

// :id here is a quest_templates id (a static, client-hardcoded catalog — see combatStore's
// SKILLS_BY_CLASS precedent — not a character_quests row id), matching how the skill upgrade
// route takes a skill_template_id.
charactersRoutes.post("/me/quests/:id/accept", async (c) => {
  const appUser = c.get("appUser");
  const questTemplateId = Number(c.req.param("id"));
  if (!Number.isInteger(questTemplateId)) {
    throw new ApiError(404, "not_found", "quest_not_found", "해당 퀘스트를 찾을 수 없습니다.", "id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("accept_quest", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_quest_template_id: questTemplateId,
  });
  if (error) throw mapQuestRpcError(error.message);

  const row = (data as { quest_template_id: number; status: string; progress_count: number }[])[0];
  return c.json(row, 201);
});

// Called once per monster kill (see combatStore's applyKill) with that monster's
// monster_template_id — bumps progress on every one of the caller's in_progress quests
// targeting that monster kind, not just one, so `updated` can be an empty array (no active
// quest cared about this kill) or contain more than one row.
charactersRoutes.post("/me/quests/progress", async (c) => {
  const appUser = c.get("appUser");
  const { monster_template_id } = await readJsonBody(c);
  if (typeof monster_template_id !== "number" || !Number.isInteger(monster_template_id)) {
    throw new ApiError(400, "validation_failed", "invalid_request", "monster_template_id는 정수여야 합니다.", "monster_template_id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("report_quest_kill", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_monster_template_id: monster_template_id,
  });
  if (error) throw mapQuestRpcError(error.message);

  return c.json({ updated: data ?? [] });
});

charactersRoutes.post("/me/quests/:id/claim", async (c) => {
  const appUser = c.get("appUser");
  const questTemplateId = Number(c.req.param("id"));
  if (!Number.isInteger(questTemplateId)) {
    throw new ApiError(404, "not_found", "quest_not_found", "해당 퀘스트를 찾을 수 없습니다.", "id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("claim_quest_reward", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_quest_template_id: questTemplateId,
  });
  if (error) throw mapQuestRpcError(error.message);

  const row = (data as { reward_xp: number; reward_gold: number; reward_item_id: number | null }[])[0];
  if (row.reward_item_id !== null) {
    await grantInventoryItem(admin, characterId, row.reward_item_id, 1);
  }

  const inventory = await fetchInventory(admin, characterId);
  // The claim RPC already applied the xp/gold (level-ups included); hand back the resulting state.
  const progress = await fetchProgressSnapshot(admin, characterId).catch((error) => {
    console.error("progress snapshot failed after quest claim:", (error as Error).message);
    throw new ApiError(500, "internal_error", "quest_action_failed", "퀘스트 처리 중 오류가 발생했습니다.");
  });
  return c.json({
    reward_xp: row.reward_xp,
    reward_gold: row.reward_gold,
    reward_item_id: row.reward_item_id,
    inventory,
    progress,
  });
});

// Picking up a world drop. The client no longer says WHICH item — it presents the ticket
// (`drop_id`) the server issued when it rolled that drop (POST /me/kills), and the server grants
// exactly the item on the ticket. Tickets are single-use, tied to one character and expire.
charactersRoutes.post("/me/inventory/loot", async (c) => {
  const appUser = c.get("appUser");
  const { drop_id } = await readJsonBody(c);
  if (typeof drop_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(drop_id)) {
    throw new ApiError(400, "validation_failed", "invalid_request", "drop_id가 올바르지 않습니다.", "drop_id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data: itemId, error: redeemError } = await admin.rpc("redeem_drop", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_drop_id: drop_id,
  });
  if (redeemError) throw mapEconomyRpcError(redeemError.message);

  await grantInventoryItem(admin, characterId, itemId as number, 1);

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory }, 201);
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
  let skills: CharacterSkillRow[];
  let quests: CharacterQuestRow[];
  let bossCooldowns: BossCooldownRow[];
  try {
    inventory = await fetchInventory(admin, data.id as number);
    skills = await fetchSkills(admin, data.id as number);
    quests = await fetchQuests(admin, data.id as number);
    bossCooldowns = await fetchBossCooldowns(admin, data.id as number);
  } catch (error) {
    console.error("inventory/skills/quests/boss-cooldowns fetch failed:", (error as Error).message);
    throw new ApiError(500, "internal_error", "inventory_fetch_failed", "인벤토리 조회 중 오류가 발생했습니다.");
  }

  return c.json(toProfile(data as Record<string, unknown>, inventory, skills, quests, bossCooldowns));
});

// Boss keys the client may report a kill for — mirrors boss_respawn_hours in the boss_kill_state
// migration. Kept in sync manually since there's no shared-constants import between the DB and
// this edge function.
const VALID_BOSS_KEYS = ["world_boss", "ruined_catacombs", "orc_stronghold", "ghoul_crypt", "mushroom_den"];

function mapBossKillRpcError(message: string | undefined): ApiError {
  if (message?.includes("character_not_found")) {
    return new ApiError(404, "not_found", "no_active_character", "선택된 활성 캐릭터가 없습니다.");
  }
  if (message?.includes("boss_key_invalid")) {
    return new ApiError(400, "validation_failed", "boss_key_invalid", "알 수 없는 보스입니다.", "boss_key");
  }
  if (message?.includes("boss_on_cooldown")) {
    return new ApiError(409, "conflict", "boss_on_cooldown", "아직 보스가 리스폰되지 않았습니다.", "boss_key");
  }
  console.error("record_boss_kill RPC failed:", message);
  return new ApiError(500, "internal_error", "boss_kill_failed", "보스 처치 기록 중 오류가 발생했습니다.");
}

// Called once when the client detects a tracked boss died (see combatStore's applyKill) —
// records the kill server-side so the long respawn window survives a page refresh, then
// returns the fresh cooldown map the same shape /me returns it in.
charactersRoutes.post("/me/boss-kill", async (c) => {
  const appUser = c.get("appUser");
  const { boss_key } = await readJsonBody(c);
  if (typeof boss_key !== "string" || !VALID_BOSS_KEYS.includes(boss_key)) {
    throw new ApiError(400, "validation_failed", "boss_key_invalid", "알 수 없는 보스입니다.", "boss_key");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { error } = await admin.rpc("record_boss_kill", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_boss_key: boss_key,
  });
  if (error) throw mapBossKillRpcError(error.message);

  const bossCooldowns = await fetchBossCooldowns(admin, characterId);
  return c.json({ boss_cooldowns: bossCooldowns });
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

// Shop catalog and buy/sell. Gold is server-owned (characters.gold): buy pays through the
// spend_gold RPC (refused when the character can't afford it) and sell credits the item's
// sell_price via grant_progress. The client still adjusts its local wallet right away so the UI
// feels instant, then adopts the `progress` snapshot these responses carry.
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
      "id, name, item_type, equip_slot, required_level, required_class, attack_bonus, defense_bonus, buy_price, sell_price, heal_hp, restore_mp, teleport_target, haste_duration_sec",
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
  const { item_template_id, quantity } = await readJsonBody(c);
  if (typeof item_template_id !== "number" || !Number.isInteger(item_template_id)) {
    throw new ApiError(400, "validation_failed", "invalid_request", "item_template_id는 정수여야 합니다.", "item_template_id");
  }
  // Optional — omitted (or 1) matches the old single-purchase behavior exactly.
  const requestedQuantity = quantity === undefined ? 1 : quantity;
  if (typeof requestedQuantity !== "number" || !Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 99) {
    throw new ApiError(400, "validation_failed", "invalid_quantity", "quantity는 1~99 사이의 정수여야 합니다.", "quantity");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data: item, error: itemError } = await admin
    .from("item_templates")
    .select("id, equip_slot, buy_price")
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

  // Equippable gear always gets its own single row (each piece may end up with its own
  // enchant_level down the line) — bulk purchase only makes sense for stackable consumables.
  if (item.equip_slot !== null && requestedQuantity !== 1) {
    throw new ApiError(400, "validation_failed", "not_stackable", "장비 아이템은 한 번에 하나만 구매할 수 있습니다.", "quantity");
  }

  // Gold is server-owned now: pay first (atomic check-and-deduct under the character lock, so two
  // rapid buys can't both spend the same gold), then hand over the item — refunding if that fails.
  const cost = (item.buy_price as number) * requestedQuantity;
  const { data: paid, error: payError } = await admin.rpc("spend_gold", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_amount: cost,
  });
  if (payError) throw mapEconomyRpcError(payError.message);
  const progress = snapshotFromRpc(paid);

  try {
    // Consumables stack onto an existing row; equippable gear always gets its own row.
    await grantInventoryItem(admin, characterId, item_template_id, requestedQuantity, {
      code: "buy_failed",
      message: "아이템 구매 중 오류가 발생했습니다.",
    });
  } catch (error) {
    const { error: refundError } = await admin.rpc("grant_progress", {
      p_character_id: characterId,
      p_exp: 0,
      p_gold: cost,
    });
    if (refundError) console.error("buy refund failed (gold lost):", refundError.message);
    throw error;
  }

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory, progress }, 201);
});

// Shared by sell/use: decrements a stack by `amount` (default 1), deleting the row once it
// hits zero. Returns false if the row doesn't exist (or isn't owned by this character), or
// 'insufficient' if amount exceeds what's actually in the stack (equippable gear always has
// quantity 1, so requesting more than 1 there naturally hits this too — no separate
// equip_slot check needed).
async function decrementOrDeleteInventoryRow(
  admin: ReturnType<typeof getAdminClient>,
  inventoryId: number,
  characterId: number,
  amount = 1,
): Promise<'ok' | 'not_found' | 'insufficient'> {
  const { data: row, error: rowError } = await admin
    .from("character_inventory")
    .select("id, quantity")
    .eq("id", inventoryId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) return 'not_found';
  if (amount > row.quantity) return 'insufficient';

  if (row.quantity > amount) {
    const { error } = await admin.from("character_inventory").update({ quantity: row.quantity - amount }).eq("id", row.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("character_inventory").delete().eq("id", row.id);
    if (error) throw error;
  }
  return 'ok';
}

charactersRoutes.post("/me/inventory/:id/sell", async (c) => {
  const appUser = c.get("appUser");
  const inventoryId = Number(c.req.param("id"));
  if (!Number.isInteger(inventoryId)) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  const { quantity } = await readJsonBody(c);
  // Optional — omitted (or 1) matches the old single-sell behavior exactly.
  const requestedQuantity = quantity === undefined ? 1 : quantity;
  if (typeof requestedQuantity !== "number" || !Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 99) {
    throw new ApiError(400, "validation_failed", "invalid_quantity", "quantity는 1~99 사이의 정수여야 합니다.", "quantity");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  // The sale price comes from the item template, never from the client.
  const { data: row, error: rowError } = await admin
    .from("character_inventory")
    .select("id, item_templates(sell_price)")
    .eq("id", inventoryId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (rowError) {
    console.error("inventory lookup failed during sell:", rowError.message);
    throw new ApiError(500, "internal_error", "sell_failed", "아이템 판매 중 오류가 발생했습니다.");
  }
  if (!row) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  const sellPrice = ((row.item_templates as unknown as { sell_price: number } | null)?.sell_price ?? 0) as number;

  let result: 'ok' | 'not_found' | 'insufficient';
  try {
    result = await decrementOrDeleteInventoryRow(admin, inventoryId, characterId, requestedQuantity);
  } catch (error) {
    console.error("inventory update failed during sell:", (error as Error).message);
    throw new ApiError(500, "internal_error", "sell_failed", "아이템 판매 중 오류가 발생했습니다.");
  }
  if (result === 'not_found') {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  if (result === 'insufficient') {
    throw new ApiError(400, "validation_failed", "insufficient_quantity", "보유한 수량보다 많이 판매할 수 없습니다.", "quantity");
  }

  const { data: credited, error: creditError } = await admin.rpc("grant_progress", {
    p_character_id: characterId,
    p_exp: 0,
    p_gold: sellPrice * requestedQuantity,
  });
  if (creditError) {
    // The item is already gone; this should be practically unreachable (a DB failure between two
    // statements) — log loudly so it can be reconciled by hand.
    console.error("sell credit failed (item removed, gold NOT granted):", creditError.message, { characterId, inventoryId, sellPrice, requestedQuantity });
    throw new ApiError(500, "internal_error", "sell_failed", "아이템 판매 중 오류가 발생했습니다.");
  }

  const inventory = await fetchInventory(admin, characterId);
  return c.json({ items: inventory, sold_quantity: requestedQuantity, progress: snapshotFromRpc(credited) });
});

// Consuming a potion or scroll. Like buy/sell, doesn't touch HP/MP/position itself — those
// live client-side (combatStore.player.currentHp/currentMp, playerPosition), same as the
// rest of combat/movement. The client reads the item's heal_hp/restore_mp/teleport_target
// from its own already-loaded inventory state (this row, before the call) and applies the
// effect locally once this call succeeds; the server's only job is confirming the item
// exists, is actually consumable, and decrementing/removing it.
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
    .select("id, item_templates(heal_hp, restore_mp, teleport_target, haste_duration_sec)")
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
  const template = row.item_templates as unknown as {
    heal_hp: number;
    restore_mp: number;
    teleport_target: string | null;
    haste_duration_sec: number;
  } | null;
  if (
    !template ||
    (template.heal_hp <= 0 && template.restore_mp <= 0 && !template.teleport_target && template.haste_duration_sec <= 0)
  ) {
    throw new ApiError(400, "validation_failed", "not_usable", "사용할 수 없는 아이템입니다.", "id");
  }

  try {
    await decrementOrDeleteInventoryRow(admin, inventoryId, characterId, 1);
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

// Enchant an equipped-or-not weapon/armor row using a scroll from the caller's own inventory
// (see enchant_item's latest migration, 20260928120000_split_weapon_armor_enchant_scrolls.sql):
// 'weapon' scrolls are safe through +6 and destroy the weapon on a failed roll beyond that;
// 'armor' scrolls the same with safe +4; 'blessed' always succeeds with a random +1~+3 jump
// (rarely +4), usable from +1 on weapons / +3 on armor; 'cursed' knocks the item down by 1.
// `enchant_level` comes back null when the outcome is 'destroyed' — the row is gone from
// `items` in that case.
charactersRoutes.post("/me/inventory/:id/enchant", async (c) => {
  const appUser = c.get("appUser");
  const inventoryId = Number(c.req.param("id"));
  if (!Number.isInteger(inventoryId)) {
    throw new ApiError(404, "not_found", "item_not_found", "해당 아이템을 찾을 수 없습니다.", "id");
  }
  const { scroll_inventory_id } = await readJsonBody(c);
  if (typeof scroll_inventory_id !== "number" || !Number.isInteger(scroll_inventory_id)) {
    throw new ApiError(400, "validation_failed", "scroll_required", "강화 주문서가 필요합니다.", "scroll_inventory_id");
  }

  const admin = getAdminClient();
  const characterId = await getActiveCharacterId(admin, appUser.id);

  const { data, error } = await admin.rpc("enchant_item", {
    p_user_id: appUser.id,
    p_character_id: characterId,
    p_inventory_id: inventoryId,
    p_scroll_inventory_id: scroll_inventory_id,
  });
  if (error) throw mapEnchantRpcError(error.message);

  const row = (data as { enchant_level: number | null; outcome: "success" | "fail" | "destroyed" | "cursed" }[])[0];
  const inventory = await fetchInventory(admin, characterId);
  return c.json({ enchant_level: row.enchant_level, outcome: row.outcome, items: inventory });
});
