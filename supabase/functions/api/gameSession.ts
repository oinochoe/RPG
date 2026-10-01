// Decides whether a request belongs to the character's CURRENT game session. Pure (no imports) so
// vitest can import it, like drops.ts/economyRules.ts. Selecting a character issues a fresh
// game_session_id (see the select_character RPC); a request carrying any other id comes from a
// session that has since been replaced.

export const GAME_SESSION_HEADER = 'x-game-session';

export type GameSessionCheck = 'ok' | 'missing' | 'mismatch' | 'no_active_character';

export function checkGameSession(
  header: string | undefined,
  active: { game_session_id: string | null } | null | undefined,
): GameSessionCheck {
  if (!active) return 'no_active_character';
  if (!header) return 'missing';
  if (active.game_session_id === null || header !== active.game_session_id) return 'mismatch';
  return 'ok';
}
