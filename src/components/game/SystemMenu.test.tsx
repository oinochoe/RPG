import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { SystemMenu } from './SystemMenu';
import { useUIStore } from '../../stores/uiStore';

beforeEach(() => {
  useUIStore.setState({ isSystemMenuOpen: true });
});

describe('SystemMenu', () => {
  it('links the guide in a new tab so the game session is untouched', () => {
    render(
      <MemoryRouter>
        <SystemMenu />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: '공략집' });
    expect(link).toHaveAttribute('href', '/guide');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
