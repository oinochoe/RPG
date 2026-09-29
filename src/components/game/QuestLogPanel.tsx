import type { ReactNode } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useQuestStore, QUEST_DEFS, mainQuestUnlocked, type QuestDef } from '../../stores/questStore';
import { useUIStore } from '../../stores/uiStore';
import { useDraggablePanel } from './useDraggablePanel';
import { Bar } from '../ui/bar';
import { GamePanel } from '../ui/game-panel';
import type { ActiveQuest } from '../../types/api';

const PANEL_WIDTH = 340;

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  return <Bar ratio={ratio} color={color} height={14} />;
}

function QuestRow({ quest, state, playerLevel }: { quest: QuestDef; state: ActiveQuest | undefined; playerLevel: number }) {
  const ready = !!state && state.status === 'in_progress' && state.progress_count >= quest.targetCount;
  const statusLabel = !state
    ? playerLevel < quest.requiredLevel
      ? `Lv.${quest.requiredLevel} 필요`
      : `${quest.villageName} · ${quest.giverNpcName}에게 이동해 수락`
    : state.status === 'completed'
      ? '완료'
      : ready
        ? '목표 달성 — 보상 수령 대기'
        : `${state.progress_count} / ${quest.targetCount}`;

  return (
    <div style={{ padding: '8px 4px', borderBottom: '2px solid rgb(139 106 70 / 0.15)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ color: 'var(--color-ink)', fontSize: 13, fontWeight: 700 }}>{quest.title}</span>
        <span style={{ color: 'var(--color-ink-soft)', fontSize: 11 }}>
          {quest.villageName} · {quest.giverNpcName}
        </span>
      </div>
      <div style={{ color: 'var(--color-ink-soft)', fontSize: 11, marginBottom: 4 }}>
        {quest.targetMonsterName} {quest.targetCount}마리 처치
      </div>
      {state && state.status !== 'completed' && (
        <div style={{ marginBottom: 4 }}>
          <ProgressBar ratio={state.progress_count / quest.targetCount} color={ready ? 'var(--color-mint-deep)' : 'var(--color-gold)'} />
        </div>
      )}
      <div
        style={{
          color: state?.status === 'completed' ? 'var(--color-ink-soft)' : ready ? 'var(--color-mint-ink)' : 'var(--color-gold-ink)',
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
      <div style={{ color: 'var(--color-gold-ink)', fontSize: 12, fontWeight: 700, marginBottom: 4, letterSpacing: 0.3 }}>{title}</div>
      {children}
    </div>
  );
}

/** The Q-key quest log — a read-only tracker across every quest (see questStore's
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
  const { frameStyle, onHeaderPointerDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 220),
  }), PANEL_WIDTH);

  if (!isOpen) return null;

  const available: QuestDef[] = [];
  const inProgress: QuestDef[] = [];
  const completed: QuestDef[] = [];
  for (const quest of QUEST_DEFS) {
    const state = quests[quest.id];
    if (!state) {
      // A repeatable follow-up isn't actually offered by its NPC until their story quest is
      // done (see questStore's findQuestByGiver) — skip listing it as "available" before
      // that, so the log doesn't imply it can be picked up already.
      if (quest.repeatable) {
        const story = QUEST_DEFS.find((q) => q.giverNpcName === quest.giverNpcName && !q.repeatable && !q.isMainQuest);
        if (story && quests[story.id]?.status !== 'completed') continue;
      }
      // Same idea for the main quest — it isn't actually offered until every one of the 5
      // NPC stories is done (see questStore's mainQuestUnlocked/findQuestByGiver).
      if (quest.isMainQuest && !mainQuestUnlocked(quests)) continue;
      available.push(quest);
    } else if (state.status === 'completed') completed.push(quest);
    else inProgress.push(quest);
  }

  return (
    <GamePanel
      title="퀘스트 (Q)"
      onClose={closeQuestLog}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
      style={{ maxHeight: '70vh' }}
    >
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
    </GamePanel>
  );
}
