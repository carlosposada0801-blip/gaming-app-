// Mount Rainier from real elevation data (see tools/dem). World units are meters:
// x = east, z = south, y = elevation above sea level.
//
// Three height layers:
//   FAR   45 km square around the mountain, 352 m cells (horizon ridges).
//   CORE  22 km square, 28.6 m data rendered as a 57 m mesh (the mountain).
//   PATCH a 1.6 km square around the climber at 6.5 m with added relief (rocks, rolls in the
//         snow), rebuilt as the climber moves. It sits on the core mesh exactly at its edges.
import { ROUTES, type MountainId, type RouteId } from '../game/routes';
import { ROUTE_WAYPOINTS } from './data/routeWaypoints';
import {
  CORE_B64, CORE_HALF, CORE_N, FAR_B64, FAR_HALF, FAR_N, HORIZON_B64, HORIZON_HALF, HORIZON_N, WAYPOINTS,
} from './data/rainierDem';

export type Vec3 = [number, number, number];

// ---------- noise ----------

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, octaves = 4) {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < octaves; i++) {
    f += amp * vnoise(x * fr, y * fr);
    fr *= 2;
    amp *= 0.5;
  }
  return f;
}

export const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- height grids ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeHeights(b64: string, n: number): Float32Array {
  const lookup = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const total = n * n * 2;
  const bytes = new Uint8Array(total);
  let p = 0;
  for (let i = 0; i < b64.length && p < total; i += 4) {
    const v = (lookup[b64.charCodeAt(i)] << 18) | (lookup[b64.charCodeAt(i + 1)] << 12)
      | (lookup[b64.charCodeAt(i + 2)] << 6) | lookup[b64.charCodeAt(i + 3)];
    bytes[p++] = (v >> 16) & 255;
    if (p < total) bytes[p++] = (v >> 8) & 255;
    if (p < total) bytes[p++] = v & 255;
  }
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = (bytes[2 * i] | (bytes[2 * i + 1] << 8)) / 10;
  return out;
}

/** A square height grid centered on (cx, cz). Row index runs north to south (z), column west to east (x). */
export interface Grid {
  cx: number;
  cz: number;
  half: number;
  n: number;
  step: number;
  h: Float32Array;
}

const grid = (h: Float32Array, n: number, half: number, cx = 0, cz = 0): Grid => ({ cx, cz, half, n, step: (2 * half) / (n - 1), h });

/** The core terrain mesh: every second data sample. */
function meshOf(core: Grid): Grid {
  const n = (core.n - 1) / 2 + 1;
  const h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = core.h[2 * r * core.n + 2 * c];
  return grid(h, n, core.half);
}

export type { MountainId };

interface DemModule {
  CORE_HALF: number; CORE_N: number; FAR_HALF: number; FAR_N: number; HORIZON_HALF: number; HORIZON_N: number;
  CORE_B64: string; FAR_B64: string; HORIZON_B64: string;
}

/** Elevation data for each mountain, loaded (and decoded) the first time it is shown. */
const DEMS: Record<MountainId, () => DemModule> = {
  rainier: () => ({ CORE_HALF, CORE_N, FAR_HALF, FAR_N, HORIZON_HALF, HORIZON_N, CORE_B64, FAR_B64, HORIZON_B64 }),
  helens: () => require('./data/dem_helens'),
  adams: () => require('./data/dem_adams'),
  baker: () => require('./data/dem_baker'),
  si: () => require('./data/dem_si'),
};

interface MountainGrids { core: Grid; mesh: Grid; far: Grid; horizon: Grid }
const loaded = new Map<MountainId, MountainGrids>();

function load(id: MountainId): MountainGrids {
  let m = loaded.get(id);
  if (!m) {
    const d = DEMS[id]();
    const core = grid(decodeHeights(d.CORE_B64, d.CORE_N), d.CORE_N, d.CORE_HALF);
    m = {
      core,
      mesh: meshOf(core),
      far: grid(decodeHeights(d.FAR_B64, d.FAR_N), d.FAR_N, d.FAR_HALF),
      horizon: grid(decodeHeights(d.HORIZON_B64, d.HORIZON_N), d.HORIZON_N, d.HORIZON_HALF),
    };
    loaded.set(id, m);
  }
  return m;
}

