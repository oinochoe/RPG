import { SKILLS_BY_CLASS, type SkillDef } from '../stores/combatStore';

export type GuideClassKey = 'warrior' | 'archer' | 'mage';
export const CLASS_LABEL: Record<GuideClassKey, string> = { warrior: '전사', archer: '궁수', mage: '마법사' };

export interface GuideSkill {
  id: number;
  name: string;
  requiredLevel: number;
  mpCost: number;
  cooldownSec: number;
  multiplier: number;
  kind: '단일' | '광역';
  radius: number | null;
  awakening: boolean;
}

const AWAKENING_LEVEL = 30;

function toGuide(skill: SkillDef): GuideSkill {
  const aoe = skill.type === 'aoe';
  return {
    id: skill.id,
    name: skill.name,
    requiredLevel: skill.requiredLevel,
    mpCost: skill.mpCost,
    cooldownSec: skill.cooldownMs / 1000,
    multiplier: skill.baseDamageMultiplier,
    kind: aoe ? '광역' : '단일',
    radius: aoe ? skill.aoeRadius ?? null : null,
    awakening: skill.requiredLevel >= AWAKENING_LEVEL,
  };
}

/** The guide's skill tab data: per class, ordered by the level a skill unlocks at. */
export function guideSkills(source: Record<GuideClassKey, SkillDef[]> = SKILLS_BY_CLASS): Record<GuideClassKey, GuideSkill[]> {
  const result = { warrior: [], archer: [], mage: [] } as Record<GuideClassKey, GuideSkill[]>;
  for (const cls of Object.keys(result) as GuideClassKey[]) {
    result[cls] = (source[cls] ?? []).map(toGuide).sort((a, b) => a.requiredLevel - b.requiredLevel);
  }
  return result;
}
