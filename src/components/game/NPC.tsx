import { useEffect, useMemo, useRef, type RefObject, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { cameraZoomFor } from './CameraRig';
import { clickToTalk } from './interactions';
import type { TalkTarget } from './moveTarget';
import { useAnimations } from '@react-three/drei';
import { useGLTF } from './toonGLTF';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { NameTag } from './NameTag';

// merchant/blacksmith/villager share the player's KayKit models and the general rig's
// retarget (no dedicated civilian/merchant asset was available in that free pack) — elder/
// townsman are real standalone CC0 character models (Quaternius, via poly.pizza) sourced
// specifically to give the flavor NPCs more than one silhouette between them (see
// public/models/quaternius-villager-*/License.txt), each with its own baked Idle clip rather
// than the shared rig.
const RETARGETED_NPC_MODEL = {
  merchant: '/models/kaykit/Characters/gltf/Ranger.glb',
  blacksmith: '/models/kaykit/Characters/gltf/Knight.glb',
  villager: '/models/kaykit/Characters/gltf/Mage.glb',
} as const;
type RetargetedNpcKind = keyof typeof RETARGETED_NPC_MODEL;

const STANDALONE_NPC_MODEL: Record<string, { url: string; idleClip: string }> = {
  townsman: { url: '/models/quaternius-villager-man/ManInSuit.glb', idleClip: 'HumanArmature|Man_Idle' },
  elder: { url: '/models/quaternius-villager-woman/Woman.glb', idleClip: 'CharacterArmature|Idle_Neutral' },
};
type StandaloneNpcKind = keyof typeof STANDALONE_NPC_MODEL;

export type NpcKind = RetargetedNpcKind | StandaloneNpcKind;

const RIG_GENERAL = '/models/kaykit/Animations/gltf/Rig_Medium/Rig_Medium_General.glb';
const TARGET_HEIGHT = 0.9;

function isStandaloneKind(kind: NpcKind): kind is StandaloneNpcKind {
  return kind in STANDALONE_NPC_MODEL;
}

function RetargetedNpcModel({ kind, modelGroupRef }: { kind: RetargetedNpcKind; modelGroupRef: RefObject<THREE.Group | null> }) {
  const characterGltf = useGLTF(RETARGETED_NPC_MODEL[kind], { outline: true });
  const generalGltf = useGLTF(RIG_GENERAL);

  const scene = useMemo(() => cloneSkeleton(characterGltf.scene), [characterGltf.scene]);
  const { actions } = useAnimations(generalGltf.animations, scene);

  useEffect(() => {
    actions['Idle_A']?.reset().fadeIn(0.2).play();
    return () => {
      actions['Idle_A']?.fadeOut(0.2);
    };
  }, [actions]);

  // Layout effect on purpose: the model file is several times larger than the size it is shown at (a
  // Cactoro is ~6x too big), so this must run before the first frame is drawn. A regular effect ran after
  // it, and a monster that had just appeared flashed at its raw file size for a frame.
  useLayoutEffect(() => {
    if (!modelGroupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    modelGroupRef.current.scale.setScalar(scale);
  }, [scene, modelGroupRef]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
  }, [scene]);

  return <primitive object={scene} />;
}

function StandaloneNpcModel({ kind, modelGroupRef }: { kind: StandaloneNpcKind; modelGroupRef: RefObject<THREE.Group | null> }) {
  const { url, idleClip } = STANDALONE_NPC_MODEL[kind];
  const gltf = useGLTF(url);
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, scene);

  useEffect(() => {
    actions[idleClip]?.reset().fadeIn(0.2).play();
    return () => {
      actions[idleClip]?.fadeOut(0.2);
    };
  }, [actions, idleClip]);

  useLayoutEffect(() => {
    if (!modelGroupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    modelGroupRef.current.scale.setScalar(scale);
  }, [scene, modelGroupRef]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
  }, [scene]);

  return <primitive object={scene} />;
}

/** A stationary villager — just idles in place, no dialogue/shop logic of its own (see
 * QuestProximity.tsx/ShopProximity.tsx for what actually reacts to standing near one). */
// Minimum radius of the tap area on screen, in CSS pixels (a comfortable fingertip).
const HIT_RADIUS_PX = 26;

export function NPC({
  position,
  name,
  kind,
  facingY = 0,
  talk,
}: {
  position: [number, number, number];
  name: string;
  kind: NpcKind;
  facingY?: number;
  /** What clicking this NPC opens. Omit for a purely decorative NPC. */
  talk?: TalkTarget;
}) {
  const modelGroupRef = useRef<THREE.Group>(null);
  const viewportWidth = useThree((s) => s.size.width);
  const hitRadius = Math.max(0.7, HIT_RADIUS_PX / cameraZoomFor(viewportWidth));

  return (
    <group position={position} rotation={[0, facingY, 0]}>
      {talk && (
        // Invisible tap target covering the whole figure: click (or tap) an NPC to talk to them.
        <mesh
          visible={false}
          position={[0, TARGET_HEIGHT / 2, 0]}
          onClick={(event) => {
            event.stopPropagation();
            clickToTalk(talk, [position[0], position[2]]);
          }}
        >
          <cylinderGeometry args={[hitRadius, hitRadius, TARGET_HEIGHT, 8]} />
          <meshBasicMaterial />
        </mesh>
      )}
      <group ref={modelGroupRef}>
        {isStandaloneKind(kind) ? (
          <StandaloneNpcModel kind={kind} modelGroupRef={modelGroupRef} />
        ) : (
          <RetargetedNpcModel kind={kind} modelGroupRef={modelGroupRef} />
        )}
      </group>
      <NameTag position={[0, TARGET_HEIGHT + 0.3, 0]} label={name} accent="var(--color-gold)" />
    </group>
  );
}

useGLTF.preload(RIG_GENERAL);
Object.values(RETARGETED_NPC_MODEL).forEach((url) => useGLTF.preload(url));
Object.values(STANDALONE_NPC_MODEL).forEach(({ url }) => useGLTF.preload(url));
