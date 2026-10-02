import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { useAuthStore } from '../stores/authStore';

describe('real App routing for /guide', { timeout: 20000 }, () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false });
    window.history.pushState({}, '', '/guide');
  });
  it('opens for an anonymous visitor without redirecting to /login', async () => {
    render(<App />);
    expect(await screen.findByRole('tab', { name: '스킬' }, { timeout: 8000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/guide');
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  });
  it('links back to the game when authenticated', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<App />);
    expect(await screen.findByRole('link', { name: '게임으로' }, { timeout: 8000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/guide');
  });
});
