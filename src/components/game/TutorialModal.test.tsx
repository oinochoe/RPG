import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TutorialModal } from './TutorialModal';
import { useTutorialStore } from '../../lib/tutorial';

let touch = false;
vi.mock('../../lib/device', () => ({ useIsTouch: () => touch }));

describe('TutorialModal', () => {
  beforeEach(() => {
    touch = false;
    localStorage.clear();
    useTutorialStore.setState({ isOpen: false });
  });

  it('opens by itself on the first visit and walks through the pages', () => {
    render(<TutorialModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('이동과 전투')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('대화와 아이템')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('이동과 전투')).toBeInTheDocument();
  });

  it('finishing on the last page closes it for good', () => {
    render(<TutorialModal />);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('rpg.tutorial.v1')).toBe('1');
  });

  it('skipping counts as seen and it does not reappear on the next visit', () => {
    const { unmount } = render(<TutorialModal />);
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    useTutorialStore.setState({ isOpen: false });
    render(<TutorialModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape closes only the guide', () => {
    render(<TutorialModal />);
    const other = vi.fn();
    window.addEventListener('keydown', other); // e.g. GamePage's Escape handler (bubble phase)
    fireEvent.keyDown(window, { code: 'Escape' });
    window.removeEventListener('keydown', other);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(other).not.toHaveBeenCalled();
  });

  it('can be reopened from the menu after it was seen', () => {
    render(<TutorialModal />);
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    act(() => useTutorialStore.getState().open());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows phone wording on a touch device', () => {
    touch = true;
    render(<TutorialModal />);
    expect(screen.getByText(/조이스틱/)).toBeInTheDocument();
    expect(screen.queryByText(/WASD/)).not.toBeInTheDocument();
  });
});
