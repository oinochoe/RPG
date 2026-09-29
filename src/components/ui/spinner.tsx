// Sunny ring spinner — used wherever a plain "불러오는 중..." text line used to stand alone
// (character list load, map entry).
export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${Math.max(3, Math.round(size / 8))}px solid var(--color-cream-deep)`,
        borderTopColor: 'var(--color-gold)',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

/** Full-viewport centered spinner + label — used for a hard page-level loading gate. */
export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spinner size={40} />
      <p className="font-display text-base tracking-wide text-ink-soft">{label}</p>
    </div>
  );
}
