import { create } from 'zustand';
import * as charactersApi from '../api/characters';
import type { ActiveQuest } from '../types/api';

// Static catalog mirroring supabase/migrations/20260922090000_add_quest_system.sql's seeded
// quest_templates rows — same duplication SKILLS_BY_CLASS already has for skill_templates
// (see combatStore.ts): the server is the source of truth for what's actually grantable
// (accept/progress/claim all resolve everything server-side by id), this is just what the
// UI reads to render titles/costs/rewards without a round trip.
export interface QuestDef {
  id: number;
  title: string;
  giverNpcName: string;
  targetMonsterId: number;
  targetMonsterName: string;
  targetCount: number;
  requiredLevel: number;
  rewardXp: number;
  rewardGold: number;
  rewardItemId: number | null;
  // Display-only — matches item_templates.name for ids 7/8 (체력 물약/상급 체력 물약), the
  // only two reward items this quest set currently uses. Avoids the dialogue panel needing
  // its own inventory/shop fetch just to show what it's handing out.
  rewardItemName: string | null;
}

export const QUEST_DEFS: QuestDef[] = [
  {
    id: 1,
    title: '여울의 골칫거리',
    giverNpcName: '촌장',
    targetMonsterId: 1,
    targetMonsterName: '슬라임',
    targetCount: 5,
    requiredLevel: 1,
    rewardXp: 60,
    rewardGold: 40,
    rewardItemId: null,
    rewardItemName: null,
  },
  {
    id: 2,
    title: '밭을 지켜라',
    giverNpcName: '농부',
    targetMonsterId: 1,
    targetMonsterName: '슬라임',
    targetCount: 8,
    requiredLevel: 3,
    rewardXp: 120,
    rewardGold: 80,
    rewardItemId: 7,
    rewardItemName: '체력 물약',
  },
  {
    id: 3,
    title: '뼈 다귀 정리',
    giverNpcName: '경비병',
    targetMonsterId: 3,
    targetMonsterName: '스켈레톤',
    targetCount: 5,
    requiredLevel: 5,
    rewardXp: 180,
    rewardGold: 120,
    rewardItemId: null,
    rewardItemName: null,
  },
  {
    id: 4,
    title: '가시밭의 불청객',
    giverNpcName: '파수꾼',
    targetMonsterId: 4,
    targetMonsterName: '가시선인장',
    targetCount: 6,
    requiredLevel: 5,
    rewardXp: 200,
    rewardGold: 140,
    rewardItemId: 8,
    rewardItemName: '상급 체력 물약',
  },
  {
    id: 5,
    title: '오래된 소문',
    giverNpcName: '노인',
    targetMonsterId: 2,
    targetMonsterName: '고블린',
    targetCount: 6,
    requiredLevel: 8,
    rewardXp: 260,
    rewardGold: 180,
    rewardItemId: null,
    rewardItemName: null,
  },
];

export function findQuestByGiver(npcName: string): QuestDef | undefined {
  return QUEST_DEFS.find((q) => q.giverNpcName === npcName);
}

export function findQuestDef(questId: number): QuestDef | undefined {
  return QUEST_DEFS.find((q) => q.id === questId);
}

interface QuestState {
  ready: boolean;
  // Keyed by quest_template_id — only ever holds quests this character has accepted at
  // least once (never-accepted quests simply have no entry, same "missing = not yet"
  // convention combatStore's skillLevels uses).
  quests: Record<number, ActiveQuest>;
  /** Seeds from CharacterProfile.active_quests — called by Scene.tsx alongside combatStore's
   * own init(), once per character/map session start. */
  init: (activeQuests: ActiveQuest[]) => void;
  /** No-op (throws are caught internally) if the request fails — the dialogue panel reads
   * the thrown error itself via a separate try/catch at the call site for its own error UI;
   * this only updates local state on success. */
  accept: (questId: number) => Promise<void>;
  /** Best-effort, fire-and-forget from CharacterMesh's kill handling — a failed report is
   * simply lost progress for that one kill (next kill's report isn't a retry), matching this
   * project's established "best-effort sync, log and move on" pattern (see combatStore's
   * syncProgress). Never throws. */
  reportKill: (monsterTemplateId: number) => void;
  /** Throws on failure (insufficient progress, already claimed, etc.) — callers award the
   * XP/gold themselves via combatStore's grantQuestReward once this resolves. */
  claim: (questId: number) => Promise<charactersApi.ClaimQuestResponse>;
}

export const useQuestStore = create<QuestState>((set) => ({
  ready: false,
  quests: {},

  init: (activeQuests) => {
    const quests: Record<number, ActiveQuest> = {};
    for (const q of activeQuests) quests[q.quest_template_id] = q;
    set({ ready: true, quests });
  },

  accept: async (questId) => {
    const row = await charactersApi.acceptQuest(questId);
    set((s) => ({ quests: { ...s.quests, [questId]: row } }));
  },

  reportKill: (monsterTemplateId) => {
    charactersApi
      .reportQuestKill(monsterTemplateId)
      .then(({ updated }) => {
        if (updated.length === 0) return;
        set((s) => {
          const quests = { ...s.quests };
          for (const row of updated) quests[row.quest_template_id] = row;
          return { quests };
        });
      })
      .catch(() => {
        // Best-effort — see the reportKill doc comment above.
      });
  },

  claim: async (questId) => {
    const result = await charactersApi.claimQuest(questId);
    set((s) => {
      const existing = s.quests[questId];
      if (!existing) return s;
      return { quests: { ...s.quests, [questId]: { ...existing, status: 'completed' } } };
    });
    return result;
  },
}));
