import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck } from 'lucide-react';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="text-center">
          <MailCheck className="mx-auto mb-4 size-8 text-gold" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-ink">메일을 보냈습니다</h1>
          {/* Same wording whether or not the address is registered — the server never says. */}
          <p className="mt-3 text-sm text-gold-dim">
            <span className="text-ink">{email}</span>로 가입된 계정이 있다면
            <br />
            비밀번호 재설정 링크를 보냈습니다.
            <br />
            메일함(스팸함 포함)을 확인해주세요.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-3 text-xs font-semibold text-gold hover:underline"
          >
            다른 이메일로 다시 보내기
          </button>
          <Link to="/login" className="mt-6 block text-xs font-semibold text-gold hover:underline">
            로그인 화면으로
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <KeyRound className="size-8 text-gold" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-ink">비밀번호 찾기</h1>
          <p className="text-xs text-gold-dim">가입한 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
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
          {error && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? '보내는 중...' : '재설정 링크 받기'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-gold-dim">
          <Link to="/login" className="font-semibold text-gold hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </Card>
    </div>
  );
}
