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
