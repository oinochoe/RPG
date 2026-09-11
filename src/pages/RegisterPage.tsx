import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { translateApiError } from './errorMessages';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await authApi.register(email, password);
      setSubmitted(true);
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  if (submitted) {
    return (
      <div>
        <h1>회원가입 완료</h1>
        <p>{email}로 인증 메일을 보냈습니다. 메일함을 확인해주세요.</p>
        <button onClick={() => navigate('/login')}>로그인 화면으로</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>회원가입</h1>
      <label>
        이메일
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">가입하기</button>
      <p>
        이미 계정이 있으신가요? <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}
