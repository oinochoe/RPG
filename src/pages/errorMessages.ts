import { ApiError } from '../types/api';

const REASON_MESSAGES: Record<string, string> = {
  email_already_registered: '이미 등록된 이메일 주소입니다.',
  weak_password: '비밀번호는 최소 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다.',
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
  account_deactivated: '탈퇴 처리되었거나 이용이 정지된 계정입니다.',
  account_suspended: '이용이 정지된 계정입니다.',
  token_expired_or_invalid: '유효하지 않거나 만료된 토큰입니다.',
  email_unverified: '이메일 인증을 완료한 후 이용할 수 있습니다.',
  name_already_taken: '이미 사용 중인 캐릭터 이름입니다.',
  max_characters_reached: '생성 가능한 최대 캐릭터 수를 초과했습니다.',
  character_not_found: '해당 캐릭터를 찾을 수 없습니다.',
  no_active_character: '선택된 활성 캐릭터가 없습니다.',
};

export function translateApiError(err: unknown): string {
  if (err instanceof ApiError) {
    return REASON_MESSAGES[err.reason ?? ''] ?? err.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}
