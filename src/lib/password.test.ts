import { describe, expect, it } from 'vitest';
import { passwordProblem } from './password';

describe('passwordProblem', () => {
  it('accepts a password with 8+ chars, upper, lower and a digit', () => {
    expect(passwordProblem('Passw0rd')).toBeNull();
    expect(passwordProblem('Abcdef123!')).toBeNull();
  });
  it.each([
    ['short', 'Ab1'],
    ['no uppercase', 'password1'],
    ['no lowercase', 'PASSWORD1'],
    ['no digit', 'Password'],
  ])('rejects %s', (_label, pw) => {
    expect(passwordProblem(pw)).not.toBeNull();
  });
});
