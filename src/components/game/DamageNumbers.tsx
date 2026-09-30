import { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { subscribeHit } from './combatFx';
import { MAX_NUMBERS, numberSpec, pushCapped, type NumberSpec } from './damageNumberSpec';

const LIFETIME_MS = 700;

interface FloatNumber extends NumberSpec {
  id: number;
  position: [number, number, number];
}

/** Every damage number in the game — monster hits, kills and damage taken — from the HitEvent bus. */
export function DamageNumbers() {
  const [numbers, setNumbers] = useState<FloatNumber[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = subscribeHit((e) => {
      const id = nextId.current++;
      // Small horizontal jitter so numbers from an AoE do not stack exactly on top of each other.
      const jitter = (Math.random() - 0.5) * 0.5;
      const item: FloatNumber = { id, ...numberSpec(e), position: [e.position[0] + jitter, e.position[1] + 0.7, e.position[2]] };
      setNumbers((prev) => pushCapped(prev, item, MAX_NUMBERS));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setNumbers((prev) => prev.filter((n) => n.id !== id));
      }, LIFETIME_MS);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      {numbers.map((n) => (
        <Html key={n.id} position={n.position} center>
          <div
            className="font-display"
            style={{
              color: n.color,
              fontSize: n.fontSize,
              WebkitTextStroke: '4px var(--color-ink)',
              paintOrder: 'stroke fill',
              pointerEvents: 'none',
              animation: `rpg-dmg-float ${LIFETIME_MS}ms ease-out forwards`,
            }}
          >
            {n.text}
          </div>
        </Html>
      ))}
    </>
  );
}
