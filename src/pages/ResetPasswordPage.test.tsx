import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';
import * as authApi from '../api/auth';
import { ApiError } from '../types/api';

vi.mock('../api/auth', () => ({ resetPassword: vi.fn() }));

function renderPage(url = '/reset-password?token=abc123') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows an error state when the link has no token', () => {
    renderPage('/reset-password');
    expect(screen.getByText('잘못된 링크')).toBeInTheDocument();
  });

  it('does not call the API for a weak password (the token is single-use)', async () => {
    renderPage();
    fill('weak', 'weak');
    expect(await screen.findByRole('alert')).toHaveTextContent('최소 8자');
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('does not call the API when the confirmation differs', async () => {
    renderPage();
    fill('Passw0rd1', 'Passw0rd2');
    expect(await screen.findByRole('alert')).toHaveTextContent('일치하지 않습니다');
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('sends the token + new password and shows success', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue(undefined);
    renderPage();
    fill('Passw0rd1', 'Passw0rd1');
    expect(await screen.findByText('비밀번호가 변경되었습니다')).toBeInTheDocument();
    expect(authApi.resetPassword).toHaveBeenCalledWith('abc123', 'Passw0rd1');
  });

  it('shows the server error for an expired token', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(
      new ApiError(400, { error: 'invalid_token', reason: 'token_expired_or_invalid', message: 'x' }),
    );
    renderPage();
    fill('Passw0rd1', 'Passw0rd1');
    expect(await screen.findByRole('alert')).toHaveTextContent('유효하지 않거나 만료된');
  });
});
