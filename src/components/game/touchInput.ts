/**
 * Virtual joystick state, shared with CharacterMesh's per-frame movement the same way
 * moveTarget/playerTransform are — a plain mutable object rather than React state so a
 * finger dragging the stick never re-renders the 3D scene 60 times a second.
 *
 * x is screen-right positive, y is screen-UP positive, each within [-1, 1] with a total
 * magnitude <= 1. (0, 0) means "not pushing".
 */
export const stick = { x: 0, y: 0 };

const DEAD_ZONE = 0.2;

/** Knob offset from the stick's center (px, screen coords: y grows downward) -> stick value. */
export function computeStick(offsetX: number, offsetY: number, radius: number): { x: number; y: number } {
  const dist = Math.hypot(offsetX, offsetY);
  if (dist === 0 || radius <= 0) return { x: 0, y: 0 };
  const magnitude = Math.min(1, dist / radius);
  if (magnitude < DEAD_ZONE) return { x: 0, y: 0 };
  return { x: (offsetX / dist) * magnitude, y: (-offsetY / dist) * magnitude };
}

/** True while the stick is pushed past its dead zone. */
export function isStickActive(): boolean {
  return stick.x !== 0 || stick.y !== 0;
}

/**
 * Stick value -> world-space (x, z) direction, using the camera's screen basis (the camera
 * sits at a diagonal, so screen-up isn't world -Z — see CharacterMesh's FORWARD/RIGHT).
 */
export function stickToWorldDir(
  sx: number,
  sy: number,
  forward: readonly [number, number],
  right: readonly [number, number],
): [number, number] {
  return [right[0] * sx + forward[0] * sy, right[1] * sx + forward[1] * sy];
}

export function resetStick(): void {
  stick.x = 0;
  stick.y = 0;
}
