import { useMemo, useRef, type ComponentType } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { partState, spreadTarget, type ActivePart, type PartKind } from './skillFxLife';
import { sharedSparkPool } from './sparkPool';

export interface PartProps {
  part: ActivePart;
  onDone: () => void;
}

const FLARE_TEXTURE = '/models/kaykit-spells/textures/flare_01.png';

// Geometry is shared by every part of a kind (R3F would dispose it when a part unmounts, so each mesh
// that uses one sets dispose={null}). Materials are per part: each animates its own opacity.
const PLANE = new THREE.PlaneGeometry(1, 1);
const RING = new THREE.RingGeometry(0.84, 1, 40);

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
    <mesh ref={meshRef} position={part.pos} geometry={PLANE} dispose={null} visible={false} renderOrder={10}>
      <meshBasicMaterial ref={matRef} map={texture} color={part.color} depthTest={false} {...additive()} />
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
    <mesh ref={meshRef} position={part.pos} geometry={PLANE} dispose={null} visible={false} renderOrder={10}>
      <meshBasicMaterial ref={matRef} map={texture} color={part.color} depthTest={false} {...additive()} />
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
    mat.opacity = (1 - t) * 0.7;
  });
  return (
    <mesh ref={meshRef} position={[part.pos[0], 0.06, part.pos[2]]} rotation={[-Math.PI / 2, 0, 0]} geometry={RING} dispose={null} visible={false}>
      <meshBasicMaterial ref={matRef} color={part.color} side={THREE.DoubleSide} {...additive(0.7)} />
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

const BEAM = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); // unit radius & height, open ended; scaled per use
const ORB = new THREE.SphereGeometry(1, 12, 10);
const UP = new THREE.Vector3(0, 1, 0);

/** A glowing head flying from the caster to the (fanned) aim point, dragging a beam behind it that fades. */
function TrailPart({ part, onDone }: PartProps) {
  const beamRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null);
  const headMat = useRef<THREE.MeshBasicMaterial>(null);
  const aim = useMemo(() => spreadTarget(part.from, part.to, part.angle), [part]);
  const start = useMemo(() => new THREE.Vector3(...part.from), [part]);
  const end = useMemo(() => new THREE.Vector3(...aim), [aim]);
  const dir = useMemo(() => end.clone().sub(start), [start, end]);
  const length = useMemo(() => dir.length(), [dir]);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), [dir]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  usePartClock(part, onDone, (t, started) => {
    const beam = beamRef.current;
    const head = headRef.current;
    if (!beam || !head || !beamMat.current || !headMat.current) return;
    beam.visible = started;
    head.visible = started;
    if (!started) return;
    // The head travels the whole way during the first 85% of the life; the beam stretches behind it and then fades.
    const travel = Math.min(1, t / 0.85);
    tmp.copy(start).addScaledVector(dir, travel);
    head.position.copy(tmp);
    head.scale.setScalar(0.1 * part.scale);
    const beamLen = Math.max(0.001, length * travel);
    beam.position.copy(start).addScaledVector(dir, travel / 2);
    beam.scale.set(0.045 * part.scale, beamLen, 0.045 * part.scale);
    const fade = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
    beamMat.current.opacity = 0.75 * fade;
    headMat.current.opacity = fade;
  });

  return (
    <>
      <mesh ref={beamRef} quaternion={quat} geometry={BEAM} dispose={null} visible={false}>
        <meshBasicMaterial ref={beamMat} color={part.color} side={THREE.DoubleSide} {...additive(0.75)} />
      </mesh>
      <mesh ref={headRef} geometry={ORB} dispose={null} visible={false}>
        <meshBasicMaterial ref={headMat} color={part.color} {...additive()} />
      </mesh>
    </>
  );
}

