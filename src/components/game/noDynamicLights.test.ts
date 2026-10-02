import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Adding/removing a three.js light changes the light count, which changes the shader program
// key of EVERY lit material in the scene and triggers a recompile storm (a visible hitch).
// Short-lived effects must therefore fake glow with additive emissive geometry, never <pointLight>.
// Static scenery lights (Village, Dungeon...) stay mounted for a whole area and are fine.
const FILES = [
  'Projectile.tsx',
  'skillFxParts.tsx',
  'SkillFxRoot.tsx',
  'HitSparks.tsx',
  'DamageNumbers.tsx',
  'ItemDropMesh.tsx',
];

describe('dynamic effects do not use lights', () => {
  for (const file of FILES) {
    it(`${file} has no <pointLight`, () => {
      const src = readFileSync(join(__dirname, file), 'utf-8');
      expect(src).not.toMatch(/<(pointLight|spotLight|rectAreaLight)/);
    });
  }
});
