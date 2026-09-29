import { ReactNode, useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './icon-button';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Buttons row along the bottom. */
  footer?: ReactNode;
  /** Escape and a click on the dimmed backdrop close it (default true). */
  dismissible?: boolean;
  className?: string;
  /** Classes for the dimmed full-screen layer, e.g. a higher z-index. */
  overlayClassName?: string;
}

// A dialog centered over a dimmed backdrop — the tutorial, confirmations.
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  className,
  overlayClassName,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open || !dismissible || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[300] flex items-center justify-center bg-night/50 p-4 backdrop-blur-[2px]',
        overlayClassName,
      )}
      onPointerDown={(e) => {
        if (dismissible && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-pop-in flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-panel border-[3px] border-edge bg-cream text-ink shadow-panel',
          className,
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-edge bg-gradient-to-b from-sky to-sky-deep px-4 py-2">
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-display text-xl tracking-wide">
            {title}
          </h2>
          {dismissible && onClose && (
            <IconButton label="닫기" size="sm" onClick={onClose}>
              <X className="size-5" strokeWidth={3} />
            </IconButton>
          )}
        </header>
        <div className="custom-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t-[3px] border-edge/40 bg-cream-deep/50 p-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
