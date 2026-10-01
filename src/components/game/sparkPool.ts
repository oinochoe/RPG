// Fixed-size ring buffer of hit sparks in plain typed arrays: spawning reuses the oldest slot, so a
// burst of hits never allocates or grows — what keeps this cheap on phones.
const GRAVITY = 9;
const DRAG_PER_SEC = 4;

export class SparkPool {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly scale: Float32Array;
  readonly color: Uint32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private next = 0;

  constructor(readonly size: number) {
    this.x = new Float32Array(size);
    this.y = new Float32Array(size);
    this.z = new Float32Array(size);
    this.scale = new Float32Array(size);
    this.color = new Uint32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.vz = new Float32Array(size);
    this.age = new Float32Array(size);
    this.life = new Float32Array(size); // 0 = free
  }

  isAlive(i: number): boolean {
    return this.life[i] > 0;
  }

  spawn(
    origin: [number, number, number],
    count: number,
    speed: number,
    life: number,
    scale: number,
    color: number,
    rand: () => number = Math.random,
  ): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.size;
      const theta = rand() * Math.PI * 2;
      const lift = 0.3 + rand() * 0.7;
      const s = speed * (0.5 + rand() * 0.5);
      this.x[i] = origin[0];
      this.y[i] = origin[1];
      this.z[i] = origin[2];
      this.vx[i] = Math.cos(theta) * s;
      this.vz[i] = Math.sin(theta) * s;
      this.vy[i] = s * lift;
      this.age[i] = 0;
      this.life[i] = life;
      this.scale[i] = scale;
      this.color[i] = color;
    }
  }

  step(dt: number): void {
    const drag = Math.exp(-DRAG_PER_SEC * dt);
    for (let i = 0; i < this.size; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        continue;
      }
      this.vy[i] -= GRAVITY * dt;
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
    }
  }

  /** 1 at birth, 0 at death — used to shrink a spark as it fades. */
  remaining(i: number): number {
    return this.life[i] > 0 ? 1 - this.age[i] / this.life[i] : 0;
  }
}

// Hit sparks (combatFx) and skill sparks (skillFx) draw from one pool and one InstancedMesh, so the
// total number of live sparks — and the draw call count — stays bounded however many effects overlap.
export const SPARK_POOL_SIZE = 128;
export const sharedSparkPool = new SparkPool(SPARK_POOL_SIZE);
