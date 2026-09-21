import { useMemo } from 'react';
import * as THREE from 'three';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tileable canvas-painted grass texture: mottled base + speckled blades, no external asset needed. */
export function useGrassTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(1337);

    ctx.fillStyle = '#5a9645';
    ctx.fillRect(0, 0, size, size);

    // Broad mottled patches for large-scale color variation (reads clearly even minified/mipmapped).
    for (let i = 0; i < 70; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 30 + rng() * 70;
      const color = rng() < 0.5 ? 'rgba(70, 130, 52, 0.55)' : 'rgba(120, 172, 78, 0.5)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine speckle for close-up detail.
    for (let i = 0; i < 1400; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 3 + rng() * 6;
      const shade = rng();
      const color =
        shade < 0.5
          ? `rgba(58, 104, 45, ${0.3 + rng() * 0.35})`
          : `rgba(142, 194, 96, ${0.25 + rng() * 0.3})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted desert sand texture, for the field's desert biome patch. */
export function useSandTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(4242);

    ctx.fillStyle = '#d9b877';
    ctx.fillRect(0, 0, size, size);

    // Broad dune-shadow patches for large-scale variation.
    for (let i = 0; i < 60; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 40 + rng() * 90;
      const color = rng() < 0.5 ? 'rgba(196, 158, 98, 0.45)' : 'rgba(230, 200, 140, 0.4)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine grain speckle for close-up detail.
    for (let i = 0; i < 1600; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 1.5 + rng() * 3;
      const shade = rng();
      const color =
        shade < 0.5 ? `rgba(176, 138, 84, ${0.25 + rng() * 0.3})` : `rgba(238, 212, 158, ${0.25 + rng() * 0.3})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted river-water texture — a flat strip, not a real fluid sim. */
export function useWaterTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(99);

    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(0, 0, size, size);

    // Horizontal-ish ripple bands (river flow direction) plus a few highlight streaks.
    for (let i = 0; i < 40; i++) {
      const y = rng() * size;
      const h = 4 + rng() * 10;
      ctx.fillStyle = rng() < 0.5 ? 'rgba(120, 200, 224, 0.18)' : 'rgba(20, 60, 90, 0.18)';
      ctx.beginPath();
      ctx.ellipse(rng() * size, y, 60 + rng() * 120, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 22);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted cobblestone texture for the village plaza. */
export function useCobblestoneTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(2024);

    ctx.fillStyle = '#8a7f72';
    ctx.fillRect(0, 0, size, size);

    const cellSize = 42;
    for (let gy = 0; gy < size / cellSize + 1; gy++) {
      for (let gx = 0; gx < size / cellSize + 1; gx++) {
        const offsetX = (gy % 2) * cellSize * 0.5;
        const cx = gx * cellSize + offsetX + (rng() - 0.5) * 6;
        const cy = gy * cellSize + (rng() - 0.5) * 6;
        const w = cellSize * (0.78 + rng() * 0.16);
        const h = cellSize * (0.78 + rng() * 0.16);
        const shade = rng();
        ctx.fillStyle =
          shade < 0.5
            ? `rgba(120, 110, 98, ${0.5 + rng() * 0.3})`
            : `rgba(160, 150, 136, ${0.4 + rng() * 0.3})`;
        ctx.beginPath();
        const r = 6;
        ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60, 54, 46, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted dark stone-slab texture for the dungeon floor. */
export function useStoneTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(777);

    ctx.fillStyle = '#3a3a3f';
    ctx.fillRect(0, 0, size, size);

    const cellSize = 64;
    for (let gy = 0; gy < size / cellSize + 1; gy++) {
      for (let gx = 0; gx < size / cellSize + 1; gx++) {
        const cx = gx * cellSize + (rng() - 0.5) * 8;
        const cy = gy * cellSize + (rng() - 0.5) * 8;
        const w = cellSize * (0.82 + rng() * 0.14);
        const h = cellSize * (0.82 + rng() * 0.14);
        const shade = rng();
        ctx.fillStyle =
          shade < 0.5 ? `rgba(52, 52, 58, ${0.5 + rng() * 0.3})` : `rgba(68, 68, 76, ${0.4 + rng() * 0.3})`;
        ctx.beginPath();
        ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(10, 10, 12, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Sparse moss/grime speckle so it doesn't read as too uniform/clean.
    for (let i = 0; i < 300; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 2 + rng() * 4;
      ctx.fillStyle = `rgba(45, 58, 40, ${0.15 + rng() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

export { mulberry32 };
