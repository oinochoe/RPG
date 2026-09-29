export const STATUS_BAR_WIDTH = 320;

export function Bar({
  ratio,
  color,
  label,
  height = 14,
  width = STATUS_BAR_WIDTH,
}: {
  ratio: number;
  color: string;
  label: string;
  height?: number;
  width?: number;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: 4,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(232, 201, 122, 0.3)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${clamped * 100}%`, height: '100%', background: color, transition: 'width 200ms ease-out' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: '#f4f1e8',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
