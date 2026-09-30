import { useCombatStore } from '../../stores/combatStore';
import { playerPosition } from './playerTransform';
import { useFxSettings } from './fxSettings';

// Combat presentation is decoupled from combat rules: combatStore decides damage, this module only
// watches the HP it leaves behind and turns each loss into a HitEvent. Feel modules (camera shake,
// monster flash/hit-stop, sparks, damage numbers) subscribe and never touch the store.

export type HitKind = 'hit' | 'kill' | 'playerHit';

export interface HitEvent {
  kind: HitKind;
  position: [number, number, number];
  damage: number;
  heavy: boolean;
  targetId?: number;
}

// A basic attack rolls 0.8-1.2x of attackPower; anything above this is a skill-sized blow.
const HEAVY_RATIO = 1.25;
const CHEST_HEIGHT = 0.9;

export function isHeavyHit(damage: number, attackPower: number): boolean {
  return damage > attackPower * HEAVY_RATIO;
}

interface FxMonster {
  currentHp: number;
  position: [number, number, number];
}
export interface FxState {
  player: { currentHp: number; attackPower: number };
  monsters: Record<number, FxMonster>;
}

/** Every HP loss between two store states, as events. Gains and appearing/vanishing monsters are ignored. */
export function diffHits(prev: FxState, next: FxState, playerPos: [number, number, number]): HitEvent[] {
  const events: HitEvent[] = [];
  for (const key of Object.keys(next.monsters)) {
    const id = Number(key);
    const before = prev.monsters[id];
    const after = next.monsters[id];
    if (!before || after.currentHp >= before.currentHp) continue;
    const damage = before.currentHp - after.currentHp;
    const killed = after.currentHp <= 0;
    events.push({
      kind: killed ? 'kill' : 'hit',
      position: [after.position[0], after.position[1] + CHEST_HEIGHT, after.position[2]],
      damage,
      heavy: killed || isHeavyHit(damage, next.player.attackPower),
      targetId: id,
    });
  }
  if (next.player.currentHp < prev.player.currentHp) {
    events.push({ kind: 'playerHit', position: playerPos, damage: prev.player.currentHp - next.player.currentHp, heavy: false });
  }
  return events;
}

const listeners = new Set<(e: HitEvent) => void>();

export function subscribeHit(fn: (e: HitEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitHit(e: HitEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(e);
    } catch (err) {
      // A presentation bug must never stall combat or starve the other listeners.
      console.error('[combatFx] listener failed', err);
    }
  }
}

// --- screen shake -----------------------------------------------------------------------------

const MAX_SHAKE = 0.3; // world units; ~10 units fit across the screen
const SHAKE_DECAY_PER_SEC = 14;
let shakeAmp = 0;

export function shakeAmplitude(e: HitEvent): number {
  if (e.kind === 'kill') return 0.16;
  if (e.kind === 'playerHit') return 0.12;
  return e.heavy ? 0.08 : 0;
}

export function addShake(amp: number): void {
  shakeAmp = Math.min(MAX_SHAKE, shakeAmp + amp);
}

export function resetShake(): void {
  shakeAmp = 0;
}

/** Camera offset for this frame (world units). Advances and decays the shake. */
export function sampleShake(dt: number, rand: () => number = Math.random): { x: number; y: number } {
  if (!useFxSettings.getState().shake) {
    shakeAmp = 0;
    return { x: 0, y: 0 };
  }
  shakeAmp *= Math.exp(-dt * SHAKE_DECAY_PER_SEC);
  if (shakeAmp < 0.002) {
    shakeAmp = 0;
    return { x: 0, y: 0 };
  }
  return { x: (rand() * 2 - 1) * shakeAmp, y: (rand() * 2 - 1) * shakeAmp };
}

// --- store watcher ----------------------------------------------------------------------------

// A ranged class's damage lands in the store instantly but its projectile arrives later; monster
// events wait this long so sparks/flash line up with the visible impact. CharacterMesh sets it.
let hitLeadMs = 0;
export function setHitLeadMs(ms: number): void {
  hitLeadMs = ms;
}

/** Start turning combatStore HP losses into HitEvents. Returns the stop function. */
export function startCombatFxWatcher(): () => void {
  let prev = useCombatStore.getState() as FxState;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unsubscribe = useCombatStore.subscribe((state) => {
    const next = state as FxState;
    const events = diffHits(prev, next, [playerPosition.x, 1, playerPosition.z]);
    prev = next;
    for (const e of events) {
      if (e.kind === 'playerHit' || hitLeadMs <= 0) {
        emitHit(e);
        continue;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        emitHit(e);
      }, hitLeadMs);
      timers.add(timer);
    }
  });
  return () => {
    unsubscribe();
    timers.forEach(clearTimeout);
    timers.clear();
  };
}
