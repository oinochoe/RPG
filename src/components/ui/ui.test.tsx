import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './button';
import { IconButton } from './icon-button';
import { Bar } from './bar';
import { Slot } from './slot';
import { Badge } from './badge';
import { Modal } from './modal';
import { GamePanel } from './game-panel';
import { TooltipCard } from './tooltip-card';
import { THEME } from '../../lib/theme';

describe('Button', () => {
  it('renders each variant with its own look and keeps native button behavior', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>기본</Button>
        <Button variant="danger">위험</Button>
        <Button variant="sky" size="sm">하늘</Button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: '기본' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '위험' }).className).toContain('to-danger');
    expect(screen.getByRole('button', { name: '하늘' }).className).toContain('h-9');
  });

  it('does not force a type, so a button inside a form still submits', () => {
    render(<Button>제출</Button>);
    expect(screen.getByRole('button', { name: '제출' })).not.toHaveAttribute('type');
  });

  it('can be disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>막힘</Button>);
    fireEvent.click(screen.getByRole('button', { name: '막힘' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('is named by its label, since it has no visible text', () => {
    const onClick = vi.fn();
    render(<IconButton label="가방" onClick={onClick}>i</IconButton>);
    fireEvent.click(screen.getByRole('button', { name: '가방' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is at least 44px on the standard size', () => {
    render(<IconButton label="지도">i</IconButton>);
    expect(screen.getByRole('button', { name: '지도' }).className).toContain('size-11');
  });
});

describe('Bar', () => {
  it('reports the ratio as a percentage and clamps out-of-range values', () => {
    const { rerender } = render(<Bar ratio={0.5} label="50 / 100" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    rerender(<Bar ratio={3} label="over" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<Bar ratio={-1} label="under" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('treats a non-finite ratio (0/0) as empty instead of rendering NaN', () => {
    render(<Bar ratio={NaN} label="empty" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows its label', () => {
    render(<Bar ratio={1} kind="mp" label="20 / 20" />);
    expect(screen.getByText('20 / 20')).toBeInTheDocument();
  });
});

describe('Slot', () => {
  it('shows a quantity only for stacks, an enchant level only above +0, and the equipped tag', () => {
    const { rerender } = render(<Slot quantity={1}>i</Slot>);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    rerender(<Slot quantity={12} enchant={3} equipped>i</Slot>);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('착용')).toBeInTheDocument();
    rerender(<Slot enchant={0}>i</Slot>);
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
  });

  it('colors the border by rarity', () => {
    render(<Slot rarity={5} data-testid="s">i</Slot>);
    expect(screen.getByTestId('s')).toHaveStyle({ borderColor: THEME.rarity[4] });
  });

  it('is a keyboard-operable button only when it has a click handler', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Slot data-testid="s">i</Slot>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<Slot onClick={onClick} data-testid="s">i</Slot>);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('ignores clicks while disabled', () => {
    const onClick = vi.fn();
    render(<Slot disabled onClick={onClick}>i</Slot>);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Badge', () => {
  it('renders its content', () => {
    render(<Badge tone="mint">Lv.5</Badge>);
    expect(screen.getByText('Lv.5')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Modal open={false} title="안내">본문</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a labelled dialog when open', () => {
    render(<Modal open title="안내">본문</Modal>);
    expect(screen.getByRole('dialog', { name: '안내' })).toBeInTheDocument();
    expect(screen.getByText('본문')).toBeInTheDocument();
  });

  it('closes on Escape, on the close button and on a backdrop press', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal open title="안내" onClose={onClose}>본문</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.pointerDown(container.firstElementChild as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close from a press inside the dialog itself', () => {
    const onClose = vi.fn();
    render(<Modal open title="안내" onClose={onClose}>본문</Modal>);
    fireEvent.pointerDown(screen.getByText('본문'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cannot be dismissed when dismissible is off', () => {
    const onClose = vi.fn();
    render(<Modal open title="안내" onClose={onClose} dismissible={false}>본문</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('renders a footer', () => {
    render(<Modal open title="안내" footer={<button>확인</button>}>본문</Modal>);
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });
});

describe('GamePanel', () => {
  it('shows its title and content and closes from the header button', () => {
    const onClose = vi.fn();
    render(<GamePanel title="가방" onClose={onClose}>내용</GamePanel>);
    expect(screen.getByRole('heading', { name: '가방' })).toBeInTheDocument();
    expect(screen.getByText('내용')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('makes the header the drag handle and applies the frame from useDraggablePanel', () => {
    const onHeaderPointerDown = vi.fn();
    render(
      <GamePanel title="가방" onHeaderPointerDown={onHeaderPointerDown} frameStyle={{ left: 12, top: 34, width: 300 }}>
        내용
      </GamePanel>,
    );
    fireEvent.pointerDown(screen.getByRole('heading', { name: '가방' }));
    expect(onHeaderPointerDown).toHaveBeenCalledTimes(1);
    const panel = screen.getByRole('heading', { name: '가방' }).closest('section')!;
    expect(panel).toHaveStyle({ left: '12px', top: '34px', width: '300px' });
    // A finger drag on the header must not be taken by browser scrolling.
    expect(panel.querySelector('header')!.className).toContain('touch-none');
  });

  it('has no close button when nothing can close it', () => {
    render(<GamePanel title="지도">내용</GamePanel>);
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });
});

describe('TooltipCard', () => {
  it('shows a title and details, outlined in the rarity color', () => {
    render(
      <TooltipCard title="강철 검" rarity={3}>
        공격력 +7
      </TooltipCard>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('강철 검');
    expect(tip).toHaveTextContent('공격력 +7');
    expect(tip).toHaveStyle({ borderColor: THEME.rarity[2] });
  });
});
