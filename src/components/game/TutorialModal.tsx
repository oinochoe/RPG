import { useEffect, useState } from 'react';
import { useIsTouch } from '../../lib/device';
import { tutorialPages, useTutorialStore } from '../../lib/tutorial';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

/**
 * How-to-play guide: opens automatically the first time someone enters the game, and again
 * from the menu's 도움말 button. A few short pages instead of one wall of text; skipping
 * counts the same as finishing (it won't nag again).
 */
export function TutorialModal() {
  const isOpen = useTutorialStore((s) => s.isOpen);
  const close = useTutorialStore((s) => s.close);
  const openIfFirstTime = useTutorialStore((s) => s.openIfFirstTime);
  const isTouch = useIsTouch();
  const [page, setPage] = useState(0);

  useEffect(() => {
    openIfFirstTime();
  }, [openIfFirstTime]);

  // Escape closes just the guide (capture phase + stop, so GamePage's own Escape handler
  // doesn't also open the system menu underneath it).
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const pages = tutorialPages(isTouch);
  const index = Math.min(page, pages.length - 1);
  const current = pages[index];
  const isLast = index === pages.length - 1;

  function finish() {
    close();
    setPage(0);
  }

  return (
    <Modal
      open
      // Above every panel and the drei nametags (see WorldMap.tsx's note on their z-index). Escape and
      // dismissal are handled above, so the modal's own are switched off.
      overlayClassName="z-[2147483647]"
      dismissible={false}
      title={
        <span className="flex items-baseline justify-between gap-2">
          <span>{current.title}</span>
          <span className="font-body text-sm font-bold text-ink-soft">
            {index + 1} / {pages.length}
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={finish}>
            {isLast ? '닫기' : '건너뛰기'}
          </Button>
          {index > 0 && (
            <Button variant="sky" className="flex-1" onClick={() => setPage(index - 1)}>
              이전
            </Button>
          )}
          <Button className="flex-[1.4]" onClick={() => (isLast ? finish() : setPage(index + 1))}>
            {isLast ? '시작하기' : '다음'}
          </Button>
        </>
      }
    >
      <div>
        {current.lines.map(([label, how]) => (
          <div key={label} className="flex gap-3 border-b-2 border-edge/15 py-2 text-sm leading-relaxed last:border-b-0">
            <span className="w-[84px] shrink-0 font-bold text-gold-ink">{label}</span>
            <span className="text-ink">{how}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
        {pages.map((p, i) => (
          <span
            key={p.title}
            className={cn('size-2.5 rounded-full border-2 border-edge', i === index ? 'bg-gold' : 'bg-cream-deep')}
          />
        ))}
      </div>
    </Modal>
  );
}
