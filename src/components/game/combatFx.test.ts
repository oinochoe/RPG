import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addShake,
  diffHits,
  emitHit,
  isHeavyHit,
  resetShake,
  sampleShake,
  shakeAmplitude,
  startCombatFxWatcher,
  subscribeHit,
  type HitEvent,
} from './combatFx';
import { useFxSettings } from './fxSettings';
import { useCombatStore } from '../../stores/combatStore';

const m = (currentHp: number, x = 0) => ({ currentHp, alive: currentHp > 0, position: [x, 0, 0] as [number, number, number] });
const state = (playerHp: number, monsters: Record<number, ReturnType<typeof m>>, attackPower = 10) => ({
  player: { currentHp: playerHp, attackPower },
  monsters,
});
const P: [number, number, number] = [0, 1, 0];

describe('isHeavyHit', () => {
  it('treats a hit up to 1.15x attackPower as normal and anything above as heavy', () => {
    expect(isHeavyHit(11, 10)).toBe(false);
    expect(isHeavyHit(12, 10)).toBe(true);
  });
});

describe('diffHits', () => {
  it('emits one event per monster that lost HP (AoE)', () => {
    const prev = state(50, { 1: m(30), 2: m(30), 3: m(30) });
    const next = state(50, { 1: m(20), 2: m(10), 3: m(30) });
    const events = diffHits(prev, next, P);
    expect(events.map((e) => [e.targetId, e.damage, e.kind])).toEqual([
      [1, 10, 'hit'],
      [2, 20, 'hit'],
    ]);
  });

  it('marks a monster reaching 0 HP as a heavy kill', () => {
    const [e] = diffHits(state(50, { 1: m(5) }), state(50, { 1: m(0) }), P);
    expect(e).toMatchObject({ kind: 'kill', damage: 5, heavy: true, targetId: 1 });
  });

  it('emits playerHit when the player loses HP, at the player position', () => {
    const [e] = diffHits(state(50, {}), state(42, {}), P);
    expect(e).toMatchObject({ kind: 'playerHit', damage: 8, position: [0, 1, 0] });
  });

  it('ignores HP increases, and monsters that appear or disappear', () => {
    const prev = state(40, { 1: m(10), 2: m(10) });
    const next = state(50, { 1: m(30), 3: m(1) }); // healed / respawned; 2 gone; 3 new
    expect(diffHits(prev, next, P)).toEqual([]);
  });

  it('places the event above the monster, at chest height', () => {
    const [e] = diffHits(state(50, { 1: m(30, 4) }), state(50, { 1: m(20, 4) }), P);
    expect(e.position[0]).toBe(4);
    expect(e.position[1]).toBeGreaterThan(0.5);
  });
});

describe('event bus', () => {
  it('delivers to every subscriber and stops after unsubscribe', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeHit(a);
    subscribeHit(b);
    const e: HitEvent = { kind: 'hit', position: [0, 0, 0], damage: 1, heavy: false };
    emitHit(e);
    offA();
    emitHit(e);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('keeps delivering when one subscriber throws', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    subscribeHit(() => {
      throw new Error('boom');
    });
    subscribeHit(good);
    expect(() => emitHit({ kind: 'hit', position: [0, 0, 0], damage: 1, heavy: false })).not.toThrow();
    expect(good).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('screen shake', () => {
  beforeEach(() => {
    resetShake();
    useFxSettings.setState({ shake: true });
  });

  it('gives no shake to a plain hit, some to heavy/kill/player hits, most to a kill', () => {
    const base = { position: [0, 0, 0] as [number, number, number], damage: 1 };
    expect(shakeAmplitude({ ...base, kind: 'hit', heavy: false })).toBe(0);
    const heavy = shakeAmplitude({ ...base, kind: 'hit', heavy: true });
    const player = shakeAmplitude({ ...base, kind: 'playerHit', heavy: false });
    const kill = shakeAmplitude({ ...base, kind: 'kill', heavy: true });
    expect(heavy).toBeGreaterThan(0);
    expect(player).toBeGreaterThan(0);
    expect(kill).toBeGreaterThan(heavy);
  });

  it('decays to zero and never exceeds the cap', () => {
    addShake(100);
    const first = sampleShake(0.016, () => 1);
    expect(Math.abs(first.x)).toBeLessThanOrEqual(0.3);
    let last = first;
    for (let i = 0; i < 60; i++) last = sampleShake(0.016, () => 1);
    expect(last).toEqual({ x: 0, y: 0 });
  });

  it('is exactly zero when the player turned shake off', () => {
    useFxSettings.setState({ shake: false });
    addShake(0.2);
    expect(sampleShake(0.016, () => 1)).toEqual({ x: 0, y: 0 });
  });
});

describe('startCombatFxWatcher settle window', () => {
  const setHp = (hp: number) => useCombatStore.setState((s) => ({ player: { ...s.player, currentHp: hp } }));

  beforeEach(() => {
    vi.useFakeTimers();
    setHp(100);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits nothing for HP changes right after start (session init)', () => {
    const fn = vi.fn();
    const off = subscribeHit(fn);
    const stop = startCombatFxWatcher();
    setHp(40);
    expect(fn).not.toHaveBeenCalled();
    stop();
    off();
  });

  it('emits playerHit for an HP loss after the settle window', () => {
    const fn = vi.fn();
    const off = subscribeHit(fn);
    const stop = startCombatFxWatcher();
    setHp(40);
    vi.advanceTimersByTime(2000);
    setHp(30);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ kind: 'playerHit', damage: 10 });
    stop();
    off();
  });

  it('stop unsubscribes from the store', () => {
    const fn = vi.fn();
    const off = subscribeHit(fn);
    const stop = startCombatFxWatcher();
    vi.advanceTimersByTime(2000);
    stop();
    setHp(10);
    expect(fn).not.toHaveBeenCalled();
    off();
  });
});
