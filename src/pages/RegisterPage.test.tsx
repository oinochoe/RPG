import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import * as authApi from '../api/auth';
import { useAuthStore } from '../stores/authStore';

vi.mock('../api/auth', () => ({
  register: vi.fn(),
  login: vi.fn(),
  resendVerification: vi.fn(),
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/characters" element={<div>characters page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'Passw0rd!' } });
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, refreshToken: null, email: null, isAuthenticated: false });
  });

  it('shows the check-your-inbox screen when the server requires verification', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ requires_verification: true });
    renderPage();
    expect(await screen.findByText('회원가입 완료')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('treats an older server\'s empty response as requiring verification', async () => {
    vi.mocked(authApi.register).mockResolvedValue({});
    renderPage();
    expect(await screen.findByText('회원가입 완료')).toBeInTheDocument();
  });

  it('logs straight in when the server has verification switched off', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ requires_verification: false });
    vi.mocked(authApi.login).mockResolvedValue({ access_token: 'a', refresh_token: 'r' });
    renderPage();
    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith('a@b.com', 'Passw0rd!');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
