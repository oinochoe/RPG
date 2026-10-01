/** A replaced session is refused by the server, so skip the save. A null id still saves: a new frontend
 * talking to a not-yet-deployed function (no session support) must keep persisting position. */
export function shouldSavePosition(state: { replaced: boolean; sessionId: string | null }): boolean {
  return !state.replaced;
}
