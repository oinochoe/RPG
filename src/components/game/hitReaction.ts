import { useEffect } from 'react';
import * as THREE from 'three';
import { subscribeHit } from './combatFx';

const FLASH_MS = 70;
const HIT_STOP_MS = 60;
const KILL_HIT_STOP_MS = 90;
// Not zero: a fully frozen mixer looks like a crash; a crawl reads as impact weight.
const HIT_STOP_SCALE = 0.05;

interface Glow {
  material: THREE.Material & { emissive: THREE.Color };
  original: THREE.Color;
}

/**
 * White flash on a model. Materials come from the shared, cached GLTF, so the first flash gives this
 * instance its own copies — otherwise every monster of the kind would light up together.
 */
export function createFlash(root: THREE.Object3D): { flash: (ms: number) => void; dispose: () => void } {
  let glows: Glow[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function collect(): Glow[] {
    const found: Glow[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.isOutline) return;
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        if (!(m as THREE.MeshToonMaterial).emissive) return m;
        const copy = m.clone() as THREE.MeshToonMaterial;
        found.push({ material: copy, original: copy.emissive.clone() });
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
    });
    return found;
  }

  function restore() {
    glows?.forEach((g) => g.material.emissive.copy(g.original));
  }

  return {
    flash(ms) {
      glows ??= collect();
      glows.forEach((g) => g.material.emissive.set(0xffffff));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        restore();
      }, ms);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      restore();
    },
  };
}

/** Flash + hit-stop for one monster whenever a HitEvent targets it. */
export function useHitReaction(targetId: number, root: THREE.Object3D, mixer: THREE.AnimationMixer): void {
  useEffect(() => {
    const flash = createFlash(root);
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeHit((e) => {
      if (e.targetId !== targetId || e.kind === 'playerHit') return;
      flash.flash(FLASH_MS);
      if (!e.heavy) return;
      mixer.timeScale = HIT_STOP_SCALE;
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        stopTimer = null;
        mixer.timeScale = 1;
      }, e.kind === 'kill' ? KILL_HIT_STOP_MS : HIT_STOP_MS);
    });
    return () => {
      off();
      if (stopTimer) clearTimeout(stopTimer);
      mixer.timeScale = 1;
      flash.dispose();
    };
  }, [targetId, root, mixer]);
}
