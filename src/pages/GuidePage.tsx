import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { buttonVariants } from '../components/ui/button';
import { GuideTabs, resolveGuideTab } from '../guide/GuideTabs';
import { SkillsTab } from '../guide/SkillsTab';
import { QuestsTab } from '../guide/QuestsTab';
import { MonstersTab } from '../guide/MonstersTab';
import { HiddenTab } from '../guide/HiddenTab';

/** Public game guide (no login). Imports only src/guide adapters — nothing from the 3D game. */
export function GuidePage() {
  const tab = resolveGuideTab(useParams().tab);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

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
        </header>
        <GuideTabs active={tab} />
        <main className="min-w-0">
          {tab === 'skills' && <SkillsTab />}
          {tab === 'quests' && <QuestsTab />}
          {tab === 'monsters' && <MonstersTab />}
          {tab === 'hidden' && <HiddenTab />}
        </main>
      </div>
    </div>
  );
}
