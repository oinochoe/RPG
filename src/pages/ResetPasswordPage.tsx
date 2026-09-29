import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, ShieldCheck, ShieldX } from 'lucide-react';
import * as authApi from '../api/auth';
import { passwordProblem } from '../lib/password';
import { translateApiError } from './errorMessages';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    // Checked before the request: the emailed token is single-use, so don't spend a round trip
    // (or risk confusion) on something we can already tell is wrong.
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="text-center">
          <ShieldX className="mx-auto mb-4 size-8 text-danger" strokeWidth={1.5} />
          <h1 className="font-display text-2xl text-ink">잘못된 링크</h1>
          <p role="alert" className="mt-3 text-sm text-danger-ink">
            재설정 토큰이 없습니다. 이메일의 링크를 다시 확인해주세요.
          </p>
          <Link to="/forgot-password" className="mt-4 block text-sm font-bold text-gold-ink hover:underline">
            비밀번호 찾기 다시 하기
          </Link>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="text-center">
          <ShieldCheck className="mx-auto mb-4 size-8 text-gold-deep" strokeWidth={1.5} />
          <h1 className="font-display text-2xl text-ink">비밀번호가 변경되었습니다</h1>
          <p className="mt-3 text-sm text-ink-soft">새 비밀번호로 로그인해주세요.</p>
          <Link to="/login" className="mt-6 block">
            <Button className="w-full">로그인하러 가기</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <KeyRound className="size-8 text-gold-deep" strokeWidth={1.5} />
          <h1 className="font-display text-2xl text-ink">새 비밀번호 설정</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="new-password">새 비밀번호</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p className="mt-1.5 text-xs text-ink-soft">영문 대소문자와 숫자를 포함해 8자 이상</p>
          </div>
          <div>
            <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="rounded-control border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger-ink">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? '변경 중...' : '비밀번호 변경'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          링크가 만료되었나요?{' '}
          <Link to="/forgot-password" className="font-bold text-gold-ink hover:underline">
            다시 요청하기
          </Link>
        </p>
      </Card>
    </div>
  );
}
