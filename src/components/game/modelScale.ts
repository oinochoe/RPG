import * as THREE from 'three';

// Model files come in whatever size their artist exported them (a Cactoro is ~6x taller than the
// height we show it at), so every character/monster/NPC is scaled to a target height.
//
// That scale is computed here, from the loaded model itself, and handed to the group as a plain
// `scale` prop — so the very first frame is already the right size. Two earlier approaches went
// wrong: measuring in a normal effect drew one frame at the raw file size (a huge flash), and
// measuring in a layout effect measured a model whose bones hadn't been positioned yet (some
// monsters came out ~100x too small) and never ran at all for NPCs, whose scaled group belongs to
// a parent whose ref isn't attached yet.

const HEIGHT_CACHE = new WeakMap<THREE.Object3D, number>();

/**
 * Height of a model in its own units, in its bind pose. Independent of where (or whether) the model
 * sits in the scene, and of the outline copies added by outline.tsx, which would only repeat it.
 */
export function modelHeight(root: THREE.Object3D): number {
  const cached = HEIGHT_CACHE.get(root);
  if (cached !== undefined) return cached;

  // Bones must have their world matrices before a skinned mesh can be measured.
  root.updateMatrixWorld(true);
  // Measure in the model's own frame: undo whatever its ancestors (a scaled group, a world position)
  // contribute, so the answer is the same wherever the model happens to be.
  const ancestors = root.parent ? root.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.isOutline) return;
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.skeleton.update();
      skinned.computeBoundingBox();
      part.copy(skinned.boundingBox);
    } else {
      if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
      part.copy(mesh.geometry.boundingBox!);
    }
    box.union(part.applyMatrix4(mesh.matrixWorld).applyMatrix4(ancestors));
  });

  const height = box.isEmpty() ? 0 : box.max.y - box.min.y;
  HEIGHT_CACHE.set(root, height);
  return height;
}

/** The uniform scale that shows `root` at `targetHeight` (1 if the model cannot be measured). */
export function fitScale(root: THREE.Object3D, targetHeight: number): number {
  const height = modelHeight(root);
  return height > 0 ? targetHeight / height : 1;
}
