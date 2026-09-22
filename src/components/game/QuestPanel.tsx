import { useState, type CSSProperties } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useQuestStore, findQuestByGiver } from '../../stores/questStore';
import { useUIStore } from '../../stores/uiStore';
import { useDraggablePanel } from './useDraggablePanel';

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
  const { position, onHeaderMouseDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 160),
  }));

  if (!isOpen || !npcName) return null;

  const quest = findQuestByGiver(npcName);
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
      grantQuestReward(result.reward_xp, result.reward_gold);
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
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        background: '#1a2a1c',
        border: '2px solid #e8c97a',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>{npcName}</span>
        <button
          onClick={closeQuest}
          style={{ background: 'transparent', border: 'none', color: '#9aa08f', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 2 }}
          title="닫기 (ESC)"
        >
          ✕
        </button>
      </div>

      {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {!quest ? (
        <p style={{ color: '#9aa08f', fontSize: 13 }}>지금은 특별히 부탁할 일이 없네.</p>
      ) : !state ? (
        <>
          <p style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{quest.title}</p>
          <p style={{ color: '#9aa08f', fontSize: 12, marginBottom: 4 }}>
            {quest.targetMonsterName} {quest.targetCount}마리를 처치해다오.
          </p>
          <p style={{ color: '#ffd54a', fontSize: 12, marginBottom: 12 }}>{rewardLine}</p>
          {levelLocked ? (
            <p style={{ color: '#e0538a', fontSize: 12 }}>Lv.{quest.requiredLevel} 필요</p>
          ) : (
            <button onClick={handleAccept} disabled={pending} style={acceptButtonStyle(pending)}>
              수락하기
            </button>
          )}
        </>
      ) : state.status === 'completed' ? (
        <p style={{ color: '#9aa08f', fontSize: 13 }}>이미 완료한 부탁이야. 고맙네.</p>
      ) : ready ? (
        <>
          <p style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{quest.title}</p>
          <p style={{ color: '#7be08a', fontSize: 12, marginBottom: 8 }}>목표를 달성했다!</p>
          <p style={{ color: '#ffd54a', fontSize: 12, marginBottom: 12 }}>{rewardLine}</p>
          <button onClick={handleClaim} disabled={pending} style={acceptButtonStyle(pending)}>
            보상 받기
          </button>
        </>
      ) : (
        <>
          <p style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{quest.title}</p>
          <p style={{ color: '#9aa08f', fontSize: 12 }}>
            {quest.targetMonsterName} {state.progress_count} / {quest.targetCount} 처치 중
          </p>
        </>
      )}
    </div>
  );
}

function acceptButtonStyle(pending: boolean): CSSProperties {
  return {
    width: '100%',
    padding: '8px 0',
    borderRadius: 6,
    border: '1px solid #e8c97a',
    background: pending ? 'rgba(255,255,255,0.05)' : 'rgba(232, 201, 122, 0.2)',
    color: pending ? '#6a6a5f' : '#e8c97a',
    fontSize: 13,
    fontWeight: 700,
    cursor: pending ? 'default' : 'pointer',
  };
}
