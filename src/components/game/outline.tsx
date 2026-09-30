import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { THEME } from '../../lib/theme';

// Storybook outlines for characters, monsters and NPCs, drawn as an "inverted hull": a second copy of
// each mesh, back faces only, pushed outward along its normals by a fixed number of screen pixels. The
// part of that copy that peeks out behind the real mesh is the outline. (Environment props get none —
// outlining every tree and tuft would cost far more than it adds.)

/** Line width in CSS pixels, the same on every screen size. */
export const OUTLINE_PX = 2;

// One uniform shared by every outline material: how far (in clip-space units) 1 pixel is on each axis.
const shared = { value: new THREE.Vector2(0.003, 0.003) };

/** Call when the canvas resizes so the line stays ~OUTLINE_PX wide. */
export function setOutlineViewport(widthPx: number, heightPx: number): void {
  if (widthPx > 0 && heightPx > 0) shared.value.set((2 * OUTLINE_PX) / widthPx, (2 * OUTLINE_PX) / heightPx);
}

/**
 * A class rather than a patched instance so `material.clone()` — which the tint code does to give
 * elites their own color — keeps the shader change (clone() re-creates it through the constructor).
 */
export class OutlineMaterial extends THREE.MeshBasicMaterial {
  constructor() {
    super({ color: new THREE.Color(THEME.color.ink), side: THREE.BackSide });
  }

  onBeforeCompile(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string }): void {
    shader.uniforms.uOutline = shared;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uOutline;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec3 vn = normalize(normalMatrix * normal);
          vec2 d = (projectionMatrix * vec4(vn, 0.0)).xy;
          float len = length(d);
          if (len > 0.0001) gl_Position.xy += (d / len) * uOutline * gl_Position.w;
        }`,
      );
  }

  customProgramCacheKey(): string {
    return 'rpg-outline';
  }
}

const MARK = '__outlined';

function needsNoOutline(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  // Cut-out or see-through parts (flames, glass) would get a solid silhouette they should not have.
  return materials.some((m) => m.transparent || m.alphaTest > 0);
}

/** Adds an outline copy next to every mesh under `root`. Idempotent per root. */
export function addOutlines(root: THREE.Object3D): void {
  if (root.userData[MARK]) return;
  root.userData[MARK] = true;

  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.isOutline && !needsNoOutline(mesh)) targets.push(mesh);
  });

  const material = new OutlineMaterial();
  for (const mesh of targets) {
    if (!mesh.parent) continue;
    const skinned = mesh as THREE.SkinnedMesh;
    let outline: THREE.Mesh;
    if (skinned.isSkinnedMesh) {
      const o = new THREE.SkinnedMesh(mesh.geometry, material);
      o.bind(skinned.skeleton, skinned.bindMatrix);
      outline = o;
    } else {
      outline = new THREE.Mesh(mesh.geometry, material);
    }
    outline.name = `${mesh.name}_outline`;
    outline.userData.isOutline = true;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    outline.renderOrder = mesh.renderOrder;
    outline.frustumCulled = mesh.frustumCulled;
    // The character/monster code marks every mesh it finds as a shadow caster; an outline must not
    // cast a second shadow, so that flag is pinned off.
    Object.defineProperty(outline, 'castShadow', { get: () => false, set: () => undefined });
    mesh.parent.add(outline);
  }
}

/** Mount once inside the Canvas: keeps outline width constant when the window is resized. */
export function OutlineViewport(): null {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useEffect(() => setOutlineViewport(width, height), [width, height]);
  return null;
}
