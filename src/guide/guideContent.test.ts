import { describe, expect, it } from 'vitest';
import { DISCOVERIES } from '../components/game/discoveries';

// Direction words are banned: they were wrong by hand before, and the coordinates carry direction.
// (북녘등불 is fine: 북 is followed by 녘, which this pattern does not list.)
const COMPASS = /[동서남북](쪽|편|측|향|단|부|방)|[동서남북]{2}|[동서남북]으로|\b(north|south|east|west)/i;
const LEAK = /골드|경험치|물약|x\d|좌표/;
const HINT_LEAK = /마나|사파이어|검|지팡이|장궁|보상|아이템|저금통|항아리/;

describe('guide copy for discoveries', () => {
  const needsFullCopy = DISCOVERIES.filter((d) => d.hidden || d.reward);

  it('gives every hidden or rewarded discovery a hint and a where', () => {
    for (const d of needsFullCopy) {
      expect(d.hint?.trim(), `${d.id} hint`).toBeTruthy();
      expect(d.where?.trim(), `${d.id} where`).toBeTruthy();
    }
  });
  it('gives every discovery a where', () => {
    for (const d of DISCOVERIES) expect(d.where?.trim(), `${d.id} where`).toBeTruthy();
  });
  it('never uses compass directions in guide copy (they were wrong by hand before; coordinates carry direction)', () => {
    for (const d of DISCOVERIES) {
      expect(`${d.hint ?? ''} ${d.where ?? ''}`, d.id).not.toMatch(COMPASS);
    }
  });
  it('lets the compass pattern catch directions but not the village name', () => {
    for (const bad of ['동쪽 끝', '서편', '남측', '북향', '남동', '북서쪽', '동으로 가라', 'to the North']) expect(bad).toMatch(COMPASS);
    expect('북녘등불 마을 끝자락').not.toMatch(COMPASS);
  });
  it('keeps the hint from giving the reward or the exact place away', () => {
    for (const d of needsFullCopy) {
      expect(d.hint ?? '', `${d.id}`).not.toMatch(LEAK);
      expect(d.hint ?? '', `${d.id} hint item words`).not.toMatch(HINT_LEAK);
      expect(d.hint ?? '', `${d.id} hint names itself`).not.toContain(d.name);
      expect(d.where ?? '', `${d.id} where leak`).not.toMatch(LEAK);
      expect(d.where ?? '', `${d.id} where digits`).not.toMatch(/\d/);
      expect(d.hint!.length, `${d.id} hint length`).toBeLessThanOrEqual(60);
      expect(d.where!.length, `${d.id} where length`).toBeLessThanOrEqual(80);
    }
  });
});
