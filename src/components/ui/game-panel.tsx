import { CSSProperties, HTMLAttributes, ReactNode, PointerEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './icon-button';

export interface GamePanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  onClose?: () => void;
  /** From useDraggablePanel: the header is the drag handle. Omit for a fixed panel. */
  onHeaderPointerDown?: (e: PointerEvent) => void;
  /** From useDraggablePanel: position/size (a floating window, or a full-width sheet on a phone). */
  frameStyle?: CSSProperties;
  /** Small icon/emblem shown before the title. */
  icon?: ReactNode;
  /** Extra controls placed between the title and the close button. */
  headerActions?: ReactNode;
  bodyClassName?: string;
}

// The frame every in-game window shares: a sky-blue title bar (also the drag handle), a thick warm
// outline and a cream body that scrolls when the content is taller than the window.
export function GamePanel({
  title,
  onClose,
  onHeaderPointerDown,
  frameStyle,
  icon,
  headerActions,
  className,
  bodyClassName,
  style,
  children,
  ...props
}: GamePanelProps) {
  return (
    <section
      className={cn(
        'animate-pop-in fixed z-[100] flex flex-col overflow-hidden rounded-panel border-[3px] border-edge bg-cream text-ink shadow-panel',
        className,
      )}
      style={{ ...frameStyle, ...style }}
      {...props}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          'flex shrink-0 touch-none items-center gap-2 border-b-[3px] border-edge bg-gradient-to-b from-sky to-sky-deep px-3 py-1.5',
          onHeaderPointerDown && 'cursor-grab active:cursor-grabbing',
        )}
      >
        {icon}
        <h2 className="min-w-0 flex-1 truncate font-display text-lg tracking-wide text-ink">{title}</h2>
        {headerActions}
        {onClose && (
          <IconButton label="닫기" size="sm" onClick={onClose}>
            <X className="size-5" strokeWidth={3} />
          </IconButton>
        )}
      </header>
      <div className={cn('custom-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3', bodyClassName)}>{children}</div>
    </section>
  );
}
