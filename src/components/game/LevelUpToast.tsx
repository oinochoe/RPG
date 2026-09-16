import { useEffect, useRef, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';

interface Particle {
  id: number;
  left: number;
  color: string;
  delay: number;
}

const PARTICLE_COLORS = ['#e8c97a', '#57c25b', '#5b8bd5', '#e0538a', '#f4f1e8'];
const PARTICLE_COUNT = 24;
const VISIBLE_MS = 2600;

/**
 * Watches combatStore's player level and fires a brief toast + CSS confetti burst the
 * moment it increases — otherwise a level-up is silent unless the player happens to
 * open the character panel and notice unspent skill points.
 */
export function LevelUpToast() {
  const level = useCombatStore((s) => s.player.level);
  const ready = useCombatStore((s) => s.ready);
  const previousLevel = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    // The store's level starts at the default (1) before init() ever runs, so the very
    // first observed value here is just a seed, not a real level-up — otherwise any
    // character above level 1 would fire a spurious toast on every login (see
    // combatStore.ts's init()).
    if (previousLevel.current === null) {
      previousLevel.current = level;
      return;
    }
    if (level > previousLevel.current) {
      setParticles(
        Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
          id: i,
          left: Math.random() * 100,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          delay: Math.random() * 0.3,
        })),
      );
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), VISIBLE_MS);
    }
    previousLevel.current = level;
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [level, ready]);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483647, overflow: 'hidden' }}>
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: '-5%',
            left: `${p.left}%`,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: p.color,
            animation: `rpg-confetti-fall 1.8s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 22px',
          borderRadius: 10,
          background: 'rgba(15, 17, 13, 0.85)',
          border: '2px solid #e8c97a',
          color: '#e8c97a',
          fontWeight: 700,
          fontSize: 16,
          animation: 'rpg-levelup-pop 0.4s ease-out',
        }}
      >
        레벨업! 스탯 포인트를 배분하세요.
      </div>
      <style>{`
        @keyframes rpg-confetti-fall {
          from { transform: translateY(0) rotate(0deg); opacity: 1; }
          to { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
        @keyframes rpg-levelup-pop {
          from { transform: translateX(-50%) scale(0.6); opacity: 0; }
          to { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
