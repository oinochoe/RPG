import { Badge } from '../components/ui/badge';
import { guideQuests, MAIN_QUEST_UNLOCK_TEXT } from './guideQuests';

const KIND_TONE = { 스토리: 'sky', 반복: 'mint', 메인: 'gold' } as const;

export function QuestsTab() {
  const groups = guideQuests();
  return (
    <section className="flex flex-col gap-6">
      <p className="rounded-control border-2 border-edge/40 bg-cream-deep/60 px-3 py-2 text-sm text-ink">{MAIN_QUEST_UNLOCK_TEXT}</p>
      {groups.map((g) => (
        <div key={g.village} className="flex flex-col gap-3">
          <h2 className="font-display text-xl text-ink">{g.village}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.quests.map((q) => (
              <li key={q.id} className="min-w-0 break-words rounded-panel border-[3px] border-edge bg-cream p-4 text-ink shadow-panel">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg">{q.title}</h3>
                  <Badge tone={KIND_TONE[q.kind]}>{q.kind}</Badge>
                  <Badge>Lv.{q.requiredLevel}</Badge>
                </div>
                <p className="text-sm text-ink-soft">의뢰인 {q.giver}</p>
                <p className="mt-1 text-sm">목표: {q.target}</p>
                <p className="mt-1 text-sm">보상: {q.reward}</p>
                <details className="mt-2 text-sm text-ink-soft">
                  <summary className="cursor-pointer font-bold text-ink">이야기</summary>
                  <p className="mt-1">{q.hook}</p>
                  <p className="mt-1">{q.completion}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
