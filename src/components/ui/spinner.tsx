// Gold ring spinner matching the game's parchment/gold palette — used wherever a plain
// "불러오는 중..." text line used to stand alone (character list load, map entry).
export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${Math.max(2, Math.round(size / 9))}px solid rgba(232, 201, 122, 0.18)`,
        borderTopColor: '#e8c97a',
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
      <p className="text-sm tracking-wide text-gold-dim">{label}</p>
    </div>
  );
}
