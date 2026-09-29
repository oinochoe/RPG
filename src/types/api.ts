export interface ApiErrorBody {
  error: string;
  trace_id?: string;
  message?: string;
  field?: string;
  reason?: string;
}

export class ApiError extends Error {
  status: number;
  error: string;
  reason?: string;
  field?: string;
  traceId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? 'Unknown API error');
    this.status = status;
    this.error = body.error;
    this.reason = body.reason;
    this.field = body.field;
    this.traceId = body.trace_id;
  }
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export type CharacterClass = 'warrior' | 'mage' | 'archer';

export interface CharacterSummary {
  id: number;
  name: string;
  character_class: CharacterClass;
  level: number;
  current_hp: number;
  max_hp: number;
  current_map_id: number;
}

export interface EquippedItem {
  id: number;
  item_template_id: number;
  equipped_slot: string;
  enchant_level: number;
  attack_bonus: number;
  defense_bonus: number;
}

export interface InventorySlot {
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
  teleport_target: 'village' | 'blink' | null;
  haste_duration_sec: number;
  enchant_scroll_type: 'weapon' | 'armor' | 'blessed' | 'cursed' | null;
}

/**
 * The server-owned economy state (gold, exp/level, stat/skill points, derived stats). Every
 * economy response carries one; the client adopts it over its own local prediction (see
 * combatStore.adoptProgress). `progress_rev` only ever grows, so a stale response can be told apart.
 */
export interface ProgressSnapshot {
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
  // What this particular request changed (0/false for calls that only read).
  exp_gained: number;
  gold_gained: number;
  leveled_up: boolean;
}

export interface InventoryListResponse {
  items: InventorySlot[];
  // Present on shop responses (buy/sell), which change gold.
  progress?: ProgressSnapshot;
}

/** One monster the client reports having killed (POST /characters/me/kills). */
export interface KillReport {
  template_id: number;
  level: number;
  boss_key?: string;
}

export interface DropTicket {
  drop_id: string;
  item_template_id: number;
  item_name: string;
  item_type: string;
}

export type KillResult =
  | { index: number; accepted: true; drop?: DropTicket }
  | { index: number; accepted: false; reason: string };

export interface KillReportResponse {
  progress: ProgressSnapshot;
  results: KillResult[];
  quests_updated: ActiveQuest[];
  // Non-null only when a tracked boss kill was recorded.
  boss_cooldowns: BossCooldown[] | null;
}

export type EnchantOutcome = 'success' | 'fail' | 'destroyed' | 'cursed';

export interface EnchantItemResponse {
  enchant_level: number | null;
  outcome: EnchantOutcome;
  items: InventorySlot[];
}

export interface ShopItem {
  id: number;
  name: string;
  item_type: string;
  equip_slot: string | null;
  required_level: number;
  required_class: string | null;
  attack_bonus: number;
  defense_bonus: number;
  buy_price: number;
  sell_price: number;
  heal_hp: number;
  restore_mp: number;
  teleport_target: 'village' | 'blink' | null;
  haste_duration_sec: number;
}

export interface ShopListResponse {
  items: ShopItem[];
}

export interface CharacterSkill {
  skill_template_id: number;
  skill_level: number;
}

export type QuestStatus = 'in_progress' | 'completed' | 'abandoned';

export interface ActiveQuest {
  quest_template_id: number;
  status: QuestStatus;
  progress_count: number;
}

// One row per tracked unique boss (see boss_kill_state migration) — available_at is null
// when the boss is ready to fight (never killed, or its cooldown already elapsed), otherwise
// an ISO timestamp for when it respawns.
export interface BossCooldown {
  boss_key: string;
  available_at: string | null;
}

export interface CharacterProfile {
  id: number;
  user_id: number;
  name: string;
  character_class: CharacterClass;
  level: number;
  experience: number;
  current_hp: number;
  max_hp: number;
  current_mp: number;
  max_mp: number;
  attack_power: number;
  defense_power: number;
  gold: number;
  // Optional only so older fixtures compile; the server always sends it.
  progress_rev?: number;
  skill_points: number;
  skill_upgrade_points: number;
  stat_str: number;
  stat_dex: number;
  stat_con: number;
  stat_int: number;
  stat_wis: number;
  skills: CharacterSkill[];
  active_quests: ActiveQuest[];
  boss_cooldowns: BossCooldown[];
  current_map_id: number;
  position_x: number;
  position_y: number;
  position_z: number;
  created_at: string;
  equipped_items: EquippedItem[];
  inventory: InventorySlot[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface MonsterInstanceSummary {
  instance_id: number;
  monster_template_id: number;
  name: string;
  level: number;
  current_hp: number;
  max_hp: number;
  position_x: number;
  position_y: number;
  position_z: number;
}

export interface EnterMapResponse {
  map_id: number;
  map_name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  dungeon_instance_id: number | null;
  monsters: MonsterInstanceSummary[];
}
