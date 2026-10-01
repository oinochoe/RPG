import { describe, expect, it, vi } from 'vitest';
import { emitSkillCast, subscribeSkillCast, type SkillCastEvent } from './skillFx';
import { buildParts, capParts, impactShakeDelayMs, partState, spreadTarget, MAX_ACTIVE_PARTS, type ActivePart, type FxPart, type SkillFxDef } from './skillFxLife';

const ev = (over: Partial<SkillCastEvent> = {}): SkillCastEvent => ({
  skillId: 1,
  from: [0, 0.75, 0],
  to: [4, 0.75, 0],
  travelMs: 200,
  ...over,
});
const ids = () => {
  let n = 0;
  return () => ++n;
};

describe('skill cast bus', () => {
  it('delivers to every subscriber and stops after unsubscribe', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeSkillCast(a);
    const offB = subscribeSkillCast(b);
    emitSkillCast(ev());
    offA();
    emitSkillCast(ev());
    offB();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('keeps delivering when one subscriber throws', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    const offBad = subscribeSkillCast(() => {
      throw new Error('boom');
    });
    const offGood = subscribeSkillCast(good);
    expect(() => emitSkillCast(ev())).not.toThrow();
    expect(good).toHaveBeenCalled();
    offBad();
    offGood();
    err.mockRestore();
  });
});

describe('buildParts', () => {
  it('anchors cast parts at the caster and impact parts at the target by default', () => {
    const part: FxPart = { kind: 'flash', color: 0xffffff };
    expect(buildParts([part], ev(), 'cast', 1000, ids())[0].pos).toEqual([0, 0.75, 0]);
    expect(buildParts([part], ev(), 'impact', 1000, ids())[0].pos).toEqual([4, 0.75, 0]);
  });

  it('honours an explicit anchor', () => {
    const [p] = buildParts([{ kind: 'pillar', color: 1, at: 'from' }], ev(), 'impact', 0, ids());
    expect(p.pos).toEqual([0, 0.75, 0]);
  });

  it('expands count into staggered instances with a fan of angles', () => {
    const parts = buildParts([{ kind: 'trail', color: 1, count: 3, staggerMs: 40, spread: 0.3 }], ev(), 'cast', 1000, ids());
    expect(parts.map((p) => p.startAt)).toEqual([1000, 1040, 1080]);
    expect(parts.map((p) => +p.angle.toFixed(2))).toEqual([-0.3, 0, 0.3]);
  });

  it('keeps count as the particle count for sparks and makes a single instance', () => {
    const parts = buildParts([{ kind: 'sparks', color: 1, count: 20 }], ev(), 'impact', 0, ids());
    expect(parts).toHaveLength(1);
    expect(parts[0].count).toBe(20);
    expect(buildParts([{ kind: 'sparks', color: 1 }], ev(), 'impact', 0, ids())[0].count).toBeGreaterThan(0);
  });

  it('applies delayMs, and defaults travelling parts to the projectile flight time', () => {
    const [orb] = buildParts([{ kind: 'orb', color: 1, delayMs: 50 }], ev({ travelMs: 200 }), 'cast', 1000, ids());
    expect(orb.startAt).toBe(1050);
    expect(orb.durationMs).toBe(200);
    const [orbMelee] = buildParts([{ kind: 'orb', color: 1 }], ev({ travelMs: 0 }), 'cast', 0, ids());
    expect(orbMelee.durationMs).toBeGreaterThan(0);
    const [fixed] = buildParts([{ kind: 'orb', color: 1, durationMs: 333 }], ev(), 'cast', 0, ids());
    expect(fixed.durationMs).toBe(333);
  });

  it('scatters several falling parts inside the radius around the target', () => {
    const rand = () => 1; // +1 * radius on both axes
    const parts = buildParts([{ kind: 'fall', color: 1, count: 3 }], ev({ aoeRadius: 3 }), 'cast', 0, ids(), rand);
    for (const p of parts) {
      expect(Math.abs(p.to[0] - 4)).toBeLessThanOrEqual(3);
      expect(Math.abs(p.to[2])).toBeLessThanOrEqual(3);
    }
    expect(buildParts([{ kind: 'fall', color: 1 }], ev({ aoeRadius: 3 }), 'cast', 0, ids(), rand)[0].to).toEqual([4, 0.75, 0]);
  });

  it('gives every instance a unique id', () => {
    const parts = buildParts([{ kind: 'trail', color: 1, count: 4 }, { kind: 'flash', color: 1 }], ev(), 'cast', 0, ids());
    expect(new Set(parts.map((p) => p.id)).size).toBe(5);
  });
});

