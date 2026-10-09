// Subalpine meadow around the climber: grass clumps drawn blade by blade (alpha-tested cards
// that sway in the wind) and Paradise's July wildflowers: magenta and scarlet paintbrush,
// broadleaf lupine, avalanche lily, and cinquefoil.
import * as THREE from 'three';
import type { Instances } from './features';
import { distToRoute, fbm, sceneSeason, slopeAt, snowCover, surfaceAt, type Grid } from './terrain';

const GRASS_RADIUS = 75;

function rng(seed: number) {
  let s = seed >>> 0 || 7;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const FLOWERS: [number, number, number, number][] = [
  // r, g, b, weight
  [0.78, 0.07, 0.42, 3], // magenta paintbrush
  [0.85, 0.16, 0.06, 2], // scarlet paintbrush
  [0.36, 0.26, 0.8, 4], // broadleaf lupine
  [0.95, 0.94, 0.88, 2], // avalanche lily / bistort
  [0.95, 0.78, 0.15, 1], // cinquefoil
];
const FLOWER_TOTAL = FLOWERS.reduce((n, f) => n + f[3], 0);

/** Grass and flowers in a disc around the patch center, only on snow-free meadow. */
export function meadowScatter(patch: Grid) {
  const rand = rng(Math.round(patch.cx * 3 + patch.cz * 11) + 99);
  const grass: Instances = { matrices: [], colors: [] };
  const flowers: Instances = { matrices: [], colors: [] };
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  // Quick reject: no meadow anywhere near this stop.
  const probe = surfaceAt(patch.cx, patch.cz);
  if (probe > 2300) return { grass, flowers };

  for (let i = 0; i < 22000 && grass.matrices.length < 12000; i++) {
    // Densest near the center, where the camera is.
    const r = GRASS_RADIUS * Math.pow(rand(), 1.15);
    const a = rand() * Math.PI * 2;
    const x = patch.cx + Math.cos(a) * r;
    const z = patch.cz + Math.sin(a) * r;
    const y = surfaceAt(x, z);
    if (y > 2150) continue;
    const s = slopeAt(x, z);
    if (s.deg > 38) continue;
    const cover = snowCover(x, y, z, s.deg, s.north);
    if (cover > 0.2) continue;
    const track = distToRoute(x, z);
    if (track < 0.9) continue;
    // Patchy: thick sward, heather and bare pumice alternate.
    const lush = fbm(x * 0.06 + 2, z * 0.06 - 9, 3);
    const thin = y > 1900 ? (y - 1900) / 250 : 0;
    if (rand() > lush * 1.8 - 0.15 - thin) continue;

    const h = (0.14 + rand() * 0.22) * (1 - thin * 0.5) * (track < 3 ? 0.6 : 1);
    e.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y - 0.06, z), q, new THREE.Vector3(h * 1.8, h * 1.15, h * 1.8));
    grass.matrices.push(m.clone());
    // Late summer: the meadows cure to tan and straw.
    const dry = Math.min(1.3, Math.max(0, fbm(x * 0.02 - 5, z * 0.02 + 4) - 0.5) * 1.6 + thin * 0.4 + sceneSeason.dry);
    const v = 0.55 + rand() * 0.25;
    grass.colors.push(new THREE.Color(v * (0.7 + dry * 0.55), v * 0.92, v * (0.6 - dry * 0.15)));

    // Wildflowers in drifts.
    // By September most wildflowers have gone to seed.
    if (flowers.matrices.length < 2600 && fbm(x * 0.09 + 31, z * 0.09 - 17) > 0.5 && rand() < 0.55 * (1 - sceneSeason.dry * 1.2)) {
      let pick = rand() * FLOWER_TOTAL;
      let col = FLOWERS[0];
      for (const f of FLOWERS) {
        pick -= f[3];
        if (pick <= 0) {
          col = f;
          break;
        }
      }
      const fh = 0.22 + rand() * 0.28;
      const fx = x + (rand() - 0.5) * 0.4;
      const fz = z + (rand() - 0.5) * 0.4;
      e.set((rand() - 0.5) * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.2);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(fx, surfaceAt(fx, fz) - 0.02, fz), q, new THREE.Vector3(fh, fh, fh));
      flowers.matrices.push(m.clone());
      const t = 0.85 + rand() * 0.25;
      flowers.colors.push(new THREE.Color(col[0] * t, col[1] * t, col[2] * t));
    }
  }
  return { grass, flowers };
}

// ---------- geometry ----------

/** Three crossed cards, unit height, base at y = 0. Normals point up so clumps shade like turf. */
export function grassGeometry() {
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI;
    const cx = Math.cos(ang) * 0.5;
    const cz = Math.sin(ang) * 0.5;
    const base = pos.length / 3;
    const quad = [
      [-cx, 0, -cz, 0, 0],
      [cx, 0, cz, 1, 0],
      [cx, 1, cz, 1, 1],
      [-cx, 1, -cz, 0, 1],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x, y, z);
      uv.push(u, v);
      nrm.push(0, 1, 0);
    }
    // Both faces wound outward with upward normals, so either side of a card is lit like turf.
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** A flower: thin stem and a spike of bloom (paintbrush and lupine both grow as spikes). Unit height. */
export function flowerGeometry() {
  const stem = new THREE.CylinderGeometry(0.008, 0.012, 0.7, 4);
  stem.translate(0, 0.35, 0);
  const bloom = new THREE.SphereGeometry(0.07, 8, 6);
  bloom.scale(1, 2.1, 1);
  bloom.translate(0, 0.8, 0);
  const parts = [
    { g: stem, c: [0.12, 0.3, 0.08] },
    { g: bloom, c: [1, 1, 1] },
  ];
  const pos: number[] = [];
  const col: number[] = [];
  for (const { g, c } of parts) {
    const n = g.toNonIndexed();
    const p = n.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      col.push(...c);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

// ---------- wind ----------

const wind = { value: 0 };

/** Adds a gentle sway to the top of every instance; stronger toward the tips. */
export function swaying<T extends THREE.Material>(mat: T, amount: number): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
          float sway = sin(uWind * 1.7 + iPos.x * 0.35 + iPos.z * 0.22) + 0.5 * sin(uWind * 3.1 + iPos.x * 0.9);
          float tip = position.y * position.y;
          transformed.x += sway * ${amount.toFixed(3)} * tip;
          transformed.z += sway * ${(amount * 0.6).toFixed(3)} * tip;
        #endif`,
      );
  };
  return mat;
}

export function tickWind(t: number) {
  wind.value = t;
}
