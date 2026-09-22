import type { ReactNode } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useQuestStore, QUEST_DEFS, type QuestDef } from '../../stores/questStore';
import { useUIStore } from '../../stores/uiStore';
import { useDraggablePanel } from './useDraggablePanel';
import type { ActiveQuest } from '../../types/api';

const PANEL_WIDTH = 340;

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div
      style={{
        width: '100%',
        height: 8,
        borderRadius: 4,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(232, 201, 122, 0.25)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${clamped * 100}%`, height: '100%', background: color, transition: 'width 200ms ease-out' }} />
    </div>
  );
}

function QuestRow({ quest, state, playerLevel }: { quest: QuestDef; state: ActiveQuest | undefined; playerLevel: number }) {
  const ready = !!state && state.status === 'in_progress' && state.progress_count >= quest.targetCount;
  const statusLabel = !state
    ? playerLevel < quest.requiredLevel
      ? `Lv.${quest.requiredLevel} 필요`
      : `${quest.giverNpcName}에게 이동해 수락`
    : state.status === 'completed'
      ? '완료'
      : ready
        ? '목표 달성 — 보상 수령 대기'
        : `${state.progress_count} / ${quest.targetCount}`;

  return (
    <div style={{ padding: '8px 4px', borderBottom: '1px solid rgba(232, 201, 122, 0.15)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ color: '#f4f1e8', fontSize: 13, fontWeight: 700 }}>{quest.title}</span>
        <span style={{ color: '#9aa08f', fontSize: 11 }}>{quest.giverNpcName}</span>
      </div>
      <div style={{ color: '#9aa08f', fontSize: 11, marginBottom: 4 }}>
        {quest.targetMonsterName} {quest.targetCount}마리 처치
      </div>
      {state && state.status !== 'completed' && (
        <div style={{ marginBottom: 4 }}>
          <ProgressBar ratio={state.progress_count / quest.targetCount} color={ready ? '#7be08a' : '#e8c97a'} />
        </div>
      )}
      <div
        style={{
          color: state?.status === 'completed' ? '#9aa08f' : ready ? '#7be08a' : '#ffd54a',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {statusLabel}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#e8c97a', fontSize: 12, fontWeight: 700, marginBottom: 4, letterSpacing: 0.3 }}>{title}</div>
      {children}
    </div>
  );
}

/** The Q-key quest log — a read-only tracker across all 5 quests (see questStore's
 * QUEST_DEFS), grouped into available/in-progress/completed with a progress bar for each
 * in-progress one. Deliberately has no accept/claim buttons of its own (see QuestPanel.tsx
 * for that) — these are personal, one-on-one NPC conversations by design (see the quest
 * storyline rewrite), so accepting still means walking up and talking, not clicking a list.
 */
export function QuestLogPanel() {
  const isOpen = useUIStore((s) => s.isQuestLogOpen);
  const closeQuestLog = useUIStore((s) => s.closeQuestLog);
  const playerLevel = useCombatStore((s) => s.player.level);
  const quests = useQuestStore((s) => s.quests);
  const { position, onHeaderMouseDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 220),
  }));

  if (!isOpen) return null;

  const available: QuestDef[] = [];
  const inProgress: QuestDef[] = [];
  const completed: QuestDef[] = [];
  for (const quest of QUEST_DEFS) {
    const state = quests[quest.id];
    if (!state) available.push(quest);
    else if (state.status === 'completed') completed.push(quest);
    else inProgress.push(quest);
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
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
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>퀘스트 (Q)</span>
        <button
          onClick={closeQuestLog}
          style={{ background: 'transparent', border: 'none', color: '#9aa08f', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 2 }}
          title="닫기 (ESC)"
        >
          ✕
        </button>
      </div>

      <div className="custom-scroll" style={{ overflowY: 'auto', flex: 1 }}>
        {inProgress.length > 0 && (
          <Section title={`진행 중 (${inProgress.length})`}>
            {inProgress.map((q) => (
              <QuestRow key={q.id} quest={q} state={quests[q.id]} playerLevel={playerLevel} />
            ))}
          </Section>
        )}

        {available.length > 0 && (
          <Section title={`수락 가능 (${available.length})`}>
            {available.map((q) => (
              <QuestRow key={q.id} quest={q} state={quests[q.id]} playerLevel={playerLevel} />
            ))}
          </Section>
        )}

        {completed.length > 0 && (
          <Section title={`완료 (${completed.length})`}>
            {completed.map((q) => (
              <QuestRow key={q.id} quest={q} state={quests[q.id]} playerLevel={playerLevel} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
