/**
 * Client-side copy of the server's password rule (supabase/functions/api/auth.ts,
 * assertStrongPassword) so a weak password is caught before the request — the server still
 * enforces it. Returns the problem to show, or null if the password is acceptable.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return '비밀번호는 최소 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다.';
  }
  return null;
}
