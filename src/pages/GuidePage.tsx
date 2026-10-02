import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { buttonVariants } from '../components/ui/button';
import { GuideTabs, resolveGuideTab } from '../guide/GuideTabs';
import { SkillsTab } from '../guide/SkillsTab';
import { QuestsTab } from '../guide/QuestsTab';
import { MonstersTab } from '../guide/MonstersTab';
import { HiddenTab } from '../guide/HiddenTab';
import { CLASS_LABEL, type GuideClassKey } from '../guide/guideSkills';
import { useGuideProgress } from '../guide/useGuideProgress';

/** Public game guide (no login). Imports only src/guide adapters — nothing from the 3D game. */
export function GuidePage() {
  const tab = resolveGuideTab(useParams().tab);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const progress = useGuideProgress();

  useEffect(() => {
    const base = document.title;
    document.title = '공략집 — ' + base;
    return () => {
      document.title = base;
    };
  }, []);

  return (
    <div className="min-h-screen px-4 py-6 text-ink">
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl">공략집</h1>
          <Link to={isAuthenticated ? '/game' : '/login'} className={buttonVariants({ variant: 'sky', size: 'sm' })}>
            {isAuthenticated ? '게임으로' : '로그인'}
          </Link>
          {progress.status === 'ready' && progress.characters.length > 0 && (
            <label className="flex w-full flex-wrap items-center gap-2 text-sm font-bold text-ink sm:w-auto">
              보기 기준 캐릭터
              <select
                value={progress.selectedId ?? ''}
                onChange={(e) => progress.select(Number(e.target.value))}
                className="h-10 min-w-0 rounded-control border-[3px] border-edge/60 bg-cream-deep/60 px-2 text-base font-normal text-ink outline-none transition-colors focus:border-sky-deep focus:bg-white focus:ring-4 focus:ring-sky/70"
              >
                {progress.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({CLASS_LABEL[c.character_class as GuideClassKey] ?? c.character_class} Lv.{c.level})
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        <GuideTabs active={tab} />
        <main className="min-w-0">
          {tab === 'skills' && <SkillsTab />}
          {tab === 'quests' && <QuestsTab />}
          {tab === 'monsters' && <MonstersTab />}
          {tab === 'hidden' && <HiddenTab found={progress.found} />}
        </main>
      </div>
    </div>
  );
}
