import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { warmSkillFxTextures } from './skillFxParts';

/**
 * Builds the lazily-created skill fx canvas textures and uploads them to the GPU once at mount,
 * so the first cast of a crescent/pillar effect doesn't pay for canvas draw + texture upload.
 * (Material shader variants are not pre-compiled: three skips invisible objects in gl.compile
 * and a hand-rolled off-screen instance would be guesswork without a profiler.)
 */
export function SkillFxWarmup() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    for (const texture of warmSkillFxTextures()) gl.initTexture(texture);
  }, [gl]);
  return null;
}
