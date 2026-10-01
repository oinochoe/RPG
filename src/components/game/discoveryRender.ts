import type { DiscoveryDef } from './discoveries';
import { isAvailable, type DiscoveryContext } from './discoveryLogic';

/** Only discoveries this close to the player get meshes. */
export const RENDER_RADIUS = 60;

/** Discoveries to draw now: near the player, requirements met, and either a prop or a hidden NPC. */
export function selectRenderable(defs: readonly DiscoveryDef[], x: number, z: number, ctx: DiscoveryContext): DiscoveryDef[] {
  return defs.filter(
    (d) =>
      (d.prop !== 'none' || d.kind === 'npc') &&
      Math.hypot(x - d.position[0], z - d.position[1]) <= RENDER_RADIUS &&
      isAvailable(d, ctx),
  );
}

/** Discoveries to mark on the maps: everything except hidden ones not yet seen. */
export function selectMapMarkers(defs: readonly DiscoveryDef[], seen: ReadonlySet<string>): DiscoveryDef[] {
  return defs.filter((d) => !d.hidden || seen.has(d.id));
}

/** Trigger discoveries the player has just walked into: inside radius, available, unseen, not yet fired. */
export function selectTriggered(
  defs: readonly DiscoveryDef[],
  x: number,
  z: number,
  ctx: DiscoveryContext,
  fired: ReadonlySet<string>,
): DiscoveryDef[] {
  return defs.filter(
    (d) =>
      d.kind === 'trigger' &&
      !fired.has(d.id) &&
      !ctx.seen.has(d.id) &&
      Math.hypot(x - d.position[0], z - d.position[1]) <= d.radius &&
      isAvailable(d, ctx),
  );
}
