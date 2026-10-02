import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePositiveInt } from '../../supabase/functions/api/parseId';

describe('parsePositiveInt', () => {
  it.each([['5', 5], ['12', 12], ['123456789', 123456789]])('accepts %s', (raw, want) => {
    expect(parsePositiveInt(raw)).toBe(want);
  });
  it.each(['me', '', '0', '-1', '+1', '01', '1.5', '1e3', ' 5', '5 ', '５', '１２', '9007199254740993'])('rejects %j', (raw) => {
    expect(parsePositiveInt(raw)).toBeNull();
  });
  it('rejects undefined and null', () => {
    expect(parsePositiveInt(undefined)).toBeNull();
    expect(parsePositiveInt(null)).toBeNull();
  });
});

describe('regex typo guard', () => {
  it('finds no character class followed by a bare d* in api sources', () => {
    const dir = join(__dirname, '../../supabase/functions/api');
    const bad = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /\[1-9\]d\*/.test(readFileSync(join(dir, f), 'utf8')));
    expect(bad).toEqual([]);
  });
});
