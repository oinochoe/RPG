import type { RevealStage } from './guideDiscoveries';

/** The remembered character if it is still listed, else the first one, else null. */
export function chooseDefaultCharacter(list: readonly { id: number }[], remembered: number | null): number | null {
  if (remembered !== null && list.some((c) => c.id === remembered)) return remembered;
  return list[0]?.id ?? null;
}

/** Found = ids the server says were claimed plus the ones this browser remembers seeing. */
export function mergeFound(claimed: readonly string[], seen: readonly string[]): Set<string> {
  return new Set([...claimed, ...seen]);
}

/** Stage map where every found id counts as fully revealed (stage 3). */
export function withFoundStages(stages: Record<string, RevealStage>, found: ReadonlySet<string>): Record<string, RevealStage> {
  const out = { ...stages };
  for (const id of found) out[id] = 3;
  return out;
}
