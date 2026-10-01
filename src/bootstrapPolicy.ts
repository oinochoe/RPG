/** After a fresh tab or browser restart the tab has no game session id, so there is nothing to resume:
 * the player must re-select a character (RequireActiveCharacter routes to /characters). Fetching "my" profile
 * without an id would be refused by the server and look like a replaced session. */
export function shouldFetchActiveProfile(sessionId: string | null): boolean {
  return sessionId !== null;
}
