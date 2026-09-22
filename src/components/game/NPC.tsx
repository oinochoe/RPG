import { useEffect, useMemo, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { NameTag } from './NameTag';

const NPC_MODEL = {
  merchant: '/models/kaykit/Characters/gltf/Ranger.glb',
  blacksmith: '/models/kaykit/Characters/gltf/Knight.glb',
  // Flavor-only villagers (no shop interaction, just presence) reuse the Mage model for a
  // third silhouette instead of duplicating merchant/blacksmith's look everywhere.
  villager: '/models/kaykit/Characters/gltf/Mage.glb',
} as const;
export type NpcKind = keyof typeof NPC_MODEL;

const RIG_GENERAL = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_General.glb';
const TARGET_HEIGHT = 0.9;

/**
 * A stationary villager reusing the player's KayKit character models (no dedicated
 * civilian/merchant asset was available in the free pack) — just idles in place, no
 * dialogue/shop logic yet. Stands in for "someone is here" until a real NPC/shop system
 * exists.
 */
export function NPC({
  position,
  name,
  kind,
  facingY = 0,
}: {
  position: [number, number, number];
  name: string;
  kind: NpcKind;
  facingY?: number;
}) {
  const modelGroupRef = useRef<THREE.Group>(null);
  const characterGltf = useGLTF(NPC_MODEL[kind]);
  const generalGltf = useGLTF(RIG_GENERAL);

  const scene = useMemo(() => cloneSkeleton(characterGltf.scene), [characterGltf.scene]);
  const { actions } = useAnimations(generalGltf.animations, scene);

  useEffect(() => {
    actions['Idle_A']?.reset().fadeIn(0.2).play();
    return () => {
      actions['Idle_A']?.fadeOut(0.2);
    };
  }, [actions]);

  useEffect(() => {
    if (!modelGroupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    modelGroupRef.current.scale.setScalar(scale);
  }, [scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
  }, [scene]);

  return (
    <group position={position} rotation={[0, facingY, 0]}>
      <group ref={modelGroupRef}>
        <primitive object={scene} />
      </group>
      <NameTag position={[0, TARGET_HEIGHT + 0.3, 0]} label={name} accent="#e8c97a" />
    </group>
  );
}

useGLTF.preload(RIG_GENERAL);
Object.values(NPC_MODEL).forEach((url) => useGLTF.preload(url));
