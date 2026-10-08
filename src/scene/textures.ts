// Tileable detail textures generated at startup: a grain map that breaks up flat vertex color,
// and a matching normal map so snow and rock catch light at a scale finer than the mesh.
import * as THREE from 'three';

const SIZE = 256;

function hash(x: number, y: number, p: number) {
  const s = Math.sin(((x % p) + p) % p * 127.1 + (((y % p) + p) % p) * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise that wraps every `p` lattice cells, so the texture tiles seamlessly. */
function pnoise(x: number, y: number, p: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, p);
  const b = hash(xi + 1, yi, p);
  const c = hash(xi, yi + 1, p);
  const d = hash(xi + 1, yi + 1, p);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function heightField() {
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let f = 0;
      let amp = 0.5;
      let p = 8;
      for (let o = 0; o < 5; o++) {
        f += amp * pnoise((x / SIZE) * p, (y / SIZE) * p, p);
        amp *= 0.5;
        p *= 2;
      }
      h[y * SIZE + x] = f;
    }
  }
  return h;
}

let cached: { grain: THREE.DataTexture; normal: THREE.DataTexture } | null = null;

export function detailTextures() {
  if (cached) return cached;
  const h = heightField();
  const grain = new Uint8Array(SIZE * SIZE * 4);
  const normal = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const g = Math.round(205 + (h[y * SIZE + x] - 0.5) * 90);
      grain[i] = grain[i + 1] = grain[i + 2] = Math.max(0, Math.min(255, g));
      grain[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 6;
      const len = Math.hypot(dx, dy, 1);
      normal[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }
  const make = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  cached = { grain: make(grain), normal: make(normal) };
  return cached;
}

const clouds = new Map<string, THREE.DataTexture>();

/** Soft, tileable cloud: white with alpha from billowing noise. Higher `from` = more open sky. */
export function cloudTexture(from = 0.36, span = 0.22) {
  const key = `${from}:${span}`;
  const hit = clouds.get(key);
  if (hit) return hit;
  const n = SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let f = 0;
      let amp = 0.5;
      let p = 4;
      for (let o = 0; o < 5; o++) {
        f += amp * pnoise((x / n) * p + 3.1, (y / n) * p + 7.7, p);
        amp *= 0.5;
        p *= 2;
      }
      const a = Math.max(0, Math.min(1, (f - from) / span));
      const i = (y * n + x) * 4;
      const shade = Math.round(215 + 40 * a);
      data[i] = data[i + 1] = data[i + 2] = shade;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  clouds.set(key, tex);
  return tex;
}

let grass: THREE.DataTexture | null = null;

/** A card of grass blades with seed heads: transparent between blades, darker at the base. */
export function grassTexture() {
  if (grass) return grass;
  const W = 128;
  const H = 256;
  const data = new Uint8Array(W * H * 4);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let b = 0; b < 70; b++) {
    // Blades bunch toward the middle of the card and shorten toward its sides, so a clump has
    // a rounded, ragged outline instead of a rectangle.
    const off = ((rand() + rand() + rand()) / 3 - 0.5) * 2;
    const x0 = W / 2 + off * (W / 2 - 6);
    const height = (0.3 + rand() * 0.7) * (1 - Math.abs(off) * 0.6) * H;
    const lean = (rand() - 0.5) * 50;
    const width = 1.4 + rand() * 2.2;
    const hue = rand();
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const cx = x0 + lean * t * t;
      const half = width * (1 - t) + 0.35;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        if (x < 0 || x >= W) continue;
        const i = (y * W + x) * 4;
        // Dark at the base, sunlit toward the tip; a few blades already curing to straw.
        const light = 0.35 + 0.65 * t;
        const straw = hue > 0.82 ? 1 : 0;
        data[i] = Math.round((60 + straw * 90 + 40 * t) * light);
        data[i + 1] = Math.round((110 + straw * 60 + 60 * t) * light);
        data[i + 2] = Math.round((40 + straw * 10) * light);
        data[i + 3] = 255;
      }
    }
    // Seed head on some stems.
    if (rand() < 0.25) {
      const cx = Math.round(x0 + lean);
      for (let y = Math.floor(height) - 14; y < height + 2 && y < H; y++) {
        for (let x = cx - 2; x <= cx + 2; x++) {
          if (x < 0 || x >= W || y < 0) continue;
          const i = (y * W + x) * 4;
          data[i] = 150; data[i + 1] = 135; data[i + 2] = 80; data[i + 3] = 255;
        }
      }
    }
  }
  grass = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  grass.magFilter = THREE.LinearFilter;
  grass.minFilter = THREE.LinearMipmapLinearFilter;
  grass.generateMipmaps = true;
  grass.needsUpdate = true;
  return grass;
}
