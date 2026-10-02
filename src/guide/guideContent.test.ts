import { describe, expect, it } from 'vitest';
import { DISCOVERIES } from '../components/game/discoveries';

const COMPASS = /(동|서|남|북)쪽|동북|동남|서북|서남|북동|북서|남동|남서/;

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
  it('keeps the hint from giving the reward or the exact place away', () => {
    for (const d of needsFullCopy) {
      expect(d.hint ?? '', `${d.id}`).not.toMatch(/골드|경험치|물약|x\d|좌표/);
      expect(d.hint!.length, `${d.id} hint length`).toBeLessThanOrEqual(60);
      expect(d.where!.length, `${d.id} where length`).toBeLessThanOrEqual(80);
    }
  });
});
