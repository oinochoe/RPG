import { Html } from '@react-three/drei';

// The slim bar over a character or monster. `color` is any CSS color (see theme tokens).
export function HealthBar({
  position,
  ratio,
  color,
}: {
  position: [number, number, number];
  ratio: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <Html position={position} center>
      <div className="pointer-events-none h-2.5 w-14 overflow-hidden rounded-full border-2 border-edge bg-cream-deep">
        <div
          className="h-full rounded-full transition-[width] duration-150 ease-out"
          style={{ width: `${clamped * 100}%`, background: color }}
        />
      </div>
    </Html>
  );
}
