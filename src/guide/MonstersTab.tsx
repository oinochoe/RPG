import { useMemo, useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import type { DropChance } from '../../supabase/functions/api/drops';
import { guideBosses, guideMonsters } from './guideMonsters';

// Enchant-scroll item template ids (weapon 50, armor 86, blessed 47, cursed 48); must match
// SCROLL_ITEMS in supabase/functions/api/drops.ts.
const SCROLL_IDS = new Set([50, 86, 47, 48]);
const isScroll = (d: DropChance) => d.itemName.endsWith('강화 주문서') || SCROLL_IDS.has(d.itemTemplateId);

function DropList({ drops }: { drops: DropChance[] }) {
  const sorted = [...drops].sort((a, b) => b.chance - a.chance);
  if (sorted.length === 0) return <p className="mt-2 text-sm text-ink-soft">드롭 없음</p>;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-sm">
      {sorted.map((d) => (
        <li key={d.itemTemplateId} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1 break-words">
            {d.itemName}
            {isScroll(d) && <Badge tone="mint">강화 주문서</Badge>}
          </span>
          <span className="text-ink-soft">{(d.chance * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function MonstersTab() {
  const { monsters, zones } = useMemo(() => {
    const monsters = guideMonsters();
    return { monsters, zones: [...new Set(monsters.flatMap((m) => m.zones))] };
  }, []);
  const bosses = useMemo(() => guideBosses(), []);
  const [zone, setZone] = useState<string | null>(null);
  const shown = monsters.filter((m) => zone === null || m.zones.includes(zone));

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={zone === null ? 'primary' : 'ghost'} aria-pressed={zone === null} onClick={() => setZone(null)}>
          전체
        </Button>
        {zones.map((z) => (
          <Button key={z} type="button" size="sm" variant={zone === z ? 'primary' : 'ghost'} aria-pressed={zone === z} onClick={() => setZone(z)}>
            {z}
          </Button>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((m) => (
          <li key={m.templateId} data-guide-card className="min-w-0 break-words rounded-panel border-[3px] border-edge bg-cream p-4 text-ink shadow-panel">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg">{m.name}</h3>
              {m.maxLevel !== null && <Badge tone="sky">최대 Lv.{m.maxLevel}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-soft">{m.zones.join(' · ')}</p>
            <DropList drops={m.drops} />
          </li>
        ))}
      </ul>
      <h2 className="font-display text-xl text-ink">보스</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {bosses.map((b) => (
          <li key={b.key} data-guide-card className="min-w-0 break-words rounded-panel border-[3px] border-edge bg-cream p-4 text-ink shadow-panel">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg">{b.name}</h3>
              <Badge tone="danger">Lv.{b.level}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-soft">처치하면 반드시 드롭</p>
            <DropList drops={b.drops} />
          </li>
        ))}
      </ul>
    </section>
  );
}
