/** A plain x/y/z holder instead of THREE.Vector3: the (non-3D) stores import this module,
 * and pulling three.js in through here would drag it into the login/character-select bundle. */
export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}

/** Mutated every frame by CharacterMesh, read every frame by CameraRig. Avoids routing
 * 60fps position updates through React state/props. */
export const playerPosition = new Vec3();

/** Same pattern, for the character's current facing angle (radians, atan2(dx,dz) convention
 * — see CharacterMesh's own `facing` ref) — WorldMap.tsx polls this to point the minimap's
 * player marker in the direction the character is actually facing, not just its position. */
export const playerFacing = { radians: 0 };

/** Set by CharacterMesh's own stuck-detection heuristic (sustained movement intent with near-
 * zero actual displacement — see its STUCK_THRESHOLD_MS), cleared once the player actually
 * moves again or successfully uses the unstuck escape. SystemMenu polls this to gate its
 * emergency-teleport button so it can't be used as a free village-return outside that case
 * (there's already an item — 마을 귀환 주문서 — for that). */
export const playerStuck = { value: false };

const PICKUP_ANIM_DURATION_MS = 700;

/** A timestamp read every frame by CharacterMesh to hold its idle/walk animation selection on
 * the rig's 'PickUp' clip — a shared mutable rather than component-local ref/state so
 * ItemDropMesh's onClick (an in-range pickup, no walk-then-arrive step) can trigger the same
 * visual without needing CharacterMesh's own closures, the same reasoning as playerStuck. */
export const pickupAnimUntil = { value: 0 };

/** Called right after a confirmed pickup (F5, an in-range click, or arriving at a clicked
 * drop) — see pickupAnimUntil's own comment. */
export function triggerPickupAnim(): void {
  pickupAnimUntil.value = performance.now() + PICKUP_ANIM_DURATION_MS;
}
