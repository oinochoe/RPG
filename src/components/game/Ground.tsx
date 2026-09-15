import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useGrassTexture } from './proceduralTextures';
import { setMoveTarget } from './moveTarget';
import { scatterDecorations, rockColliders, activeColliders, type Decoration } from './worldColliders';
import { Village, villageColliders } from './Village';
import { CaveEntrance } from './CaveEntrance';

const GROUND_SIZE = 340;

function Rocks({ decorations }: { decorations: Decoration[] }) {
  const rocks = useMemo(() => decorations.filter((d) => d.kind === 'rock'), [decorations]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    rocks.forEach((rock, i) => {
      dummy.position.set(rock.position[0], rock.scale * 0.18, rock.position[2]);
      dummy.rotation.set(0, rock.rotationY, 0);
      dummy.scale.setScalar(rock.scale * 0.3);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [rocks]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rocks.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#7c7566" roughness={0.95} flatShading />
    </instancedMesh>
  );
}

function GrassTufts({ decorations }: { decorations: Decoration[] }) {
  const tufts = useMemo(() => decorations.filter((d) => d.kind === 'tuft'), [decorations]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    tufts.forEach((tuft, i) => {
      dummy.position.set(tuft.position[0], tuft.scale * 0.25, tuft.position[2]);
      dummy.rotation.set(0, tuft.rotationY, 0);
      dummy.scale.set(tuft.scale * 0.5, tuft.scale, tuft.scale * 0.5);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [tufts]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tufts.length]} castShadow>
      <coneGeometry args={[0.22, 0.5, 5]} />
      <meshStandardMaterial color="#5fae4a" roughness={0.75} flatShading />
    </instancedMesh>
  );
}

export function Ground() {
  const grassTexture = useGrassTexture();
  const decorations = useMemo(() => scatterDecorations(), []);

  useEffect(() => {
    activeColliders.list = [...rockColliders, ...villageColliders];
  }, []);

  function handleGroundClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    setMoveTarget(event.point.x, event.point.z);
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={handleGroundClick}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial map={grassTexture} roughness={0.9} metalness={0} />
      </mesh>
      <Rocks decorations={decorations} />
      <GrassTufts decorations={decorations} />
      <Village />
      <CaveEntrance />
    </group>
  );
}
