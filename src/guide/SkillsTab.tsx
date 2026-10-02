import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { CLASS_LABEL, guideSkills, type GuideClassKey } from './guideSkills';

const CLASSES: GuideClassKey[] = ['warrior', 'archer', 'mage'];

export function SkillsTab() {
  const [cls, setCls] = useState<GuideClassKey>('warrior');
  const skills = guideSkills()[cls];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {CLASSES.map((c) => (
          <Button key={c} type="button" size="sm" variant={c === cls ? 'primary' : 'ghost'} aria-pressed={c === cls} onClick={() => setCls(c)}>
            {CLASS_LABEL[c]}
          </Button>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {skills.map((s) => (
          <li key={s.id} className="min-w-0 break-words rounded-panel border-[3px] border-edge bg-cream p-4 text-ink shadow-panel">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg">{s.name}</h3>
              <Badge tone="sky">Lv.{s.requiredLevel}</Badge>
              {s.awakening && <Badge tone="gold">각성기</Badge>}
            </div>
            <p className="text-sm text-ink-soft">
              MP {s.mpCost} · 쿨타임 {s.cooldownSec}초 · 배율 ×{s.multiplier}
            </p>
            <p className="mt-1 text-sm text-ink-soft">{s.kind === '광역' ? `광역 (반경 ${s.radius})` : '단일'}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
