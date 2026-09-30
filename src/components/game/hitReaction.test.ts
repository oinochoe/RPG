import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFlash } from './hitReaction';

function model(shared: THREE.MeshToonMaterial) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared));
  const outline = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  outline.userData.isOutline = true;
  root.add(outline);
  return { root, body: root.children[0] as THREE.Mesh, outline };
}

describe('createFlash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lights the body up, then restores its emissive', () => {
    const { root, body } = model(new THREE.MeshToonMaterial());
    const f = createFlash(root);
    f.flash(60);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0xffffff);
    vi.advanceTimersByTime(61);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
  });

  it('does not touch the material shared with other instances of the same model', () => {
    const shared = new THREE.MeshToonMaterial();
    const a = model(shared);
    const b = model(shared);
    createFlash(a.root).flash(60);
    expect(shared.emissive.getHex()).toBe(0x000000);
    expect((b.body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
    expect(a.body.material).not.toBe(shared);
  });

  it('leaves outline meshes alone', () => {
    const { root, outline } = model(new THREE.MeshToonMaterial());
    const before = outline.material;
    createFlash(root).flash(60);
    expect(outline.material).toBe(before);
  });

  it('a second flash restarts the timer instead of stacking', () => {
    const { root, body } = model(new THREE.MeshToonMaterial());
    const f = createFlash(root);
    f.flash(60);
    vi.advanceTimersByTime(40);
    f.flash(60);
    vi.advanceTimersByTime(40);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0xffffff);
    vi.advanceTimersByTime(30);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
  });

  it('dispose restores at once and a pending timer cannot fire afterwards', () => {
    const { root, body } = model(new THREE.MeshToonMaterial());
    const f = createFlash(root);
    f.flash(60);
    f.dispose();
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
  });

  it('ignores materials without an emissive channel', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    expect(() => createFlash(root).flash(60)).not.toThrow();
  });
});
