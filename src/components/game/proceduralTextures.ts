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

/** A tileable canvas-painted river-water texture — a flat strip, not a real fluid sim. Flowing
 * streaks run along V (the texture's repeat.set(6, 22) means many more repeats lengthwise than
 * across, matching the river's actual long/narrow shape) so RiverStrip's UV-scroll animation
 * reads as current moving downstream instead of just static noise. */
export function useWaterTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(99);

    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#255f80');
    gradient.addColorStop(0.5, '#3688ad');
    gradient.addColorStop(1, '#255f80');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Long, mostly-vertical flow streaks (the texture's V axis) — thin and elongated rather
    // than round blobs, so they read as current rather than random speckle once tiled+scrolled.
    for (let i = 0; i < 70; i++) {
      const x = rng() * size;
      const len = 90 + rng() * 220;
      const y = rng() * size;
      const wobble = (rng() - 0.5) * 30;
      ctx.strokeStyle = rng() < 0.55 ? 'rgba(150, 214, 232, 0.22)' : 'rgba(15, 48, 70, 0.22)';
      ctx.lineWidth = 2 + rng() * 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + wobble, y + len * 0.5, x, y + len);
      ctx.stroke();
    }

    // Sparkle highlights — small bright flecks for a bit of sunlit-water sparkle.
    for (let i = 0; i < 55; i++) {
      const r = 0.8 + rng() * 1.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + rng() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(rng() * size, rng() * size, r, r * 0.5, rng() * Math.PI, 0, Math.PI * 2);
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

/** A tileable canvas-painted forest-floor texture — moss/leaf litter for 요정의 숲's ground
 * patch, same base tone as MiniMap.tsx/WorldMap.tsx's own '#3f6b4a' band color so the actual
 * 3D ground reads as the same zone the map already shows. */
export function useForestFloorTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(6100);

    ctx.fillStyle = '#3f6b4a';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 70; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 30 + rng() * 70;
      const color = rng() < 0.5 ? 'rgba(30, 54, 36, 0.5)' : 'rgba(80, 120, 70, 0.4)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fallen-leaf speckle — warmer/browner than the grass texture's own speckle, for a
    // "forest floor litter" read rather than open lawn.
    for (let i = 0; i < 900; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 3 + rng() * 6;
      const shade = rng();
      const color =
        shade < 0.4
          ? `rgba(90, 66, 38, ${0.3 + rng() * 0.3})`
          : shade < 0.75
            ? `rgba(28, 48, 32, ${0.3 + rng() * 0.3})`
            : `rgba(120, 92, 50, ${0.25 + rng() * 0.25})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted trampled-dirt texture for 오크 마을's ground patch, matching
 * the map's own '#6b4a3a' band color. */
export function useOrcDirtTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(6200);

    ctx.fillStyle = '#6b4a3a';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 55; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 35 + rng() * 85;
      const color = rng() < 0.5 ? 'rgba(46, 30, 22, 0.5)' : 'rgba(96, 68, 50, 0.4)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Coarse rock/mud speckle — bigger and rougher than a grass field's speckle, reads as
    // packed, trampled earth rather than a tended lawn.
    for (let i = 0; i < 500; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 3 + rng() * 8;
      const shade = rng();
      const color =
        shade < 0.5 ? `rgba(40, 26, 18, ${0.3 + rng() * 0.3})` : `rgba(110, 82, 60, ${0.25 + rng() * 0.3})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted pale bone/ash texture for 해골 평원's ground patch, matching the
 * map's own '#9c9484' band color. */
export function useBoneFieldTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(6300);

    ctx.fillStyle = '#9c9484';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 60; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 35 + rng() * 80;
      const color = rng() < 0.5 ? 'rgba(120, 112, 96, 0.4)' : 'rgba(180, 172, 152, 0.35)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Small bone-shard flecks (short pale strokes) scattered across the ash-grey base.
    for (let i = 0; i < 220; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 6 + rng() * 14;
      const angle = rng() * Math.PI;
      ctx.strokeStyle = `rgba(226, 218, 198, ${0.35 + rng() * 0.3})`;
      ctx.lineWidth = 1.5 + rng() * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(angle) * len * 0.5, y - Math.sin(angle) * len * 0.5);
      ctx.lineTo(x + Math.cos(angle) * len * 0.5, y + Math.sin(angle) * len * 0.5);
      ctx.stroke();
    }

    // Dark crack/fissure hairlines for a dry, cracked-earth read.
    for (let i = 0; i < 40; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.strokeStyle = `rgba(70, 64, 54, ${0.25 + rng() * 0.25})`;
      ctx.lineWidth = 1 + rng();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 40, y + (rng() - 0.5) * 40);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** A tileable canvas-painted sickly cursed-ground texture for 구울 평원's ground patch,
 * matching the map's own '#3a4a3a' band color. */
export function useGhoulFieldTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rng = mulberry32(6400);

    ctx.fillStyle = '#3a4a3a';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 65; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 30 + rng() * 75;
      const color = rng() < 0.5 ? 'rgba(20, 28, 22, 0.5)' : 'rgba(62, 40, 62, 0.3)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sickly purple-green speckle — the same "mottled patches + fine speckle" build as the
    // other biome textures, just shifted toward a diseased hue instead of healthy grass.
    for (let i = 0; i < 800; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 3 + rng() * 6;
      const shade = rng();
      const color =
        shade < 0.45
          ? `rgba(18, 24, 18, ${0.3 + rng() * 0.3})`
          : shade < 0.8
            ? `rgba(70, 90, 60, ${0.25 + rng() * 0.25})`
            : `rgba(90, 60, 90, ${0.2 + rng() * 0.2})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
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
