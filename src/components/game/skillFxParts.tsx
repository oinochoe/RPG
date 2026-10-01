import { useRef, type ComponentType } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { partState, type ActivePart, type PartKind } from './skillFxLife';
import { sharedSparkPool } from './sparkPool';

export interface PartProps {
  part: ActivePart;
  onDone: () => void;
}

const FLARE_TEXTURE = '/models/kaykit-spells/textures/flare_01.png';

// Geometry is shared by every part of a kind (R3F would dispose it when a part unmounts, so each mesh
// that uses one sets dispose={null}). Materials are per part: each animates its own opacity.
const PLANE = new THREE.PlaneGeometry(1, 1);
const RING = new THREE.RingGeometry(0.7, 1, 40);

/** Runs `update` every frame with the part's progress, then retires the part when its life is over. */
function usePartClock(part: ActivePart, onDone: () => void, update: (t: number, started: boolean) => void) {
  const finished = useRef(false);
  useFrame(() => {
    if (finished.current) return;
    const { started, t, done } = partState(performance.now(), part);
    update(t, started);
    if (done) {
      finished.current = true;
      onDone();
    }
  });
}

function additive(opacity = 1): THREE.MeshBasicMaterialParameters {
  return { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
}

// A bright crescent drawn once on a canvas: a filled disc with an offset disc cut out of it.
let crescentTexture: THREE.CanvasTexture | null = null;
function getCrescentTexture(): THREE.CanvasTexture {
  if (crescentTexture) return crescentTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.shadowColor = '#ffffff';
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(82, 64, 50, 0, Math.PI * 2);
  g.fill();
  crescentTexture = new THREE.CanvasTexture(canvas);
  crescentTexture.colorSpace = THREE.SRGBColorSpace;
  return crescentTexture;
}

/** A camera-facing flare that pops and fades — the cast/impact "flash". */
function FlashPart({ part, onDone }: PartProps) {
  const texture = useTexture(FLARE_TEXTURE);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const camera = useThree((s) => s.camera);
  usePartClock(part, onDone, (t, started) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    mesh.visible = started;
    if (!started) return;
    const grow = Math.min(1, t / 0.3);
    mesh.scale.setScalar(1.6 * part.scale * (0.5 + 0.5 * grow));
    mesh.quaternion.copy(camera.quaternion);
    mat.opacity = 1 - t;
  });
  return (
    <mesh ref={meshRef} position={part.pos} geometry={PLANE} dispose={null} visible={false}>
      <meshBasicMaterial ref={matRef} map={texture} color={part.color} {...additive()} />
    </mesh>
  );
}

/** A crescent that swells and sweeps — the warrior's slash. Faces the camera so it reads on the angled view. */
function SlashArcPart({ part, onDone }: PartProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const camera = useThree((s) => s.camera);
  const texture = getCrescentTexture();
  usePartClock(part, onDone, (t, started) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    mesh.visible = started;
    if (!started) return;
    const ease = 1 - (1 - t) * (1 - t);
    mesh.scale.setScalar(2.2 * part.scale * (0.7 + 0.4 * ease));
    mesh.quaternion.copy(camera.quaternion);
    mesh.rotateZ(part.angle + (t - 0.5) * 1.2);
    mat.opacity = 1 - t * t;
  });
  return (
    <mesh ref={meshRef} position={part.pos} geometry={PLANE} dispose={null} visible={false}>
      <meshBasicMaterial ref={matRef} map={texture} color={part.color} {...additive()} />
    </mesh>
  );
}

/** A ring expanding along the ground out to the skill's real area — what an AoE hits. */
function ShockwavePart({ part, onDone }: PartProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  usePartClock(part, onDone, (t, started) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    mesh.visible = started;
    if (!started) return;
    mesh.scale.setScalar(part.radius * part.scale * (0.15 + 0.85 * t));
    mat.opacity = (1 - t) * 0.85;
  });
  return (
    <mesh ref={meshRef} position={[part.pos[0], 0.06, part.pos[2]]} rotation={[-Math.PI / 2, 0, 0]} geometry={RING} dispose={null} visible={false}>
      <meshBasicMaterial ref={matRef} color={part.color} side={THREE.DoubleSide} {...additive(0.85)} />
    </mesh>
  );
}

/** Not a mesh: throws a burst of sparks into the shared pool the moment it starts. */
function SparksPart({ part, onDone }: PartProps) {
  const fired = useRef(false);
  usePartClock(part, onDone, (_t, started) => {
    if (!started || fired.current) return;
    fired.current = true;
    sharedSparkPool.spawn(part.pos, part.count, 3.5 * part.scale, 0.45, 0.1 * Math.min(1.8, part.scale), part.color);
  });
  return null;
}

/** Renderer per part kind. A kind without an entry draws nothing (the root still retires it at the cap). */
export const PART_RENDERERS: Partial<Record<PartKind, ComponentType<PartProps>>> = {
  flash: FlashPart,
  slashArc: SlashArcPart,
  shockwave: ShockwavePart,
  sparks: SparksPart,
};

useTexture.preload(FLARE_TEXTURE);
