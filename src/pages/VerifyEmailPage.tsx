import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';
import { Card } from '../components/ui/card';

type Status = 'pending' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);
  const verifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('인증 토큰이 없습니다. 이메일의 링크를 다시 확인해주세요.');
      return;
    }
    // React 18 StrictMode double-invokes effects in dev; the verification
    // token is single-use server-side, so a second call would fail even
    // though the first already succeeded. Only send it once per token.
    if (verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(translateApiError(err));
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="text-center">
        {status === 'pending' && (
          <>
            <Loader2 className="mx-auto mb-4 size-8 animate-spin text-gold" strokeWidth={1.5} />
            <p className="text-sm text-gold-dim">이메일 인증 처리 중입니다...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <ShieldX className="mx-auto mb-4 size-8 text-danger" strokeWidth={1.5} />
            <h1 className="text-xl font-bold text-ink">인증 실패</h1>
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          </>
        )}
        {status === 'success' && (
          <>
            <ShieldCheck className="mx-auto mb-4 size-8 text-gold" strokeWidth={1.5} />
            <h1 className="text-xl font-bold text-ink">이메일 인증 완료</h1>
            <p className="mt-3 text-sm text-gold-dim">
              이제 로그인할 수 있습니다.{' '}
              <Link to="/login" className="font-semibold text-gold hover:underline">
                로그인하러 가기
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
