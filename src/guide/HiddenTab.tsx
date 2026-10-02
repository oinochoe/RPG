import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { DiscoveryCard } from './DiscoveryCard';
import { buildGuideDiscoveries, canRevealWhere, groupByZone, initialStage, type RevealStage } from './guideDiscoveries';

export function HiddenTab() {
  const all = useMemo(() => buildGuideDiscoveries(), []);
  const groups = useMemo(() => groupByZone(all), [all]);
  const nameById = useMemo(() => new Map(all.map((d) => [d.id, d.name])), [all]);
  const [stages, setStages] = useState<Record<string, RevealStage>>(() => Object.fromEntries(all.map((d) => [d.id, initialStage(d)])));
  const [zone, setZone] = useState<string | null>(null);

  const advance = (id: string) => setStages((s) => ({ ...s, [id]: Math.min(3, (s[id] ?? 0) + 1) as RevealStage }));

  return (
    <section className="flex flex-col gap-4">
      <p className="rounded-control border-2 border-edge/40 bg-cream-deep/60 px-3 py-2 text-sm text-ink">스포일러 주의 — 단계별로 눌러서 확인하세요.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={zone === null ? 'primary' : 'ghost'} aria-pressed={zone === null} onClick={() => setZone(null)}>
          전체
        </Button>
        {groups.map((g) => (
          <Button key={g.zone} type="button" size="sm" variant={zone === g.zone ? 'primary' : 'ghost'} aria-pressed={zone === g.zone} onClick={() => setZone(g.zone)}>
            {g.label}
          </Button>
        ))}
      </div>
      {groups
        .filter((g) => zone === null || g.zone === zone)
        .map((g) => (
          <div key={g.zone} className="flex flex-col gap-3">
            <h2 className="font-display text-xl text-ink">{g.label}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {g.items.map((item) => (
                <DiscoveryCard
                  key={item.id}
                  item={item}
                  stage={stages[item.id] ?? initialStage(item)}
                  canRevealWhere={canRevealWhere(item, stages, all)}
                  prevName={item.chainPrev ? (nameById.get(item.chainPrev) ?? null) : null}
                  onAdvance={() => advance(item.id)}
                />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
