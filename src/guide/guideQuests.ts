import { QUEST_DEFS, STORY_QUEST_IDS, type QuestDef } from '../stores/questStore';

export interface GuideQuest {
  id: number;
  title: string;
  giver: string;
  village: string;
  kind: '스토리' | '반복' | '메인';
  target: string;
  requiredLevel: number;
  reward: string;
  hook: string;
  completion: string;
}

export interface GuideQuestGroup {
  village: string;
  quests: GuideQuest[];
}

const KIND_ORDER = ['스토리', '반복', '메인'] as const;

function kindOf(q: QuestDef): GuideQuest['kind'] {
  if (q.isMainQuest) return '메인';
  return q.repeatable ? '반복' : '스토리';
}

function rewardOf(q: QuestDef): string {
  const parts = [`경험치 ${q.rewardXp}`, `골드 ${q.rewardGold}`];
  if (q.rewardItemName) parts.push(q.rewardItemName);
  return parts.join(' · ');
}

export function guideQuests(defs: QuestDef[] = QUEST_DEFS): GuideQuestGroup[] {
  const byVillage = new Map<string, GuideQuest[]>();
  for (const q of defs) {
    const list = byVillage.get(q.villageName) ?? [];
    list.push({
      id: q.id,
      title: q.title,
      giver: q.giverNpcName,
      village: q.villageName,
      kind: kindOf(q),
      target: `${q.targetMonsterName} ${q.targetCount}마리`,
      requiredLevel: q.requiredLevel,
      reward: rewardOf(q),
      hook: q.hookText,
      completion: q.completionText,
    });
    byVillage.set(q.villageName, list);
  }
  return [...byVillage].map(([village, quests]) => ({
    village,
    quests: quests.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id - b.id),
  }));
}

/** The main quest only unlocks once every story quest is done. */
export const MAIN_QUEST_UNLOCK_TEXT = `다섯 명의 이야기 의뢰(${STORY_QUEST_IDS.map((id) => QUEST_DEFS.find((q) => q.id === id)?.title ?? `#${id}`).join(', ')})를 모두 완료하면 촌장이 메인 의뢰를 줍니다.`;
