import { useMemo } from 'react';
import { useGLTF as dreiUseGLTF } from '@react-three/drei';
import { toonify } from './toon';
import { addOutlines } from './outline';

export interface ToonGltfOptions {
  /** Draw a storybook outline around the model (characters, monsters, NPCs). Environment props: no. */
  outline?: boolean;
}

/**
 * drei's useGLTF, plus a one-time swap of the model's PBR materials for toon ones (and, when asked,
 * an outline). Use this instead of drei's everywhere a model is loaded so the whole world shares one
 * look. (`preload` is drei's own: it fills the same cache, and the swap happens the first time a
 * component actually reads the scene.)
 */
export function useGLTF(path: string, options: ToonGltfOptions = {}) {
  const gltf = dreiUseGLTF(path);
  const outline = options.outline === true;
  useMemo(() => {
    toonify(gltf.scene);
    if (outline) addOutlines(gltf.scene);
  }, [gltf.scene, outline]);
  return gltf;
}
useGLTF.preload = dreiUseGLTF.preload;