describe('capParts', () => {
  const mk = (id: number): ActivePart => ({ id, kind: 'flash', color: 0, scale: 1, startAt: 0, durationMs: 1, pos: [0, 0, 0], from: [0, 0, 0], to: [0, 0, 0], angle: 0, count: 1, radius: 1 });

  it('keeps only the newest parts when over the cap, never throwing', () => {
    let list: ActivePart[] = [];
    for (let i = 0; i < MAX_ACTIVE_PARTS + 10; i++) list = capParts(list, [mk(i)], MAX_ACTIVE_PARTS);
    expect(list).toHaveLength(MAX_ACTIVE_PARTS);
    expect(list[0].id).toBe(10);
    expect(list[list.length - 1]!.id).toBe(MAX_ACTIVE_PARTS + 9);
  });

  it('copes with one burst bigger than the cap', () => {
    const burst = Array.from({ length: MAX_ACTIVE_PARTS + 5 }, (_, i) => mk(i));
    const list = capParts([], burst, MAX_ACTIVE_PARTS);
    expect(list).toHaveLength(MAX_ACTIVE_PARTS);
    expect(list[list.length - 1]!.id).toBe(MAX_ACTIVE_PARTS + 4);
  });
});

describe('partState', () => {
  const part = { startAt: 1000, durationMs: 200 } as ActivePart;
  it('is not started before startAt, runs 0..1, then is done', () => {
    expect(partState(900, part)).toEqual({ started: false, t: 0, done: false });
    expect(partState(1100, part)).toEqual({ started: true, t: 0.5, done: false });
    expect(partState(1200, part)).toEqual({ started: true, t: 1, done: true });
  });
  it('treats a zero-length part (sparks) as done the moment it starts', () => {
    const instant = { startAt: 1000, durationMs: 0 } as ActivePart;
    expect(partState(999, instant).done).toBe(false);
    expect(partState(1000, instant)).toEqual({ started: true, t: 1, done: true });
  });
});

describe('spreadTarget', () => {
  it('rotates the aim direction around the vertical axis, keeping the target height', () => {
    const [x, y, z] = spreadTarget([0, 0.75, 0], [1, 0.75, 0], Math.PI / 2);
    expect(x).toBeCloseTo(0);
    expect(y).toBe(0.75);
    expect(z).toBeCloseTo(1);
  });
  it('returns the target unchanged for angle 0', () => {
    expect(spreadTarget([0, 0, 0], [3, 1, 2], 0)).toEqual([3, 1, 2]);
  });
});

describe('impactShakeDelayMs', () => {
  const def = (impact: FxPart[]): SkillFxDef => ({ tier: 'awakening', cast: [], impact });
  it('is 0 with no impact parts', () => {
    expect(impactShakeDelayMs(def([]))).toBe(0);
  });
  it('picks the largest delayMs', () => {
    expect(
      impactShakeDelayMs(def([{ kind: 'flash', color: 1, delayMs: 100 }, { kind: 'pillar', color: 1, delayMs: 450 }, { kind: 'sparks', color: 1, delayMs: 20 }])),
    ).toBe(450);
  });
  it('ignores parts without delayMs', () => {
    expect(impactShakeDelayMs(def([{ kind: 'flash', color: 1 }, { kind: 'sparks', color: 1, delayMs: 60 }]))).toBe(60);
    expect(impactShakeDelayMs(def([{ kind: 'flash', color: 1 }]))).toBe(0);
  });
});
