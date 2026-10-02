import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/characters', () => ({
  listCharacters: vi.fn(),
  listClaimedDiscoveriesFor: vi.fn(),
}));

import * as api from '../api/characters';
import { DISCOVERIES } from '../components/game/discoveries';
import { GuidePage } from '../pages/GuidePage';
import { useAuthStore } from '../stores/authStore';
import { buildGuideDiscoveries } from './guideDiscoveries';

const plainHidden = DISCOVERIES.filter((d) => d.hidden && d.reward && !(d.requires ?? []).some((r) => r.type === 'seen'));
const foundA = plainHidden[0];
const foundB = plainHidden[1];
const coordsOf = (id: string) => buildGuideDiscoveries().find((g) => g.id === id)!.coords;

const chars = [
  { id: 1, name: '용사', character_class: 'warrior', level: 12, current_hp: 1, max_hp: 1, current_map_id: 1 },
  { id: 2, name: '궁수님', character_class: 'archer', level: 3, current_hp: 1, max_hp: 1, current_map_id: 1 },
];

function renderGuide() {
  return render(
    <MemoryRouter initialEntries={['/guide']}>
      <Routes>
        <Route path="/guide" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}
const cardOf = (name: string) => screen.getByText(name).closest('[data-guide-card]') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ isAuthenticated: false });
  vi.mocked(api.listCharacters).mockReset();
  vi.mocked(api.listClaimedDiscoveriesFor).mockReset();
  vi.mocked(api.listCharacters).mockResolvedValue({ items: chars, page: 1, page_size: 20, total: 2 } as never);
  vi.mocked(api.listClaimedDiscoveriesFor).mockImplementation(async (id: number) => ({ claimed: id === 1 ? [foundA.id] : [foundB.id] }));
});

describe('guide progress (anonymous)', () => {
  it('makes no network calls, shows no select or badge, and leaks nothing', () => {
    const { container } = renderGuide();
    expect(api.listCharacters).not.toHaveBeenCalled();
    expect(api.listClaimedDiscoveriesFor).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('보기 기준 캐릭터')).not.toBeInTheDocument();
    expect(screen.queryByText('✓ 찾음')).not.toBeInTheDocument();
    for (const d of plainHidden) expect(container.innerHTML).not.toContain(d.name);
  });
});

describe('guide progress (logged in)', () => {
  beforeEach(() => useAuthStore.setState({ isAuthenticated: true }));

  it('lists characters, badges and auto-reveals found items, keeps the rest hidden', async () => {
    const { container } = renderGuide();
    const select = await screen.findByLabelText('보기 기준 캐릭터');
    expect(select).toHaveDisplayValue('용사 (전사 Lv.12)');
    expect(await screen.findByText('✓ 찾음')).toBeInTheDocument();
    const card = cardOf(foundA.name);
    expect(card).toHaveTextContent(coordsOf(foundA.id));
    expect(card).toHaveTextContent('✓ 찾음');
    expect(container.innerHTML).not.toContain(foundB.name);
    expect(container.innerHTML).not.toContain(coordsOf(foundB.id));
  });

  it('adds locally seen (reward-less) ids of that browser', async () => {
    localStorage.setItem('rpg.discoveries.seen.1', JSON.stringify([foundB.id]));
    renderGuide();
    await screen.findByLabelText('보기 기준 캐릭터');
    await waitFor(() => expect(screen.getAllByText('✓ 찾음').length).toBe(2));
    expect(cardOf(foundB.name)).toBeInTheDocument();
  });

  it('switching the character reloads and changes which items are badged', async () => {
    renderGuide();
    const select = await screen.findByLabelText('보기 기준 캐릭터');
    await screen.findByText(foundA.name);
    fireEvent.change(select, { target: { value: '2' } });
    await screen.findByText(foundB.name);
    expect(screen.queryByText(foundA.name)).not.toBeInTheDocument();
    expect(api.listClaimedDiscoveriesFor).toHaveBeenLastCalledWith(2);
    expect(localStorage.getItem('rpg.guide.character')).toBe('2');
  });

  it('degrades silently to local-seen only when the claimed call fails', async () => {
    vi.mocked(api.listClaimedDiscoveriesFor).mockRejectedValue(new Error('boom'));
    localStorage.setItem('rpg.discoveries.seen.1', JSON.stringify([foundB.id]));
    const { container } = renderGuide();
    await screen.findByText(foundB.name);
    expect(screen.getAllByText('✓ 찾음').length).toBe(1);
    expect(container.innerHTML).not.toContain(foundA.name);
  });

  it('behaves as anonymous when the character list fails', async () => {
    vi.mocked(api.listCharacters).mockRejectedValue(new Error('down'));
    const { container } = renderGuide();
    await act(async () => {});
    expect(screen.queryByLabelText('보기 기준 캐릭터')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(foundA.name);
  });

  it('remembers the last chosen character', async () => {
    localStorage.setItem('rpg.guide.character', '2');
    renderGuide();
    const select = await screen.findByLabelText('보기 기준 캐릭터');
    expect(select).toHaveDisplayValue('궁수님 (궁수 Lv.3)');
  });
});
