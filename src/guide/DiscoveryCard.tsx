import { useId } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import type { GuideDiscovery, RevealStage } from './guideDiscoveries';

export interface DiscoveryCardProps {
  item: GuideDiscovery;
  stage: RevealStage;
  canRevealWhere: boolean;
  /** Name of the chained predecessor (only shown once the answer is revealed). */
  prevName?: string | null;
  onAdvance: () => void;
}

const NEXT_LABEL: Record<number, string> = { 0: '힌트 보기', 1: '위치 보기', 2: '정답 보기' };

/** One discovery. Anything not yet revealed is not rendered at all (never hidden with CSS). */
export function DiscoveryCard({ item, stage, canRevealWhere, prevName, onAdvance }: DiscoveryCardProps) {
  const lockId = useId();
  const locked = stage === 1 && !canRevealWhere;
  const nameVisible = !item.hidden || stage >= 3;
  return (
    <li data-guide-card className="min-w-0 break-words rounded-panel border-[3px] border-edge bg-cream p-4 text-ink shadow-panel">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg">{nameVisible ? item.name : '???'}</h3>
        {item.hidden && <Badge tone="gold">히든</Badge>}
      </div>
      {stage >= 1 && item.hint && <p className="text-sm text-ink-soft">{item.hint}</p>}
      {stage >= 2 && item.where && <p className="mt-1 text-sm">{item.where}</p>}
      {stage >= 3 && (
        <div className="mt-1 flex flex-col gap-1 text-sm">
          <p className="text-ink-soft">{item.coords}</p>
          {prevName && <p>앞 단계: {prevName}</p>}
          {item.conditions.length > 0 && (
            <ul className="list-disc pl-5">
              {item.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {item.reward && <p>보상: {item.reward}</p>}
        </div>
      )}
      {stage < 3 && (
        <div className="mt-3 flex flex-col gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={locked} aria-describedby={locked ? lockId : undefined} onClick={onAdvance}>
            {NEXT_LABEL[stage]}
          </Button>
          {locked && <p id={lockId} className="text-xs text-ink-soft">앞 단계 정답을 먼저 확인하세요</p>}
        </div>
      )}
    </li>
  );
}