const first = load('rainier');
// These objects stay the same; `setSceneMountain` swaps their contents.
const CORE_DATA: Grid = { ...first.core };
/** The core terrain mesh: every second data sample (57 m on Rainier). */
export const CORE_MESH: Grid = { ...first.mesh };
export const FAR: Grid = { ...first.far };
/** 350 km of the Cascades on the horizon. */
export const HORIZON: Grid = { ...first.horizon };
/** The mountain shown, and roughly where its summit is (for the Earth's curve). */
export const sceneMountain = { id: 'rainier' as MountainId, peakX: 1000, peakZ: -1000 };

export function setSceneMountain(id: MountainId) {
  if (sceneMountain.id === id) return;
  const m = load(id);
  Object.assign(CORE_DATA, m.core);
  Object.assign(CORE_MESH, m.mesh);
  Object.assign(FAR, m.far);
  Object.assign(HORIZON, m.horizon);
  sceneMountain.id = id;
  // The highest core sample stands in for the summit.
  let best = -1;
  let bi = 0;
  for (let i = 0; i < m.core.h.length; i++) if (m.core.h[i] > best) [best, bi] = [m.core.h[i], i];
  sceneMountain.peakX = -m.core.half + (bi % m.core.n) * m.core.step;
  sceneMountain.peakZ = -m.core.half + Math.floor(bi / m.core.n) * m.core.step;
  if (id === 'rainier') [sceneMountain.peakX, sceneMountain.peakZ] = [1000, -1000];
  patch = null;
}

const EARTH_R = 6371000;
/** How far the Earth's surface has dropped below the horizontal at this distance from the mountain. */
export function earthDrop(x: number, z: number) {
  const dx = x - sceneMountain.peakX;
  const dz = z - sceneMountain.peakZ;
  return (dx * dx + dz * dz) / (2 * EARTH_R);
}

export function inside(g: Grid, x: number, z: number, margin = 0) {
  return Math.abs(x - g.cx) <= g.half - margin && Math.abs(z - g.cz) <= g.half - margin;
}

/** Smooth bilinear sample (for slopes and placement). */
export function bilinear(g: Grid, x: number, z: number) {
  const gx = Math.max(0, Math.min(g.n - 1.0001, (x - g.cx + g.half) / g.step));
  const gz = Math.max(0, Math.min(g.n - 1.0001, (z - g.cz + g.half) / g.step));
  const c = Math.floor(gx);
  const r = Math.floor(gz);
  const fx = gx - c;
  const fz = gz - r;
  const i = r * g.n + c;
  const h = g.h;
  return (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fz) + (h[i + g.n] * (1 - fx) + h[i + g.n + 1] * fx) * fz;
}

/**
 * Exact height of the rendered mesh for a grid built with THREE.PlaneGeometry rotated -90° about X.
 * Each cell is split into triangles (a, b, d) and (b, c, d), so this matches the GPU's surface.
 */
export function meshHeight(g: Grid, x: number, z: number) {
  const gx = Math.max(0, Math.min(g.n - 1.0001, (x - g.cx + g.half) / g.step));
  const gz = Math.max(0, Math.min(g.n - 1.0001, (z - g.cz + g.half) / g.step));
  const c = Math.floor(gx);
  const r = Math.floor(gz);
  const fx = gx - c;
  const fz = gz - r;
  const i = r * g.n + c;
  const ha = g.h[i];
  const hd = g.h[i + 1];
  const hb = g.h[i + g.n];
  const hc = g.h[i + g.n + 1];
  if (fx + fz <= 1) return ha * (1 - fx - fz) + hb * fz + hd * fx;
  return hb * (1 - fx) + hd * (1 - fz) + hc * (fx + fz - 1);
}

