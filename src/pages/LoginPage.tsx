import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Swords } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { translateApiError } from './errorMessages';
import { ApiError } from '../types/api';
import * as authApi from '../api/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setShowResend(false);
    setResendState('idle');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/characters');
    } catch (err) {
      setError(translateApiError(err));
      setShowResend(err instanceof ApiError && err.reason === 'email_unverified');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResendState('sending');
    try {
      await authApi.resendVerification(email);
      setResendState('sent');
    } catch (err) {
      setResendState('idle');
      setError(translateApiError(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Swords className="size-8 text-gold" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-ink">로그인</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          {showResend && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState !== 'idle'}
              className="text-left text-xs font-semibold text-gold hover:underline disabled:no-underline disabled:opacity-60"
            >
              {resendState === 'sent' ? '다시 보냈습니다' : resendState === 'sending' ? '보내는 중...' : '인증 메일 다시 받기'}
            </button>
          )}
          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? '로그인 중...' : '로그인'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-gold-dim">
          계정이 없으신가요?{' '}
          <Link to="/register" className="font-semibold text-gold hover:underline">
            회원가입
          </Link>
        </p>
      </Card>
    </div>
  );
}
