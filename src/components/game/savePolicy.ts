/** A position save is only worth sending for a live session: a replaced one is refused by the server. */
export function shouldSavePosition(state: { replaced: boolean; sessionId: string | null }): boolean {
  return !state.replaced && state.sessionId !== null;
}
