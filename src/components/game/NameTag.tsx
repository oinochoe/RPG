import { Html } from '@react-three/drei';

export function NameTag({
  position,
  label,
  accent,
}: {
  position: [number, number, number];
  label: string;
  accent: string;
}) {
  return (
    <Html position={position} center occlude>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 999,
          background: 'rgba(15, 17, 13, 0.72)',
          border: `1px solid ${accent}`,
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
          color: '#f4f1e8',
          fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.2,
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        {label}
      </div>
    </Html>
  );
}
