import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';

type Status = 'pending' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('인증 토큰이 없습니다. 이메일의 링크를 다시 확인해주세요.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(translateApiError(err));
      });
  }, [token]);

  if (status === 'pending') return <p>이메일 인증 처리 중입니다...</p>;

  if (status === 'error') {
    return (
      <div>
        <h1>인증 실패</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>이메일 인증 완료</h1>
      <p>
        이제 로그인할 수 있습니다. <Link to="/login">로그인하러 가기</Link>
      </p>
    </div>
  );
}
