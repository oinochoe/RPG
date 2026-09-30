import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getToonGradient, toonify, TOON_BANDS } from './toon';
import { addOutlines, OutlineMaterial, setOutlineViewport } from './outline';

function meshWith(material: THREE.Material | THREE.Material[]) {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
}

describe('getToonGradient', () => {
  it('is one shared hard-edged band texture', () => {
    const g = getToonGradient();
    expect(getToonGradient()).toBe(g);
    expect(g.minFilter).toBe(THREE.NearestFilter);
    expect(g.magFilter).toBe(THREE.NearestFilter);
    expect(g.image.width).toBe(TOON_BANDS.length);
  });

  it('keeps the darkest band bright so shadows stay soft', () => {
    expect(Math.min(...TOON_BANDS)).toBeGreaterThanOrEqual(120);
  });
});

describe('toonify', () => {
  it('swaps a PBR material for a toon one, keeping color, texture and transparency', () => {
    const map = new THREE.Texture();
    const pbr = new THREE.MeshStandardMaterial({ color: '#336699', map, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const root = new THREE.Group();
    const mesh = meshWith(pbr);
    root.add(mesh);
    toonify(root);
    const toon = mesh.material as THREE.MeshToonMaterial;
    expect(toon.isMeshToonMaterial).toBe(true);
    expect(toon.color.getHexString()).toBe('336699');
    expect(toon.map).toBe(map);
    expect(toon.transparent).toBe(true);
    expect(toon.opacity).toBe(0.5);
    expect(toon.side).toBe(THREE.DoubleSide);
    expect(toon.gradientMap).toBe(getToonGradient());
  });

  it('gives meshes that shared one material the same single toon material', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 'red' });
    const root = new THREE.Group();
    const a = meshWith(shared);
    const b = meshWith(shared);
    root.add(a, b);
    toonify(root);
    expect(a.material).toBe(b.material);
    expect((a.material as THREE.Material).type).toBe('MeshToonMaterial');
  });

  it('handles multi-material meshes and leaves non-PBR materials alone', () => {
    const basic = new THREE.MeshBasicMaterial({ color: 'white' });
    const root = new THREE.Group();
    const mesh = meshWith([new THREE.MeshStandardMaterial({ color: 'green' }), basic]);
    root.add(mesh);
    toonify(root);
    const [first, second] = mesh.material as THREE.Material[];
    expect(first.type).toBe('MeshToonMaterial');
    expect(second).toBe(basic);
  });

  it('is idempotent, so a cloned scene that shares materials is not converted twice', () => {
    const root = new THREE.Group();
    const mesh = meshWith(new THREE.MeshStandardMaterial({ color: 'blue' }));
    root.add(mesh);
    toonify(root);
    const once = mesh.material;
    toonify(root);
    expect(mesh.material).toBe(once);
  });

  it('a color multiplied onto a toon material (elite tint) still works', () => {
    const root = new THREE.Group();
    const mesh = meshWith(new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    root.add(mesh);
    toonify(root);
    const tinted = (mesh.material as THREE.MeshToonMaterial).clone();
    tinted.color.multiply(new THREE.Color('#ff0000'));
    expect(tinted.color.getHexString()).toBe('ff0000');
    expect(tinted.type).toBe('MeshToonMaterial');
  });
});

describe('addOutlines', () => {
  it('adds a back-face outline copy next to each mesh', () => {
    const root = new THREE.Group();
    const mesh = meshWith(new THREE.MeshToonMaterial());
    mesh.position.set(1, 2, 3);
    root.add(mesh);
    addOutlines(root);
    const outlines = root.children.filter((c) => c.userData.isOutline) as THREE.Mesh[];
    expect(outlines).toHaveLength(1);
    expect(outlines[0].geometry).toBe(mesh.geometry);
    expect(outlines[0].position.toArray()).toEqual([1, 2, 3]);
    expect((outlines[0].material as THREE.Material).side).toBe(THREE.BackSide);
  });

  it('never casts a shadow, even when other code marks every mesh as a caster', () => {
    const root = new THREE.Group();
    root.add(meshWith(new THREE.MeshToonMaterial()));
    addOutlines(root);
    const outline = root.children.find((c) => c.userData.isOutline)!;
    outline.castShadow = true;
    expect(outline.castShadow).toBe(false);
  });

  it('shares the skeleton with a skinned mesh so the outline follows the animation', () => {
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const count = geometry.attributes.position.count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshToonMaterial());
    skinned.add(bone);
    skinned.bind(skeleton);
    const root = new THREE.Group();
    root.add(skinned);
    addOutlines(root);
    const outline = root.children.find((c) => c.userData.isOutline) as THREE.SkinnedMesh;
    expect(outline.isSkinnedMesh).toBe(true);
    expect(outline.skeleton).toBe(skeleton);
  });

  it('skips see-through parts and does not outline twice', () => {
    const root = new THREE.Group();
    root.add(meshWith(new THREE.MeshToonMaterial({ transparent: true })));
    root.add(meshWith(new THREE.MeshToonMaterial({ alphaTest: 0.5 })));
    root.add(meshWith(new THREE.MeshToonMaterial()));
    addOutlines(root);
    addOutlines(root);
    expect(root.children.filter((c) => c.userData.isOutline)).toHaveLength(1);
  });
});

describe('OutlineMaterial', () => {
  it('stays an outline material when cloned (the tint code clones materials)', () => {
    const clone = new OutlineMaterial().clone();
    expect(clone).toBeInstanceOf(OutlineMaterial);
    expect(clone.side).toBe(THREE.BackSide);
  });

  it('keeps the line about 2 css pixels wide whatever the canvas size', () => {
    // exercised through the shared uniform: 2 * px / size
    setOutlineViewport(1000, 500);
    setOutlineViewport(0, 0); // ignored
    const material = new OutlineMaterial();
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <project_vertex>' };
    material.onBeforeCompile(shader);
    const value = shader.uniforms.uOutline.value as THREE.Vector2;
    expect(value.x).toBeCloseTo(0.004, 6);
    expect(value.y).toBeCloseTo(0.008, 6);
    expect(shader.vertexShader).toContain('uniform vec2 uOutline');
  });
});
