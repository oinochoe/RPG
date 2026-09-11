import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireActiveCharacter } from './RouteGuards';
import { useAuthStore } from '../stores/authStore';
import { useCharacterStore } from '../stores/characterStore';

function renderWithGuard(guard: 'auth' | 'character', initialPath: string) {
  const GuardElement = guard === 'auth' ? <RequireAuth /> : <RequireActiveCharacter />;
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={GuardElement}>
          <Route path="/protected" element={<div>protected content</div>} />
        </Route>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/characters" element={<div>characters page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, email: null, isAuthenticated: false });
  });

  it('redirects to /login when not authenticated', () => {
    renderWithGuard('auth', '/protected');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders the protected route when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderWithGuard('auth', '/protected');
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});

describe('RequireActiveCharacter', () => {
  beforeEach(() => {
    useCharacterStore.setState({ characters: [], activeCharacter: null, isLoading: false });
  });

  it('redirects to /characters when there is no active character', () => {
    renderWithGuard('character', '/protected');
    expect(screen.getByText('characters page')).toBeInTheDocument();
  });
});
