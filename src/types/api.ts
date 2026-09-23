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
}

export interface InventoryListResponse {
  items: InventorySlot[];
}

export type EnchantOutcome = 'success' | 'fail' | 'destroyed';

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
  skill_points: number;
  skill_upgrade_points: number;
  stat_str: number;
  stat_dex: number;
  stat_con: number;
  stat_int: number;
  stat_wis: number;
  skills: CharacterSkill[];
  active_quests: ActiveQuest[];
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
