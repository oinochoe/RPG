import { useEffect, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { NameTag } from './NameTag';
import { HealthBar } from './HealthBar';
import { playerPosition } from './playerTransform';
import { setAttackMoveTarget, setAttackTargetOnly } from './moveTarget';
import { useCombatStore } from '../../stores/combatStore';
import type { MonsterInstanceSummary } from '../../types/api';

interface DamagePopup {
  id: number;
  amount: number;
  createdAt: number;
}

export function MonsterMesh({ monster }: { monster: MonsterInstanceSummary }) {
  const combat = useCombatStore((s) => s.monsters[monster.instance_id]);
  const attackRange = useCombatStore((s) => s.player.attackRange);
  const bodyRef = useRef<THREE.Mesh>(null);
  const seed = useRef(monster.instance_id * 0.73);
  const prevHpRef = useRef(combat?.currentHp ?? monster.current_hp);
  const [popups, setPopups] = useState<DamagePopup[]>([]);
  const basePosition: [number, number, number] = [
    monster.position_x,
    monster.position_y,
    monster.position_z,
  ];

  useEffect(() => {
    if (!combat) return;
    if (combat.currentHp < prevHpRef.current) {
      const amount = prevHpRef.current - combat.currentHp;
      const popup: DamagePopup = { id: Date.now() + Math.random(), amount, createdAt: performance.now() };
      setPopups((prev) => [...prev, popup]);
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== popup.id));
      }, 700);
    }
    prevHpRef.current = combat.currentHp;
  }, [combat?.currentHp]);

  useFrame(({ clock }) => {
    if (!bodyRef.current) return;
    const t = clock.elapsedTime * 2.4 + seed.current;
    const squash = 1 + Math.sin(t) * 0.08;
    bodyRef.current.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    bodyRef.current.position.y = 0.42 * squash - 0.05;
  });

  if (!combat || !combat.alive) return null;

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const dx = playerPosition.x - basePosition[0];
    const dz = playerPosition.z - basePosition[2];
    const dist = Math.hypot(dx, dz) || 1;
    const standoff = attackRange * 0.85;
    if (dist <= attackRange) {
      // Already in range (common for ranged classes) — attack in place instead of
      // walking to a standoff point, which could otherwise mean stepping backward.
      setAttackTargetOnly(monster.instance_id);
      return;
    }
    const standX = basePosition[0] + (dx / dist) * standoff;
    const standZ = basePosition[2] + (dz / dist) * standoff;
    setAttackMoveTarget(standX, standZ, monster.instance_id);
  }

  return (
    <group position={basePosition}>
      <mesh ref={bodyRef} castShadow onClick={handleClick}>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshStandardMaterial
          color="#8b3fae"
          emissive="#4a1868"
          emissiveIntensity={0.35}
          roughness={0.25}
          metalness={0.1}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[-0.16, 0.5, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#150017" />
      </mesh>
      <mesh position={[0.16, 0.5, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#150017" />
      </mesh>
      <NameTag
        position={[0, 1.05, 0]}
        label={`${monster.name} Lv.${monster.level}`}
        accent="#d38bf0"
      />
      <HealthBar position={[0, 0.9, 0]} ratio={combat.currentHp / combat.maxHp} color="#e0538a" />
      {popups.map((popup) => (
        <Html key={popup.id} position={[0, 1.3, 0]} center>
          <div
            style={{
              color: '#ffd54a',
              fontWeight: 700,
              fontSize: 15,
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
              animation: 'rpg-dmg-float 700ms ease-out forwards',
            }}
          >
            -{popup.amount}
          </div>
        </Html>
      ))}
    </group>
  );
}