/** A glowing ball (with a soft halo) flying caster → target; several fan out with `count`/`spread`. */
function OrbPart({ part, onDone }: PartProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const aim = useMemo(() => spreadTarget(part.from, part.to, part.angle), [part]);
  const start = useMemo(() => new THREE.Vector3(...part.from), [part]);
  const dir = useMemo(() => new THREE.Vector3(...aim).sub(start), [aim, start]);

  usePartClock(part, onDone, (t, started) => {
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo || !coreMat.current || !haloMat.current) return;
    core.visible = started;
    halo.visible = started;
    if (!started) return;
    core.position.copy(start).addScaledVector(dir, t);
    halo.position.copy(core.position);
    const pulse = 1 + 0.15 * Math.sin(t * 30);
    core.scale.setScalar(0.12 * part.scale * pulse);
    halo.scale.setScalar(0.28 * part.scale * pulse);
    const fade = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1;
    coreMat.current.opacity = fade;
    haloMat.current.opacity = 0.4 * fade;
  });

  return (
    <>
      <mesh ref={coreRef} geometry={ORB} dispose={null} visible={false}>
        <meshBasicMaterial ref={coreMat} color={0xffffff} {...additive()} />
      </mesh>
      <mesh ref={haloRef} geometry={ORB} dispose={null} visible={false}>
        <meshBasicMaterial ref={haloMat} color={part.color} {...additive(0.4)} />
      </mesh>
    </>
  );
}

// A vertical fade (opaque at the bottom, clear at the top) for light pillars, drawn once.
let fadeTexture: THREE.CanvasTexture | null = null;
function getVerticalFadeTexture(): THREE.CanvasTexture {
  if (fadeTexture) return fadeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const gradient = g.createLinearGradient(0, 64, 0, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 4, 64);
  fadeTexture = new THREE.CanvasTexture(canvas);
  return fadeTexture;
}

const PILLAR = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

/** A column of light shooting up from the ground, then thinning out. */
function PillarPart({ part, onDone }: PartProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const texture = getVerticalFadeTexture();
  const height = 4 * part.scale;
  usePartClock(part, onDone, (t, started) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    mesh.visible = started;
    if (!started) return;
    const rise = Math.min(1, t / 0.3);
    const width = 0.55 * part.scale * (1 - 0.7 * t);
    mesh.scale.set(width, Math.max(0.001, height * rise), width);
    mesh.position.y = (height * rise) / 2;
    mat.opacity = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
  });
  return (
    <mesh ref={meshRef} position={[part.pos[0], 0, part.pos[2]]} geometry={PILLAR} dispose={null} visible={false}>
      <meshBasicMaterial ref={matRef} map={texture} color={part.color} side={THREE.DoubleSide} {...additive()} />
    </mesh>
  );
}

const FALL_HEIGHT = 6;

/** Something dropping from the sky onto its target spot (a meteor when big, an arrow of the rain when small). */
function FallPart({ part, onDone }: PartProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  usePartClock(part, onDone, (t, started) => {
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo || !coreMat.current || !haloMat.current) return;
    core.visible = started;
    halo.visible = started;
    if (!started) return;
    // Accelerates as it falls (t squared), so it lands hard rather than drifting.
    const y = part.to[1] + FALL_HEIGHT * (1 - t * t);
    core.position.set(part.to[0] + (1 - t) * 0.8, y, part.to[2]);
    halo.position.copy(core.position);
    // Stretched along the fall so it reads as motion.
    core.scale.set(0.13 * part.scale, 0.3 * part.scale, 0.13 * part.scale);
    halo.scale.set(0.3 * part.scale, 0.6 * part.scale, 0.3 * part.scale);
    const fade = t < 0.92 ? 1 : 1 - (t - 0.92) / 0.08;
    coreMat.current.opacity = fade;
    haloMat.current.opacity = 0.4 * fade;
  });
  return (
    <>
      <mesh ref={coreRef} geometry={ORB} dispose={null} visible={false}>
        <meshBasicMaterial ref={coreMat} color={0xffffff} {...additive()} />
      </mesh>
      <mesh ref={haloRef} geometry={ORB} dispose={null} visible={false}>
        <meshBasicMaterial ref={haloMat} color={part.color} {...additive(0.4)} />
      </mesh>
    </>
  );
}

/** Renderer per part kind. A kind without an entry draws nothing (the root still retires it at the cap). */
export const PART_RENDERERS: Partial<Record<PartKind, ComponentType<PartProps>>> = {
  flash: FlashPart,
  slashArc: SlashArcPart,
  shockwave: ShockwavePart,
  sparks: SparksPart,
  trail: TrailPart,
  orb: OrbPart,
  pillar: PillarPart,
  fall: FallPart,
};

useTexture.preload(FLARE_TEXTURE);
