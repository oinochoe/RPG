import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GuidePage } from '../pages/GuidePage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/:tab" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GuidePage', () => {
  it('opens without being logged in and shows the four tabs', () => {
    renderAt('/guide');
    for (const label of ['히든·발견물', '퀘스트', '몬스터·드롭', '스킬']) expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  });
  it('defaults to the hidden tab and falls back to it for an unknown tab', () => {
    renderAt('/guide/nonsense');
    expect(screen.getByRole('tab', { name: '히든·발견물', selected: true })).toBeInTheDocument();
  });
  it('shows the skills of a class and switches class', () => {
    renderAt('/guide/skills');
    expect(screen.getByRole('tab', { name: '스킬', selected: true })).toBeInTheDocument();
    expect(screen.getByText('강타')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '궁수' }));
    expect(screen.getByText('관통사격')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '궁수' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('lists quests per village and explains how the main quest unlocks', () => {
    renderAt('/guide/quests');
    expect(screen.getByText('여울의 작은 꽃')).toBeInTheDocument();
    expect(screen.getByText(/메인 의뢰를 줍니다/)).toBeInTheDocument();
  });
  it('switches tabs by clicking', () => {
    renderAt('/guide/skills');
    fireEvent.click(screen.getByRole('tab', { name: '퀘스트' }));
    expect(screen.getByRole('tab', { name: '퀘스트', selected: true })).toBeInTheDocument();
  });
});
