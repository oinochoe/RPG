import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import * as authApi from '../api/auth';
import { ApiError } from '../types/api';

vi.mock('../api/auth', () => ({ forgotPassword: vi.fn() }));

function submit(email = 'a@b.com') {
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: '재설정 링크 받기' }));
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the neutral "sent" screen after a request', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined);
    submit();
    expect(await screen.findByText('메일을 보냈습니다')).toBeInTheDocument();
    expect(authApi.forgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('surfaces a rate limit instead of pretending the mail went out', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValue(
      new ApiError(429, { error: 'rate_limited', reason: 'reset_rate_limited', message: 'slow down' }),
    );
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해주세요.');
    expect(screen.queryByText('메일을 보냈습니다')).not.toBeInTheDocument();
  });
});