/** Slope in degrees and how much the ground faces north (1 = due north, -1 = south). */
export function slopeAt(x: number, z: number) {
  const d = 30;
  const dx = (bilinear(CORE_DATA, x + d, z) - bilinear(CORE_DATA, x - d, z)) / (2 * d);
  const dz = (bilinear(CORE_DATA, x, z + d) - bilinear(CORE_DATA, x, z - d)) / (2 * d);
  const g = Math.hypot(dx, dz);
  // Downhill direction is -gradient; facing north means downhill toward -z.
  const north = g > 1e-4 ? dz / g : 0;
  return { deg: (Math.atan(g) * 180) / Math.PI, north, dx, dz };
}

// ---------- the route ----------

export const ROUTE_SPACING = 6;
/** Sideways switchback amplitude (m) for the stretch starting at each waypoint. */
const SWITCHBACK: Record<string, number> = {
  'Top of the Cleaver': 18,
  'High Break': 28,
  'Disappointment Cleaver base': 8,
  'Inter Glacier': 12,
  'Top of the Corridor': 14,
  'Upper Emmons': 24,
  'Wapowety Cleaver': 10,
  'Top of the Ice Chute': 12,
  'Black Pyramid': 8,
};

const WAYPOINTS_BY_ROUTE = {
  dc: WAYPOINTS,
  // The Camp Muir day hike is the Cleaver route as far as Camp Muir.
  muir: WAYPOINTS.slice(0, WAYPOINTS.findIndex((w) => w.name === 'Camp Muir') + 1),
  ...ROUTE_WAYPOINTS,
} as unknown as Record<RouteId, { name: string; x: number; z: number }[]>;

export interface RoutePath {
  id: RouteId;
  pts: Vec3[];
  /** Route-point index of each stop in the route's `nodes`. */
  nodeIndex: number[];
  /** Meters along the route at each route point (matches src/game/data/routeProfile.ts). */
  cum: number[];
}

