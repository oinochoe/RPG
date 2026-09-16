import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck, UserPlus } from 'lucide-react';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.register(email, password);
      setSubmitted(true);
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <MailCheck className="size-8 text-gold" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-ink">회원가입 완료</h1>
          <p className="text-sm text-gold-dim">
            <span className="text-ink">{email}</span>로 인증 메일을 보냈습니다.
            <br />
            메일함을 확인해주세요.
          </p>
          <Button className="w-full" onClick={() => navigate('/login')}>
            로그인 화면으로
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <UserPlus className="size-8 text-gold" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-ink">회원가입</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <p className="text-[11px] text-gold-dim">영문 대소문자와 숫자를 포함해 8자 이상</p>
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '가입 처리 중...' : '가입하기'}
          </Button>
        </form>
        <p className="text-center text-xs text-gold-dim">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-semibold text-gold hover:underline">
            로그인
          </Link>
        </p>
      </Card>
    </div>
  );
}
