import { BOSSES, MAX_REGULAR_MONSTER_LEVEL } from '../../supabase/functions/api/economyRules';
import { dropChancesFor, type DropChance } from '../../supabase/functions/api/drops';

export interface GuideMonster {
  templateId: number;
  name: string;
  /** Where it appears, in the guide's own region names. */
  zones: string[];
  maxLevel: number | null;
  drops: DropChance[];
}

export interface GuideBoss {
  key: string;
  name: string;
  level: number;
  drops: DropChance[];
}

// Names and places verified against FieldMonsters.ts (field spawn builders) and dungeonLayout.ts (dungeon rosters).
// Template 5 (giant lord species) is intentionally absent: it only ever spawns as the tracked bosses
// 태고의 거인 (구울 평원) and 거인 군주 (무너진 유적 last floor), listed by guideBosses. No captain uses it.
const MONSTERS: { templateId: number; name: string; zones: string[] }[] = [
  { templateId: 1, name: '슬라임', zones: ['들판'] },
  { templateId: 2, name: '고블린', zones: ['던전'] },
  { templateId: 3, name: '스켈레톤 (해골 전사)', zones: ['들판', '뼈의 들판', '던전'] },
  { templateId: 4, name: '가시선인장', zones: ['사막'] },
  { templateId: 6, name: '오크', zones: ['오크 마을', '던전'] },
  { templateId: 7, name: '구울', zones: ['구울 평원', '던전'] },
  { templateId: 8, name: '버섯왕', zones: ['요정의 숲', '던전'] },
  { templateId: 9, name: '버섯 정령', zones: ['요정의 숲', '던전'] },
  { templateId: 10, name: '사구 웜', zones: ['사막'] },
  { templateId: 11, name: '코볼트', zones: ['오크 마을'] },
  { templateId: 12, name: '오크 궁수', zones: ['오크 마을'] },
  { templateId: 13, name: '죽음의 기사', zones: ['뼈의 들판'] },
  { templateId: 14, name: '유적의 파수병', zones: ['유적'] },
  { templateId: 15, name: '늑대', zones: ['들판'] },
];

export function guideMonsters(): GuideMonster[] {
  return MONSTERS.map((m) => ({
    ...m,
    maxLevel: MAX_REGULAR_MONSTER_LEVEL[m.templateId] ?? null,
    drops: dropChancesFor(m.templateId, m.name),
  }));
}

export function guideBosses(): GuideBoss[] {
  return Object.entries(BOSSES).map(([key, b]) => ({
    key,
    name: b.name,
    level: b.level,
    drops: dropChancesFor(b.templateId, b.name),
  }));
}
