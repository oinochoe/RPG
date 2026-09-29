import { useEffect, useState } from 'react';
import { useIsTouch } from '../../lib/device';
import { tutorialPages, useTutorialStore } from '../../lib/tutorial';

const GOLD = '#e8c97a';

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="게임 방법"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        boxSizing: 'border-box',
        // Above every panel and the drei nametags (see WorldMap.tsx's note on their z-index).
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '100%',
          overflowY: 'auto',
          boxSizing: 'border-box',
          background: '#1a2a1c',
          border: `2px solid ${GOLD}`,
          borderRadius: 12,
          padding: 18,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 17 }}>{current.title}</span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>
            {index + 1} / {pages.length}
          </span>
        </div>

        <div>
          {current.lines.map(([label, how]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                gap: 12,
                padding: '8px 2px',
                borderBottom: '1px solid rgba(232, 201, 122, 0.12)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: GOLD, fontWeight: 700, flex: '0 0 84px' }}>{label}</span>
              <span style={{ color: '#cfe8d0' }}>{how}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '14px 0 10px' }}>
          {pages.map((p, i) => (
            <span
              key={p.title}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: i === index ? GOLD : 'rgba(232, 201, 122, 0.25)',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={finish} style={{ ...buttonStyle, flex: 1, color: '#9aa08f', borderColor: 'rgba(154,160,143,0.4)' }}>
            {isLast ? '닫기' : '건너뛰기'}
          </button>
          {index > 0 && (
            <button onClick={() => setPage(index - 1)} style={{ ...buttonStyle, flex: 1 }}>
              이전
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setPage(index + 1))}
            style={{ ...buttonStyle, flex: 1.4, background: 'rgba(232, 201, 122, 0.25)', fontWeight: 700 }}
          >
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: '10px 0',
  borderRadius: 8,
  border: `1px solid ${GOLD}`,
  background: 'rgba(255,255,255,0.05)',
  color: GOLD,
  fontSize: 13,
  cursor: 'pointer',
  touchAction: 'manipulation',
} as const;
