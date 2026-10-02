// Pure id parsing (no imports) so it can be unit tested without a Deno harness.
// Accepts only a canonical positive decimal integer string: ASCII digits, no sign, no leading zero, safe integer.
export function parsePositiveInt(raw: string | undefined | null): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}
