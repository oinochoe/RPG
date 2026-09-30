import * as THREE from 'three';

// Cel shading for the 3D world. MeshToonMaterial quantizes the light into a few flat bands instead of
// a smooth falloff; the bands below stay bright (the darkest is still ~55%) so shadows read as a soft
// tint, not a black hole — the bright, storybook look the UI now has.

/** Brightness of each band, dark to light. Kept high on purpose (see above). */
export const TOON_BANDS = [140, 205, 255];

let gradient: THREE.DataTexture | null = null;

/** The shared band lookup texture (one per page). NearestFilter is what makes the bands hard-edged. */
export function getToonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array(TOON_BANDS), TOON_BANDS.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

function isLitStandard(m: THREE.Material): m is THREE.MeshStandardMaterial {
  return (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
}

/** A toon copy of a PBR material: same color, texture, transparency and emission. */
export function toToonMaterial(source: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
  const toon = new THREE.MeshToonMaterial({
    name: source.name,
    color: source.color.clone(),
    map: source.map,
    alphaMap: source.alphaMap,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    alphaTest: source.alphaTest,
    vertexColors: source.vertexColors,
    emissive: source.emissive.clone(),
    emissiveIntensity: source.emissiveIntensity,
    emissiveMap: source.emissiveMap,
    gradientMap: getToonGradient(),
  });
  toon.userData = { ...source.userData };
  return toon;
}

const MARK = '__toonified';

/**
 * Swaps every PBR material under `root` for a toon one, in place. Idempotent per root — the GLTF
 * cache hands the same scene to every consumer, and each consumer clones from it afterwards (clones
 * share materials), so converting the cached original once converts everyone.
 */
export function toonify(root: THREE.Object3D): void {
  if (root.userData[MARK]) return;
  root.userData[MARK] = true;
  const converted = new Map<THREE.Material, THREE.Material>();
  const convert = (m: THREE.Material): THREE.Material => {
    if (!isLitStandard(m)) return m;
    let toon = converted.get(m);
    if (!toon) {
      toon = toToonMaterial(m);
      converted.set(m, toon);
    }
    return toon;
  };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  // The originals are unreferenced now; free their GPU-side programs (textures are shared, so kept).
  converted.forEach((_, original) => original.dispose());
}
