import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTooltip } from './Tooltip';

let touch = false;
vi.mock('../../lib/device', () => ({ useIsTouch: () => touch }));

function Target({ label }: { label: string | null }) {
  const { handlers, tooltip } = useTooltip(label);
  return (
    <div data-testid="scroller" style={{ overflow: 'auto' }}>
      <button {...handlers}>대상{tooltip}</button>
    </div>
  );
}

describe('useTooltip', () => {
  beforeEach(() => {
    touch = false;
    vi.useFakeTimers();
  });

  it('shows the label shortly after hovering and hides it on leave', () => {
    render(<Target label="강철 검" />);
    const button = screen.getByRole('button', { name: '대상' });
    fireEvent.mouseEnter(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(150));
    expect(screen.getByRole('tooltip')).toHaveTextContent('강철 검');
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('draws the bubble outside a scrolling ancestor, so it cannot widen the scroll area', () => {
    render(<Target label="강철 검" />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '대상' }));
    act(() => void vi.advanceTimersByTime(150));
    const bubble = screen.getByRole('tooltip');
    expect(screen.getByTestId('scroller')).not.toContainElement(bubble);
    expect(bubble.parentElement).toBe(document.body);
  });

  it('never shows on a touch device, where there is no hover', () => {
    touch = true;
    render(<Target label="강철 검" />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '대상' }));
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows nothing for an empty label', () => {
    render(<Target label={null} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '대상' }));
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
