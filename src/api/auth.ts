import { apiRequest } from './client';
import type { AuthTokens } from '../types/api';

export function register(email: string, password: string): Promise<void> {
  return apiRequest<void>('/auth/register', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function login(email: string, password: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function verifyEmail(token: string): Promise<void> {
  return apiRequest<void>('/auth/verify-email', {
    method: 'POST',
    body: { token },
    auth: false,
  });
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}
