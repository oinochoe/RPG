import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export type GuideTabKey = 'hidden' | 'quests' | 'monsters' | 'skills';

export const GUIDE_TABS: { key: GuideTabKey; label: string }[] = [
  { key: 'hidden', label: '히든·발견물' },
  { key: 'quests', label: '퀘스트' },
  { key: 'monsters', label: '몬스터·드롭' },
  { key: 'skills', label: '스킬' },
];

export function resolveGuideTab(raw: string | undefined): GuideTabKey {
  return GUIDE_TABS.find((t) => t.key === raw)?.key ?? 'hidden';
}

/** The tab bar; the selected tab lives in the URL (/guide/:tab). Wraps instead of scrolling sideways on phones. */
export function GuideTabs({ active }: { active: GuideTabKey }) {
  const navigate = useNavigate();
  return (
    <div role="tablist" aria-label="공략집 분류" className="flex flex-wrap gap-2">
      {GUIDE_TABS.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => navigate('/guide/' + t.key)}
            className={cn(
              'min-h-10 cursor-pointer rounded-control border-[3px] border-edge px-3 font-display text-sm tracking-wide text-ink shadow-chunk',
              selected ? 'bg-gradient-to-b from-gold-light to-gold' : 'bg-cream/80 hover:bg-cream',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
