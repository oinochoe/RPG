import { useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useQuestStore, findQuestByGiver, NPC_FLAVOR_TEXT } from '../../stores/questStore';
import { useUIStore } from '../../stores/uiStore';
import { useDraggablePanel } from './useDraggablePanel';
import { Button } from '../ui/button';
import { GamePanel } from '../ui/game-panel';

const PANEL_WIDTH = 320;

/**
 * The quest-giving flavor NPCs' dialogue — opened by Space near one (see QuestProximity.tsx
 * + CharacterMesh's Space handler), same draggable-fixed-panel shape as ShopPanel. One quest
 * per NPC for now (see questStore's QUEST_DEFS), so this never needs a list/selection step —
 * just whichever single state that NPC's one quest is currently in.
 */
export function QuestPanel() {
  const isOpen = useUIStore((s) => s.isQuestOpen);
  const npcName = useUIStore((s) => s.questNpcName);
  const closeQuest = useUIStore((s) => s.closeQuest);
  const playerLevel = useCombatStore((s) => s.player.level);
  const grantQuestReward = useCombatStore((s) => s.grantQuestReward);
  const receiveInventory = useCharacterStore((s) => s.receiveInventory);
  const quests = useQuestStore((s) => s.quests);
  const accept = useQuestStore((s) => s.accept);
  const claim = useQuestStore((s) => s.claim);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { frameStyle, onHeaderPointerDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 160),
  }), PANEL_WIDTH);

  if (!isOpen || !npcName) return null;

  const quest = findQuestByGiver(npcName, quests);
  const state = quest ? quests[quest.id] : undefined;
  const levelLocked = quest ? playerLevel < quest.requiredLevel : false;
  const ready = !!state && state.status === 'in_progress' && quest !== undefined && state.progress_count >= quest.targetCount;

  async function handleAccept() {
    if (!quest) return;
    setError(null);
    setPending(true);
    try {
      await accept(quest.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '퀘스트 수락 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  async function handleClaim() {
    if (!quest) return;
    setError(null);
    setPending(true);
    try {
      const result = await claim(quest.id);
      // Local prediction first (level-up feedback), then the server's own numbers — it applied
      // the reward itself when it marked the quest claimed.
      grantQuestReward(result.reward_xp, result.reward_gold);
      useCombatStore.getState().adoptProgress(result.progress);
      receiveInventory(result.inventory);
    } catch (err) {
      setError(err instanceof Error ? err.message : '보상 수령 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  const rewardLine = quest
    ? `보상: 경험치 ${quest.rewardXp} · 골드 ${quest.rewardGold}${quest.rewardItemName ? ` · ${quest.rewardItemName}` : ''}`
    : '';

  return (
    <GamePanel
      title={npcName}
      onClose={closeQuest}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
    >
      {error && <p className="mb-2 text-sm text-danger-ink">{error}</p>}

      {!quest ? (
        <p className="text-sm italic text-ink-soft">
          "{NPC_FLAVOR_TEXT[npcName] ?? '지금은 특별히 부탁할 일이 없네.'}"
        </p>
      ) : !state ? (
        <>
          <p className="mb-2 font-display text-lg text-ink">{quest.title}</p>
          <p className="mb-2.5 text-sm italic leading-relaxed text-ink-soft">"{quest.hookText}"</p>
          <p className="mb-1 text-xs text-ink-soft">
            {quest.targetMonsterName} {quest.targetCount}마리 처치
          </p>
          <p className="mb-3 text-sm font-bold text-gold-ink">{rewardLine}</p>
          {levelLocked ? (
            <p className="text-sm font-bold text-danger-ink">Lv.{quest.requiredLevel} 필요</p>
          ) : (
            <Button onClick={handleAccept} disabled={pending} className="w-full">
              수락하기
            </Button>
          )}
        </>
      ) : state.status === 'completed' ? (
        <>
          <p className="mb-2 font-display text-lg text-ink">{quest.title}</p>
          <p className={`text-sm italic leading-relaxed text-ink-soft ${quest.repeatable ? 'mb-2.5' : ''}`}>
            "{quest.completionText}"
          </p>
          {quest.repeatable && (
            <Button onClick={handleAccept} disabled={pending} className="w-full">
              다시 부탁받기
            </Button>
          )}
        </>
      ) : ready ? (
        <>
          <p className="mb-2 font-display text-lg text-ink">{quest.title}</p>
          <p className="mb-2 text-sm font-bold text-mint-ink">목표를 달성했다!</p>
          <p className="mb-3 text-sm font-bold text-gold-ink">{rewardLine}</p>
          <Button variant="mint" onClick={handleClaim} disabled={pending} className="w-full">
            보상 받기
          </Button>
        </>
      ) : (
        <>
          <p className="mb-2 font-display text-lg text-ink">{quest.title}</p>
          <p className="mb-2.5 text-sm italic leading-relaxed text-ink-soft">"{quest.hookText}"</p>
          <p className="text-sm text-ink-soft">
            {quest.targetMonsterName} {state.progress_count} / {quest.targetCount} 처치 중
          </p>
        </>
      )}
    </GamePanel>
  );
}
