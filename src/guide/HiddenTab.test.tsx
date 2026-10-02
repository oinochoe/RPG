import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DISCOVERIES } from '../components/game/discoveries';
import { HiddenTab } from './HiddenTab';

const hiddenWithReward = DISCOVERIES.find((d) => d.hidden && d.reward && !(d.requires ?? []).some((r) => r.type === 'seen'))!;
const chained = DISCOVERIES.find((d) => d.hidden && (d.requires ?? []).some((r) => r.type === 'seen'))!;

describe('HiddenTab spoiler stages', () => {
  it("does not put a hidden discovery's answer anywhere in the DOM at first", () => {
    const { container } = render(<HiddenTab />);
    const text = container.textContent ?? '';
    expect(text).not.toContain(hiddenWithReward.name);
    expect(text).not.toContain(hiddenWithReward.hint!);
    expect(text).not.toContain(hiddenWithReward.where!);
    expect(text).toContain('스포일러 주의');
  });
  it('reveals hint, then location, then the answer one step at a time', () => {
    render(<HiddenTab />);
    const hintButtons = screen.getAllByRole('button', { name: '힌트 보기' });
    expect(hintButtons.length).toBeGreaterThan(0);
    for (const b of hintButtons) {
      fireEvent.click(b);
      if (screen.queryByText(hiddenWithReward.hint!)) break;
    }
    expect(screen.getByText(hiddenWithReward.hint!)).toBeInTheDocument();
    expect(screen.queryByText(hiddenWithReward.where!)).not.toBeInTheDocument();
    const card = screen.getByText(hiddenWithReward.hint!).closest('[data-guide-card]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: '위치 보기' }));
    expect(within(card).getByText(hiddenWithReward.where!)).toBeInTheDocument();
    expect(within(card).queryByText(hiddenWithReward.name)).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: '정답 보기' }));
    expect(within(card).getByText(hiddenWithReward.name)).toBeInTheDocument();
    expect(within(card).getByText(/x≈/)).toBeInTheDocument();
  });
  it("keeps a chained discovery's location locked until its predecessor's answer was revealed", () => {
    render(<HiddenTab />);
    for (const b of screen.getAllByRole('button', { name: '힌트 보기' })) fireEvent.click(b);
    const card = screen.getByText(chained.hint!).closest('[data-guide-card]') as HTMLElement;
    expect(within(card).getByRole('button', { name: '위치 보기' })).toBeDisabled();
    expect(within(card).getByText('앞 단계 정답을 먼저 확인하세요')).toBeInTheDocument();
  });
  it('filters sections by zone', () => {
    render(<HiddenTab />);
    const before = document.querySelectorAll('[data-guide-card]').length;
    const chips = screen.getAllByRole('button', { pressed: false });
    fireEvent.click(chips[0]);
    expect(document.querySelectorAll('[data-guide-card]').length).toBeLessThan(before);
  });
});
