import { Html } from '@react-three/drei';

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
      <div
        style={{
          width: 46,
          height: 6,
          borderRadius: 3,
          background: 'rgba(0, 0, 0, 0.55)',
          border: '1px solid rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: `${clamped * 100}%`,
            height: '100%',
            background: color,
            transition: 'width 150ms ease-out',
          }}
        />
      </div>
    </Html>
  );
}
