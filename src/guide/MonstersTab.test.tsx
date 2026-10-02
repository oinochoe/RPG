import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { guideBosses, guideMonsters } from './guideMonsters';
import { MonstersTab } from './MonstersTab';

describe('MonstersTab', () => {
  it('shows monster names, zones and drop percents', () => {
    const { container } = render(<MonstersTab />);
    for (const m of guideMonsters()) expect(screen.getAllByText(m.name).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/\d+\.\d%/);
    expect(screen.getAllByText('사막').length).toBeGreaterThan(0);
  });
  it('lists drops sorted by chance descending', () => {
    const { container } = render(<MonstersTab />);
    const lists = [...container.querySelectorAll('[data-guide-card] ul')];
    expect(lists.length).toBeGreaterThan(0);
    for (const ul of lists) {
      const vals = [...ul.querySelectorAll('li')].map((li) => parseFloat(/(\d+\.\d)%/.exec(li.textContent ?? '')![1]));
      expect([...vals].sort((a, b) => b - a)).toEqual(vals);
    }
  });
  it('filters by zone chip', () => {
    render(<MonstersTab />);
    expect(screen.getByText('늑대')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '사막' }));
    expect(screen.queryByText('늑대')).not.toBeInTheDocument();
    expect(screen.getByText('가시선인장')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사막' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('shows all bosses with the always-drop note', () => {
    render(<MonstersTab />);
    expect(screen.getByRole('heading', { name: '보스' })).toBeInTheDocument();
    const bosses = guideBosses();
    expect(bosses).toHaveLength(5);
    for (const b of bosses) expect(screen.getAllByText(b.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText('처치하면 반드시 드롭')).toHaveLength(5);
  });
});
