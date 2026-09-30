import type { HitEvent } from './combatFx';

export const MAX_NUMBERS = 12;

export interface NumberSpec {
  text: string;
  color: string;
  fontSize: number;
}

export function numberSpec(e: HitEvent): NumberSpec {
  if (e.kind === 'playerHit') return { text: `-${e.damage}`, color: '#ff5a5a', fontSize: 22 };
  if (e.heavy) return { text: `${e.damage}`, color: '#ffd54a', fontSize: 30 };
  return { text: `${e.damage}`, color: '#ffffff', fontSize: 20 };
}

/** Append and keep only the newest `cap` entries. */
export function pushCapped<T>(list: T[], item: T, cap: number): T[] {
  const next = [...list, item];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
