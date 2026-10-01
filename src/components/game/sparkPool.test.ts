import { describe, expect, it } from 'vitest';
import { SPARK_POOL_SIZE, SparkPool, sharedSparkPool } from './sparkPool';

const rand = () => 0.5;

function aliveCount(p: SparkPool) {
  let n = 0;
  for (let i = 0; i < p.size; i++) if (p.isAlive(i)) n++;
  return n;
}

describe('SparkPool', () => {
  it('spawns the requested number of sparks at the origin', () => {
    const p = new SparkPool(96);
    p.spawn([2, 1, 3], 8, 3, 0.4, 0.1, 0xffffff, rand);
    expect(aliveCount(p)).toBe(8);
    const i = [...Array(96).keys()].find((k) => p.isAlive(k))!;
    expect(p.x[i]).toBeCloseTo(2);
    expect(p.z[i]).toBeCloseTo(3);
  });

  it('retires sparks after their life', () => {
    const p = new SparkPool(96);
    p.spawn([0, 0, 0], 8, 3, 0.4, 0.1, 0xffffff, rand);
    p.step(0.2);
    expect(aliveCount(p)).toBe(8);
    p.step(0.25);
    expect(aliveCount(p)).toBe(0);
  });

  it('reuses the oldest slots when more sparks are requested than the pool holds', () => {
    const p = new SparkPool(10);
    expect(() => {
      for (let i = 0; i < 5; i++) p.spawn([i, 0, 0], 8, 3, 1, 0.1, 0xffffff, rand);
    }).not.toThrow();
    expect(aliveCount(p)).toBe(10);
  });

  it('pulls sparks down over time', () => {
    const p = new SparkPool(4);
    p.spawn([0, 2, 0], 1, 0, 1, 0.1, 0xffffff, () => 0.5);
    const i = [0, 1, 2, 3].find((k) => p.isAlive(k))!;
    p.step(0.3);
    expect(p.y[i]).toBeLessThan(2);
  });
});

describe('sharedSparkPool', () => {
  it('is one pool of the agreed size that hit sparks and skill sparks both draw from', () => {
    expect(sharedSparkPool.size).toBe(SPARK_POOL_SIZE);
    expect(SPARK_POOL_SIZE).toBe(128);
  });
});
