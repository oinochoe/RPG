import { Html } from '@react-three/drei';

// The label floating above a character, monster or NPC: a cream pill so it reads on any terrain, with
// a dot in the given accent color (class/monster/NPC kind).
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
      <div className="pointer-events-none -translate-y-2.5 flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border-[2.5px] border-edge bg-cream/95 px-2.5 py-0.5 text-[13px] font-bold leading-5 text-ink shadow-chunk-sm">
        <span className="size-2 shrink-0 rounded-full border border-edge/60" style={{ background: accent }} />
        {label}
      </div>
    </Html>
  );
}
