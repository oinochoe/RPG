import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionReplacedModal } from './SessionReplacedModal';
import { useGameSessionStore } from '../stores/gameSessionStore';

function renderModal() {
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <SessionReplacedModal />
      <Routes>
        <Route path="/game" element={<div>game page</div>} />
        <Route path="/characters" element={<div>characters page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SessionReplacedModal', () => {
  beforeEach(() => {
    useGameSessionStore.setState({ sessionId: 'abc', replaced: false });
  });

  it('renders nothing while the session is live', () => {
    renderModal();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the notice once replaced and cannot be dismissed', () => {
    renderModal();
    act(() => useGameSessionStore.getState().markReplaced());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/다른 곳에서 접속/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.pointerDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('the button resets the session and goes to character select', () => {
    renderModal();
    act(() => useGameSessionStore.getState().markReplaced());
    fireEvent.click(screen.getByRole('button', { name: '캐릭터 선택으로' }));
    expect(useGameSessionStore.getState()).toMatchObject({ sessionId: null, replaced: false });
    expect(screen.getByText('characters page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
