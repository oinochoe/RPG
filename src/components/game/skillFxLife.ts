import type { SkillCastEvent, Vec3 } from './skillFx';

export type PartKind = 'flash' | 'slashArc' | 'trail' | 'orb' | 'shockwave' | 'pillar' | 'fall' | 'sparks';
export const PART_KINDS: readonly PartKind[] = ['flash', 'slashArc', 'trail', 'orb', 'shockwave', 'pillar', 'fall', 'sparks'];

/** One building block of a skill's look. Colors are hex numbers (three.js cannot read CSS variables). */
export interface FxPart {
  kind: PartKind;
  color: number;
  /** Size multiplier; for a shockwave it scales the skill's aoeRadius. */
  scale?: number;
  delayMs?: number;
  /** Overrides the kind's default lifetime. */
  durationMs?: number;
  /** Instances to make (trail/orb/fall/...), or the particle count for sparks. */
  count?: number;
  /** Gap between successive instances. */
  staggerMs?: number;
  /** Base rotation in radians (slash tilt, trail direction offset). */
  angle?: number;
  /** Extra rotation between neighbouring instances, so several trails fan out. */
  spread?: number;
  /** Where a stationary part sits; default is the caster for `cast` parts and the target for `impact` parts. */
  at?: 'from' | 'to';
}

export interface SkillFxDef {
  tier: 'normal' | 'awakening';
  cast: FxPart[];
  impact: FxPart[];
  /** Extra camera shake at the moment of impact (world units, see combatFx.addShake). */
  shake?: number;
}

export interface ActivePart {
  id: number;
  kind: PartKind;
  color: number;
  scale: number;
  startAt: number;
  durationMs: number;
  pos: Vec3;
  from: Vec3;
  to: Vec3;
  angle: number;
  count: number;
  radius: number;
}

export const MAX_ACTIVE_PARTS = 24;

const DEFAULT_DURATION: Record<PartKind, number> = {
  flash: 300,
  slashArc: 260,
  trail: 200,
  orb: 200,
  shockwave: 450,
  pillar: 500,
  fall: 350,
  sparks: 0,
};
const TRAVELLING: ReadonlySet<PartKind> = new Set(['trail', 'orb', 'fall']);
const DEFAULT_SPARKS = 8;
const DEFAULT_FALL_SCATTER = 2;
const DEFAULT_RADIUS = 1.5;

/** Turn a list of part specs into concrete, timed instances for one cast. */
export function buildParts(
  parts: FxPart[],
  e: SkillCastEvent,
  phase: 'cast' | 'impact',
  now: number,
  nextId: () => number,
  rand: () => number = Math.random,
): ActivePart[] {
  const out: ActivePart[] = [];
  const defaultAnchor = phase === 'cast' ? e.from : e.to;
  for (const part of parts) {
    const instances = part.kind === 'sparks' ? 1 : Math.max(1, part.count ?? 1);
    const duration = part.durationMs ?? (TRAVELLING.has(part.kind) && e.travelMs > 0 ? e.travelMs : DEFAULT_DURATION[part.kind]);
    const anchor = part.at === 'from' ? e.from : part.at === 'to' ? e.to : defaultAnchor;
    for (let i = 0; i < instances; i++) {
      let to = e.to;
      if (part.kind === 'fall' && instances > 1) {
        const r = e.aoeRadius ?? DEFAULT_FALL_SCATTER;
        to = [e.to[0] + (rand() * 2 - 1) * r, e.to[1], e.to[2] + (rand() * 2 - 1) * r];
      }
      const fan = instances > 1 ? (i - (instances - 1) / 2) * (part.spread ?? 0) : 0;
      out.push({
        id: nextId(),
        kind: part.kind,
        color: part.color,
        scale: part.scale ?? 1,
        startAt: now + (part.delayMs ?? 0) + i * (part.staggerMs ?? 0),
        durationMs: duration,
        pos: [anchor[0], anchor[1], anchor[2]],
        from: e.from,
        to,
        angle: (part.angle ?? 0) + fan,
        count: part.count ?? (part.kind === 'sparks' ? DEFAULT_SPARKS : 1),
        radius: e.aoeRadius ?? DEFAULT_RADIUS,
      });
    }
  }
  return out;
}

/** Append, then keep only the newest `cap` parts. */
export function capParts<T>(list: T[], add: T[], cap: number): T[] {
  const next = [...list, ...add];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Where a part is in its life at `now`. A zero-length part is done the moment it starts. */
export function partState(now: number, part: Pick<ActivePart, 'startAt' | 'durationMs'>): { started: boolean; t: number; done: boolean } {
  const started = now >= part.startAt;
  const t = part.durationMs > 0 ? Math.min(1, Math.max(0, (now - part.startAt) / part.durationMs)) : started ? 1 : 0;
  return { started, t, done: started && now >= part.startAt + part.durationMs };
}

/** Aim point rotated around the vertical axis through `from` — fans several trails out. */
export function spreadTarget(from: Vec3, to: Vec3, angle: number): Vec3 {
  if (!angle) return [to[0], to[1], to[2]];
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [from[0] + dx * c - dz * s, to[1], from[2] + dx * s + dz * c];
}
