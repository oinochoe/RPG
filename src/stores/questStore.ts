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
  // The NPC's own words — shown before accepting (the "why", not just "kill N of X") and
  // after claiming (what it meant to them). Neither round-trips to the server; quest_templates
  // only has a bare `title` column, so this narrative layer is UI-only, same as SKILLS_BY_CLASS's
  // fxColor never touching skill_templates.
  hookText: string;
  completionText: string;
}

export const QUEST_DEFS: QuestDef[] = [
  {
    id: 1,
    title: '여울의 작은 꽃',
    giverNpcName: '촌장',
    targetMonsterId: 1,
    targetMonsterName: '슬라임',
    targetCount: 5,
    requiredLevel: 1,
    rewardXp: 60,
    rewardGold: 40,
    rewardItemId: null,
    rewardItemName: null,
    hookText:
      '매일 새벽 강가에 꽃을 놓고 오네... 작년 봄에 물살에 아이를 잃었어. 그 아이가 제일 좋아하던 자리인데, 요즘 슬라임들이 꽃을 죄다 먹어치워서. 그 자리만이라도 지켜주겠나.',
    completionText: '고맙네... 오늘도 그 아이 자리에 꽃을 놓을 수 있겠어.',
  },
  {
    id: 2,
    title: '무너지는 밭',
    giverNpcName: '농부',
    targetMonsterId: 1,
    targetMonsterName: '슬라임',
    targetCount: 8,
    requiredLevel: 3,
    rewardXp: 120,
    rewardGold: 80,
    rewardItemId: 7,
    rewardItemName: '체력 물약',
    hookText: '아내가 몸져누운 지 두 달째야. 올해 수확을 놓치면 겨울을 못 넘길지도 몰라. 슬라임들이 밭을 다 헤집어놨어. 부탁이네.',
    completionText: '이걸로 아내한테 죽 한 그릇은 더 끓여줄 수 있겠어. 고맙네, 정말로.',
  },
  {
    id: 3,
    title: '옛 전우들',
    giverNpcName: '경비병',
    targetMonsterId: 3,
    targetMonsterName: '스켈레톤',
    targetCount: 5,
    requiredLevel: 5,
    rewardXp: 180,
    rewardGold: 120,
    rewardItemId: null,
    rewardItemName: null,
    hookText:
      '저 해골들... 다 낯이 익어. 10년 전 마을을 지키다 죽은 내 동료들이야. 이 꼴로 떠도는 걸 볼 때마다 차마 못 보겠어. 부디 편히 쉴 수 있게 해주게.',
    completionText: '고맙네. 이제야 그 친구들을 제대로 보내줄 수 있겠어.',
  },
  {
    id: 4,
    title: '꺼지지 않는 등불',
    giverNpcName: '파수꾼',
    targetMonsterId: 4,
    targetMonsterName: '가시선인장',
    targetCount: 6,
    requiredLevel: 5,
    rewardXp: 200,
    rewardGold: 140,
    rewardItemId: 8,
    rewardItemName: '상급 체력 물약',
    hookText: '저 등불, 3년째 매일 밤 켜두고 있어. 사막 너머로 떠난 그 사람이 아직 돌아오지 않았거든. 가시선인장들 때문에 그 길이 너무 위험해져서.',
    completionText: '이제 그 길이 좀 안전해졌겠지. 오늘 밤도 등불을 켜둘게. 언젠가는... 언젠가는 돌아오겠지.',
  },
  {
    id: 5,
    title: '돌아오지 않은 아들',
    giverNpcName: '노인',
    targetMonsterId: 2,
    targetMonsterName: '고블린',
    targetCount: 6,
    requiredLevel: 8,
    rewardXp: 260,
    rewardGold: 180,
    rewardItemId: null,
    rewardItemName: null,
    hookText:
      '내 아들이... 저 던전으로 들어간 지 벌써 20년이 다 돼가. 고블린들을 쫓다가 그리 됐다고 들었어. 이제 와서 무슨 소용이겠냐마는, 그놈들이 더는 누구의 자식도 데려가지 않았으면 하네.',
    completionText: '고맙네... 자네를 보니 꼭 그 아이 같아서. 부디 몸조심하게, 저 아래는 위험한 곳이야.',
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
