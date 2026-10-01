import type { DiscoveryDef, Requirement } from './discoveries';

export interface DiscoveryContext {
  level: number;
  seen: ReadonlySet<string>;
  /** Which zone a point is in (see worldColliders' in*Zone helpers); injected so this file stays pure. */
  zoneAt: (x: number, z: number) => string;
}

export function requirementMet(req: Requirement, ctx: DiscoveryContext, pos: [number, number]): boolean {
  switch (req.type) {
    case 'level':
      return ctx.level >= req.min;
    case 'seen':
      return ctx.seen.has(req.id);
    case 'zone':
      return ctx.zoneAt(pos[0], pos[1]) === req.zone;
  }
}

export function isAvailable(def: DiscoveryDef, ctx: DiscoveryContext): boolean {
  return (def.requires ?? []).every((r) => requirementMet(r, ctx, def.position));
}

export interface DiscoveryGrid {
  cell: number;
  cells: Map<string, DiscoveryDef[]>;
}

const key = (cx: number, cz: number) => `${cx},${cz}`;

export function buildGrid(defs: readonly DiscoveryDef[], cell = 16): DiscoveryGrid {
  const cells = new Map<string, DiscoveryDef[]>();
  for (const d of defs) {
    const k = key(Math.floor(d.position[0] / cell), Math.floor(d.position[1] / cell));
    const list = cells.get(k);
    if (list) list.push(d);
    else cells.set(k, [d]);
  }
  return { cell, cells };
}

/** Everything in the cells that could be within `maxDist` of (x, z). Callers still check exact distance. */
export function queryGrid(grid: DiscoveryGrid, x: number, z: number, maxDist: number): DiscoveryDef[] {
  const r = Math.ceil(maxDist / grid.cell);
  const cx = Math.floor(x / grid.cell);
  const cz = Math.floor(z / grid.cell);
  const out: DiscoveryDef[] = [];
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iz = cz - r; iz <= cz + r; iz++) {
      const list = grid.cells.get(key(ix, iz));
      if (list) out.push(...list);
    }
  }
  return out;
}

export const MAX_RADIUS_IN_GRID = 8;
export const MIN_TRIGGER_RADIUS = 4;

/** The nearest inspect/npc discovery whose own radius contains the player and whose requirements hold. */
export function nearestInRange(
  grid: DiscoveryGrid,
  x: number,
  z: number,
  ctx: DiscoveryContext,
  options: { skipSeen?: boolean } = {},
): DiscoveryDef | null {
  let best: DiscoveryDef | null = null;
  let bestDist = Infinity;
  for (const d of queryGrid(grid, x, z, MAX_RADIUS_IN_GRID)) {
    if (d.kind === 'trigger') continue;
    if (options.skipSeen && ctx.seen.has(d.id)) continue;
    const dist = Math.hypot(x - d.position[0], z - d.position[1]);
    if (dist > d.radius || dist >= bestDist) continue;
    if (!isAvailable(d, ctx)) continue;
    best = d;
    bestDist = dist;
  }
  return best;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Human-readable problems with a definition list; empty means it is sound. */
export function validateDefs(defs: readonly DiscoveryDef[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) problems.push(`duplicate id: ${d.id}`);
    ids.add(d.id);
    if (!ID_PATTERN.test(d.id)) problems.push(`bad id (lowercase, digits, hyphens): ${d.id}`);
    // The grid search only looks MAX_RADIUS_IN_GRID out, so a bigger radius would silently be cut short.
    if (!(Number.isFinite(d.radius) && d.radius > 0 && d.radius <= MAX_RADIUS_IN_GRID)) {
      problems.push(`${d.id}: radius must be a finite number in (0, ${MAX_RADIUS_IN_GRID}]`);
    }
    // Triggers are sampled a few times a second; a small one could be walked through between samples.
    if (d.kind === 'trigger' && d.radius < MIN_TRIGGER_RADIUS) {
      problems.push(`${d.id}: a trigger needs radius >= ${MIN_TRIGGER_RADIUS}`);
    }
    if (d.lines.length === 0 || d.lines.some((l) => l.trim() === '')) problems.push(`${d.id}: lines must be non-empty`);
    if (d.kind === 'npc' && !d.npcKind) problems.push(`${d.id}: an npc discovery needs npcKind`);
    if (d.reward) {
      const { gold, xp, itemTemplateId, itemQty } = d.reward;
      const hasAny = gold !== undefined || xp !== undefined || itemTemplateId !== undefined;
      if (!hasAny) problems.push(`${d.id}: reward is empty`);
      if (gold !== undefined && !(gold > 0)) problems.push(`${d.id}: reward gold must be positive`);
      if (xp !== undefined && !(xp > 0)) problems.push(`${d.id}: reward xp must be positive`);
      if (itemQty !== undefined && !(itemQty > 0)) problems.push(`${d.id}: reward itemQty must be positive`);
      // Mirrors the server table rule: an item reward is item-only (see validateRewardTable).
      if (itemTemplateId !== undefined && (gold !== undefined || xp !== undefined)) {
        problems.push(`${d.id}: an item reward cannot also give gold or xp`);
      }
    }
  }
  for (const d of defs) {
    for (const r of d.requires ?? []) {
      if (r.type === 'seen' && !ids.has(r.id)) problems.push(`${d.id}: requires unknown discovery ${r.id}`);
    }
  }
  // Cycle check over `seen` requirements (depth-first with a path set).
  const byId = new Map(defs.map((d) => [d.id, d]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const r of byId.get(id)?.requires ?? []) {
      if (r.type === 'seen' && byId.has(r.id) && visit(r.id)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  };
  for (const d of defs) {
    if (visit(d.id)) {
      problems.push(`cycle in seen requirements involving ${d.id}`);
      break;
    }
  }
  return problems;
}
