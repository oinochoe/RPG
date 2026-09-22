// Shared SVG marker pieces for both WorldMap.tsx (the full M-key map) and MiniMap.tsx (the
// always-on corner map) — split out so the two don't duplicate the same hand-verified icon
// path strings (see the session notes on why these were byte-verified against game-icons.net
// rather than hand-transcribed).

// Single-path icons from game-icons.net (CC BY 3.0 — Lorc/Delapouite/badges, credited in
// SystemMenu alongside the item icons). viewBox 0 0 512 512 unless noted; nested <svg> scales
// each one down to world-unit size without needing to hand-tune a transform.
export const ICON_PATH = {
  // delapouite/family-house.svg
  house:
    'M55.379 25l-28.4 142H172.27L256 83.271 339.729 167H485.02l-28.4-142zM256 108.727L179.729 185H41v302h158v-87c0-18.25 7.166-33.077 18.021-42.727C227.877 347.624 242 343 256 343s28.123 4.624 38.979 14.273C305.834 366.923 313 381.75 313 400v87h158V185H332.271zm0 38.544l57 57V297H199v-92.729zm0 25.456l-39 39V279h78v-67.271zM71 199h98v98H71zm272 0h98v98h-98zM89 217v30h62v-30zm272 0v30h62v-30zM89 265v14h62v-14zm272 0v14h62v-14zM71 359h98v98H71v-98zm272 0h98v98h-98v-98zm-87 2c-10 0-19.877 3.376-27.021 9.727C221.834 377.077 217 386.25 217 400v87h78v-87c0-13.75-4.834-22.923-11.979-29.273C275.877 364.376 266 361 256 361zM89 377v62h62v-62zm272 0v62h62v-62z',
  // delapouite/cave-entrance.svg
  cave: 'M346.951 24.582L299.193 72.34l-101.136-7.024-40.97 80.737 68.688 25.35 37.153-19.936 8.511 15.861-44.293 23.768-79.7-29.416-70.19 55.341 35.117 58.995-.375.2 13.014 21.585 29.134 2.361 55.06-35.123 9.679 15.176-60.16 38.377-44.364-3.596-18.23-30.234-56.8 30.586 33.712 61.804-33.713 40.735L18 444.177V494h170.62l-5.6-45.592a260.658 260.658 0 0 1-5.147-4.512c-4.186-3.761-5.89-5.444-8.027-7.484l-73.13 21.797-21.339-20.484 12.467-12.985 13.777 13.225 73.068-21.78 3.784 3.667s4.24 4.09 9.216 8.636l37.797-37.248 8.133 79.54 6.3-93.444 10.364 28.387 6.281-45.112 3.14-3.091-.29-.233 22.486-27.974.465-.907.188.096 11.453-14.248 14.03 11.277-9.122 11.348 67.803 34.715 27.008-9.489 22.478 17.71 22.924-12.036 8.367 15.938-33.262 17.46-23.875-18.81-24.964 8.772-9.584-4.907 39.04 87.842L383.923 494H494v-28.512L462.713 478.2l-6.776-16.678L494 446.06V211.176l-23.438-26.463-21.654-67.371-33.547 32.666-107.77-13.873-28.019-29.096 12.967-12.486 23.629 24.539 92.867 11.953 31.442-30.615-52.79-61.801zm27.53 177.74l34.177 41.428 28.863-6.56-4.136-13.59 17.22-5.243 9.77 32.098-58.543 13.307-31.377-38.033-33.086 19.853-9.262-15.436z',
  // delapouite/ladder.svg
  ladder:
    'M121 17v30h270V17H121zm16 48v46h30V65h-30zm208 0v46h30V65h-30zm-224 64v30h270v-30H121zm16 48v46h30v-46h-30zm208 0v46h30v-46h-30zm-224 64v30h270v-30H121zm16 48v46h30v-46h-30zm208 0v46h30v-46h-30zm-224 64v30h270v-30H121zm16 48v46h30v-46h-30zm208 0v46h30v-46h-30zm-224 64v30h270v-30H121z',
} as const;

/** One nested <svg> per marker — viewBox scaling handles the size math exactly, no manual
 * transform tuning. `size` is in world units (the parent svg's own coordinate space). */
export function MapIcon({
  path,
  x,
  y,
  size,
  color,
}: {
  path: string;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 512 512">
      <path d={path} fill={color} />
    </svg>
  );
}

// badges/skull.svg is its own self-colored badge (filled circle + white icon on top) rather
// than the usual background-square + white-path shape, so it gets a dedicated marker instead
// of reusing MapIcon — the outer circle's fill is the one thing recolored per use.
export function SkullMarker({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 256 256">
      <circle cx="128" cy="128" r="128" fill={color} />
      <circle stroke="#fff" strokeWidth={18} cx="128" cy="128" r="101" fill="none" />
      <path
        fill="#fff"
        d="M128 58c-32 0-64 16-64 37.838C64 154 96 142 96 142l-6 24h76l-6-24s32 12 32-52c0-16-32-32-64-32zm-26 38a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm52 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-26 34l10 26h-20l10-26zm-28 51.002v17.996h56v-17.996h-56z"
      />
    </svg>
  );
}

// A drawn (not sourced) directional arrow — simple enough that a hand-drawn shape is lower-
// risk here than another icon file, and it needs to be a shape I can rotate by an exact
// angle anyway, which a fixed icon can't do. Points "up" (north, -y in SVG's y-down space)
// at rotation 0; `facingRad` is CharacterMesh's own atan2(dx,dz) facing value, converted to
// the SVG rotation that makes the arrow visually point the same screen direction the
// character is (0 → north/up, 90° → east/right, verified against all 4 cardinal cases).
export function PlayerArrow({
  x,
  y,
  facingRad,
  size,
  color = '#57c25b',
}: {
  x: number;
  y: number;
  facingRad: number;
  size: number;
  color?: string;
}) {
  const deg = 180 - (facingRad * 180) / Math.PI;
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <circle r={size * 0.75} fill={color} opacity={0.25} />
      <polygon
        points={`0,${-size} ${size * 0.62},${size * 0.7} 0,${size * 0.35} ${-size * 0.62},${size * 0.7}`}
        fill={color}
        stroke="#f4f1e8"
        strokeWidth={size * 0.12}
        strokeLinejoin="round"
      />
    </g>
  );
}
