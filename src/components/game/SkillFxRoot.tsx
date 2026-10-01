import { useEffect, useRef, useState } from 'react';
import { addShake } from './combatFx';
import { subscribeSkillCast } from './skillFx';
import { fxFor } from './skillFxDefs';
import { MAX_ACTIVE_PARTS, buildParts, impactShakeDelayMs, capParts, type ActivePart } from './skillFxLife';
import { PART_RENDERERS } from './skillFxParts';

/** Mount once inside the Canvas: turns each skill cast into its recipe of timed visual parts. */
export function SkillFxRoot() {
  const [parts, setParts] = useState<ActivePart[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const newId = () => ++nextId.current;
    const add = (built: ActivePart[]) => setParts((prev) => capParts(prev, built, MAX_ACTIVE_PARTS));

    const off = subscribeSkillCast((e) => {
      const def = fxFor(e.skillId);
      add(buildParts(def.cast, e, 'cast', performance.now(), newId));
      const land = () => {
        add(buildParts(def.impact, e, 'impact', performance.now(), newId));
        if (def.shake) {
          const shake = def.shake;
          const delay = impactShakeDelayMs(def);
          if (delay <= 0) addShake(shake);
          else {
            const t = setTimeout(() => {
              timers.delete(t);
              addShake(shake);
            }, delay);
            timers.add(t);
          }
        }
      };
      if (e.travelMs <= 0) {
        land();
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        land();
      }, e.travelMs);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      {parts.map((part) => {
        const Renderer = PART_RENDERERS[part.kind];
        if (!Renderer) return null;
        return <Renderer key={part.id} part={part} onDone={() => setParts((prev) => prev.filter((p) => p.id !== part.id))} />;
      })}
    </>
  );
}