/** Builds the walked line for a route: waypoints joined every ~6 m, with switchbacks on the steeps. */
export function buildRoute(id: RouteId): RoutePath {
  setSceneMountain(ROUTES[id].mountain);
  const pts: Vec3[] = [];
  const names = ROUTES[id].nodes.map((n) => n.name);
  const nodeIndex: number[] = new Array(names.length).fill(0);
  const way = WAYPOINTS_BY_ROUTE[id];
  way.forEach((w, wi) => {
    const ni = names.indexOf(w.name);
    if (ni >= 0) nodeIndex[ni] = pts.length;
    const next = way[wi + 1];
    if (!next) {
      pts.push([w.x, meshHeight(CORE_MESH, w.x, w.z), w.z]);
      return;
    }
    const len = Math.hypot(next.x - w.x, next.z - w.z);
    const steps = Math.max(1, Math.round(len / ROUTE_SPACING));
    const px = -(next.z - w.z) / len;
    const pz = (next.x - w.x) / len;
    const amp = SWITCHBACK[w.name] ?? 0;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const side = amp * Math.sin(t * Math.PI * Math.max(1, Math.round(len / 160))) * Math.sin(t * Math.PI);
      const x = w.x + (next.x - w.x) * t + px * side;
      const z = w.z + (next.z - w.z) * t + pz * side;
      pts.push([x, meshHeight(CORE_MESH, x, z), z]);
    }
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  return { id, pts, nodeIndex, cum };
}

const built = new Map<RouteId, RoutePath>();

/** The route the scene shows. Its fields are swapped by `setSceneRoute`. */
export const ROUTE: RoutePath = buildRoute('dc');
built.set('dc', { ...ROUTE });

// Spatial hash of route points for "how far from the track" queries.
const CELL = 24;
let routeCells = new Map<number, number[]>();
const cellKey = (cx: number, cz: number) => cx * 100003 + cz;
function hashRoute() {
  routeCells = new Map();
  ROUTE.pts.forEach(([x, , z], i) => {
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const list = routeCells.get(k);
    if (list) list.push(i);
    else routeCells.set(k, [i]);
  });
}
hashRoute();

export function setSceneRoute(id: RouteId) {
  setSceneMountain(ROUTES[id].mountain);
  if (ROUTE.id === id) return;
  let r = built.get(id);
  if (!r) {
    r = buildRoute(id);
    built.set(id, r);
  }
  Object.assign(ROUTE, r);
  hashRoute();
}

/** Fractional route-point index at a distance along the route. */
export function routeIndexAt(d: number) {
  const cum = ROUTE.cum;
  if (d <= 0) return 0;
  const last = cum.length - 1;
  if (d >= cum[last]) return last;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo + (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
}

/** Columbia Crest: every route ends there. */
export const SUMMIT_POS: Vec3 = ROUTE.pts[ROUTE.pts.length - 1];

export function nodePosition(i: number): Vec3 {
  return ROUTE.pts[ROUTE.nodeIndex[i]];
}

/** Distance (m) to the nearest route point, capped at 2 * CELL. */
export function distToRoute(x: number, z: number) {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best = CELL * 2;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const list = routeCells.get(cellKey(cx + i, cz + j));
      if (!list) continue;
      for (const k of list) {
        const p = ROUTE.pts[k];
        const d = Math.hypot(p[0] - x, p[2] - z);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

// ---------- ground cover ----------

/**
 * The season the scene shows. `shift` moves the snowline (m) from its July position, `dry` browns
 * the meadow grass. Set by MountainScene before anything is built.
 */
export const sceneSeason = { key: 'july', shift: 0, dry: 0 };

export function setSceneSeason(key: string, shift: number, dry: number) {
  sceneSeason.key = key;
  sceneSeason.shift = shift;
  sceneSeason.dry = dry;
}

/** How much snow or glacier covers the ground here, 0..1, for the scene's season. */
export function snowCover(x: number, y: number, z: number, slopeDeg: number, north: number, shift = sceneSeason.shift) {
  const n = fbm(x * 0.0035 + 3, z * 0.0035 - 8);
  const snowline = 1950 + shift - 260 * north + (n - 0.5) * 320;
  const patchy = smooth(0.42, 0.58, fbm(x * 0.02, z * 0.02, 3)) * 0.35;
  const altitude = smooth(snowline - 90, snowline + 90, y);
  const steep = smooth(37, 50, slopeDeg + (n - 0.5) * 10);
  return Math.max(0, Math.min(1, altitude * (1 - steep) - patchy * (1 - smooth(2200 + shift, 2500 + shift, y))));
}

/** Glacier ice rather than snowfield, 0..1. */
export function glacierness(x: number, y: number, z: number) {
  return smooth(0.42, 0.58, fbm(x * 0.0011 - 20, z * 0.0011 + 7, 3)) * smooth(2000, 2600, y) * (1 - smooth(3700, 4100, y));
}

// Linear-space colors.
const FOREST: Vec3 = [0.035, 0.07, 0.04];
const MEADOW: Vec3 = [0.19, 0.24, 0.085];
const PUMICE: Vec3 = [0.3, 0.26, 0.2];
const ROCK: Vec3 = [0.14, 0.13, 0.125];
const ROCK_DARK: Vec3 = [0.05, 0.047, 0.047];
const ROCK_RED: Vec3 = [0.19, 0.1, 0.07];
const SNOW: Vec3 = [0.8, 0.83, 0.88];
const FIRN: Vec3 = [0.74, 0.76, 0.78];
const ICE: Vec3 = [0.48, 0.62, 0.76];

export function groundColor(x: number, y: number, z: number, slopeDeg: number, north: number): Vec3 {
  const n = fbm(x * 0.004, z * 0.004);
  const f = fbm(x * 0.05 + 3, z * 0.05 - 2, 3);

  // Bare ground: forest and meadow low, pumice and talus higher, rock on the steep.
  const treeline = 1720 + (n - 0.5) * 220;
  let bare = mix3(PUMICE, ROCK, smooth(1900, 2700, y));
  bare = mix3(bare, ROCK_DARK, smooth(0.45, 0.8, f) * 0.6);
  bare = mix3(bare, ROCK_RED, smooth(0.58, 0.75, fbm(x * 0.002 + 40, z * 0.002 - 13)) * 0.75);
  bare = mix3(bare, ROCK_DARK, smooth(35, 55, slopeDeg) * 0.55);
  // Lava-flow strata: on cliffs the rock shows near-horizontal bands, red-brown and grey.
  const band = Math.sin(y * 0.09 + fbm(x * 0.003, z * 0.003) * 9) * 0.5 + 0.5;
  const cliff = smooth(30, 48, slopeDeg) * smooth(1800, 2300, y);
  bare = mix3(bare, band > 0.6 ? ROCK_RED : ROCK_DARK, cliff * Math.abs(band - 0.5) * 1.1);
  // Paradise sits in subalpine meadow; dense forest only lower down.
  const green = mix3(FOREST, MEADOW, smooth(1350, 1600, y) * (0.55 + 0.45 * smooth(0.3, 0.6, n)));
  let c = mix3(bare, green, (1 - smooth(treeline - 60, treeline + 60, y)) * (1 - smooth(32, 42, slopeDeg)));

  // Snow, with older grey firn in sun cups and blue ice where glaciers steepen. Dense forest
  // stays dark from afar even when the ground under it is snowed in.
  const canopy = (1 - smooth(1250, 1500, y)) * 0.6;
  const cover = snowCover(x, y, z, slopeDeg, north) * (1 - canopy);
  let snow = mix3(SNOW, FIRN, smooth(0.5, 0.75, f) * 0.35 * (1 - smooth(3000, 3600, y)));
  snow = mix3(snow, ICE, glacierness(x, y, z) * smooth(14, 32, slopeDeg) * 0.55);
  c = mix3(c, snow, cover);

  const shade = 0.86 + 0.14 * f;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

// ---------- detail patch around the climber ----------

export const PATCH_HALF = 800;
export const PATCH_N = 247;

/** Extra relief added on top of the real terrain inside the patch (meters). */
function relief(x: number, z: number, rockiness: number) {
  const big = (fbm(x * 0.008 + 11, z * 0.008 - 7, 4) - 0.5) * 7;
  const mid = (fbm(x * 0.035 - 3, z * 0.035 + 5, 3) - 0.5) * 2.4;
  const r = 1 - Math.abs(fbm(x * 0.02 + 21, z * 0.02 + 2, 4) * 2 - 1);
  const crags = r * r * r * 7 * rockiness;
  const fine = (fbm(x * 0.16, z * 0.16, 2) - 0.5) * (0.35 + 1.4 * rockiness);
  return big * (0.35 + 0.65 * rockiness) + mid * (0.5 + 0.5 * rockiness) + crags + fine;
}

let patch: Grid | null = null;

/** Builds the high-detail patch centered near (x, z). Returns the grid; also used by surfaceAt. */
export function buildPatch(x: number, z: number): Grid {
  const cx = Math.round(x / 50) * 50;
  const cz = Math.round(z / 50) * 50;
  const n = PATCH_N;
  const step = (2 * PATCH_HALF) / (n - 1);
  const h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    const pz = cz - PATCH_HALF + r * step;
    for (let c = 0; c < n; c++) {
      const px = cx - PATCH_HALF + c * step;
      const base = meshHeight(CORE_MESH, px, pz);
      const edge = Math.min(c, r, n - 1 - c, n - 1 - r) * step;
      const fade = smooth(0, 120, edge);
      const track = smooth(3, 16, distToRoute(px, pz));
      const s = slopeAt(px, pz);
      const rock = 1 - snowCover(px, base, pz, s.deg, s.north);
      h[r * n + c] = base + relief(px, pz, rock) * fade * track;
    }
  }
  patch = { cx, cz, half: PATCH_HALF, n, step, h };
  return patch;
}

export function currentPatch() {
  return patch;
}

/** Height of the visible ground at (x, z). */
export function surfaceAt(x: number, z: number) {
  if (patch && inside(patch, x, z, patch.step)) return meshHeight(patch, x, z);
  if (inside(CORE_MESH, x, z)) return meshHeight(CORE_MESH, x, z);
  if (inside(FAR, x, z)) return bilinear(FAR, x, z) - earthDrop(x, z);
  return bilinear(HORIZON, x, z) - earthDrop(x, z);
}

/** Kept for older callers: height of the ground. */
export const heightAt = surfaceAt;
