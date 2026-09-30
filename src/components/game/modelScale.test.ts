import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitScale, modelHeight } from './modelScale';

function box(w: number, h: number, d: number, y = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  mesh.position.y = y;
  return mesh;
}

describe('modelHeight', () => {
  it('measures the height of a plain mesh', () => {
    const root = new THREE.Group();
    root.add(box(2, 3, 1));
    expect(modelHeight(root)).toBeCloseTo(3, 6);
  });

  it('covers every part of the model, including offset ones', () => {
    const root = new THREE.Group();
    root.add(box(1, 1, 1, 0.5)); // spans 0..1
    root.add(box(1, 1, 1, 2.5)); // spans 2..3
    expect(modelHeight(root)).toBeCloseTo(3, 6);
  });

  it('ignores outline copies, which only repeat the model', () => {
    const root = new THREE.Group();
    root.add(box(1, 2, 1));
    const outline = box(1, 50, 1);
    outline.userData.isOutline = true;
    root.add(outline);
    expect(modelHeight(root)).toBeCloseTo(2, 6);
  });

  it('does not depend on where the model sits in the scene', () => {
    const root = new THREE.Group();
    root.add(box(1, 2, 1));
    const parent = new THREE.Group();
    parent.scale.setScalar(5);
    parent.position.set(100, 40, -30);
    parent.add(root);
    parent.updateMatrixWorld(true);
    expect(modelHeight(root)).toBeCloseTo(2, 6);
  });

  it('measures a skinned mesh by its bind pose even before its bones were ever positioned', () => {
    // A bone far from the origin: if bone matrices were stale the vertices would land ~10 units away
    // and the model would read as absurdly tall (the ~100x-too-small monsters this guards against).
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.position.set(0, 10, 0);
    root.add(bone);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([bone]);

    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const count = geometry.attributes.position.count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(skinned);
    skinned.bind(skeleton);

    // A clone that never went through a render has identity world matrices on its bones.
    const fresh = root.clone(true);
    expect(modelHeight(fresh)).toBeCloseTo(2, 5);
  });

  it('remembers the answer for a model', () => {
    const root = new THREE.Group();
    const mesh = box(1, 2, 1);
    root.add(mesh);
    expect(modelHeight(root)).toBeCloseTo(2, 6);
    mesh.scale.y = 10; // later changes are not re-measured: one measurement per loaded model
    expect(modelHeight(root)).toBeCloseTo(2, 6);
  });
});

describe('fitScale', () => {
  it('scales a model to the target height', () => {
    const root = new THREE.Group();
    root.add(box(1, 3.834, 1));
    expect(fitScale(root, 0.65)).toBeCloseTo(0.65 / 3.834, 6);
  });

  it('is 1 for a model that cannot be measured', () => {
    expect(fitScale(new THREE.Group(), 0.9)).toBe(1);
  });
});
