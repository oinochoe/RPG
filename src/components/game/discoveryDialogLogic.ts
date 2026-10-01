import type { DiscoveryDef, DiscoveryReward } from './discoveries';

export type DialogPhase =
  | { step: 'lines'; index: number; /** Set when re-reading an already-seen discovery: shorter lines, no reward step. */ seen?: true }
  | { step: 'reward'; status: 'idle' | 'pending' | 'done' | 'failed' | 'already' };

/** What to show: the full script the first time, afterLines (or just the last line) once seen. */
export function linesFor(def: DiscoveryDef, alreadySeen: boolean): string[] {
  if (!alreadySeen) return def.lines;
  return def.afterLines ?? [def.lines[def.lines.length - 1]];
}

export function startPhase(_def: DiscoveryDef, alreadySeen: boolean): DialogPhase {
  return alreadySeen ? { step: 'lines', index: 0, seen: true } : { step: 'lines', index: 0 };
}

/** Next line; past the last one go to the reward step (first time, with a reward) or straight to done. */
export function advance(def: DiscoveryDef, phase: DialogPhase): DialogPhase {
  if (phase.step !== 'lines') return phase;
  const lines = linesFor(def, phase.seen === true);
  if (phase.index < lines.length - 1) return { ...phase, index: phase.index + 1 };
  if (def.reward && !phase.seen) return { step: 'reward', status: 'idle' };
  return { step: 'reward', status: 'done' };
}

/** Name of the item the player gets: the per-class name when the reward has one, else the generic name. */
export function rewardItemName(reward: DiscoveryReward | undefined, characterClass: 'warrior' | 'mage' | 'archer' | undefined): string | undefined {
  return (characterClass ? reward?.itemNameByClass?.[characterClass] : undefined) ?? reward?.itemName;
}
