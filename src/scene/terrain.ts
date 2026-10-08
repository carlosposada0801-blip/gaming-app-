// Procedural Mount Rainier: a broad volcanic cone with radial ridges and noise,
// plus the Disappointment Cleaver route projected onto its surface.
import { NODES } from '../game/route';

export const MOUNTAIN_H = 60;
export const TERRAIN_SIZE = 280;
export const TERRAIN_SEGMENTS = 180;
const FT_BASE = 4000;
const FT_TOP = 14411;

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

export function fbm(x: number, y: number) {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < 4; i++) {
    f += amp * vnoise(x * fr, y * fr);
    fr *= 2;
    amp *= 0.5;
  }
  return f;
}

export function heightAt(x: number, z: number) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const base = MOUNTAIN_H / (1 + Math.pow(r / 26, 2.3));
  const ridges = Math.pow(Math.abs(Math.sin(th * 5 + r * 0.04)), 3) * Math.min(1, r / 15) * Math.exp(-r / 60) * 5;
  const n = (fbm(x * 0.05 + 10, z * 0.05 + 10) - 0.5) * 6 * Math.min(1, r / 12);
  const dome = r < 6 ? (fbm(x * 0.3, z * 0.3) - 0.5) * 0.6 : 0;
  return base + ridges + n + dome;
}

export function ftToY(ft: number) {
  return (MOUNTAIN_H * (ft - FT_BASE)) / (FT_TOP - FT_BASE);
}

/** Bearing of each route node around the mountain (radians; +z faces the camera, i.e. south). */
const NODE_ANGLES = [100, 96, 84, 58, 50, 62, 75, 90].map((d) => (d * Math.PI) / 180);

function radiusFor(theta: number, y: number) {
  let lo = 0;
  let hi = TERRAIN_SIZE / 2 - 4;
  const h = (r: number) => heightAt(r * Math.cos(theta), r * Math.sin(theta));
  if (y >= h(0)) return 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (h(mid) > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type Vec3 = [number, number, number];

function buildPath() {
  const pts: Vec3[] = [];
  const nodeIndex: number[] = [];
  const STEPS = 18;
  for (let i = 0; i < NODES.length - 1; i++) {
    nodeIndex.push(pts.length);
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS;
      const ft = NODES[i].ft + (NODES[i + 1].ft - NODES[i].ft) * t;
      // Switchback wiggle so the trail doesn't look ruled.
      const wiggle = Math.sin(t * Math.PI * 4) * 0.035 * (i >= 2 ? 1 : 0.5);
      const th = NODE_ANGLES[i] + (NODE_ANGLES[i + 1] - NODE_ANGLES[i]) * t + wiggle;
      const r = radiusFor(th, ftToY(ft));
      const x = r * Math.cos(th);
      const z = r * Math.sin(th);
      pts.push([x, heightAt(x, z), z]);
    }
  }
  nodeIndex.push(pts.length);
  const top = [0.4, heightAt(0.4, 0.4), 0.4] as Vec3;
  pts.push(top);
  return { pts, nodeIndex };
}

export const ROUTE = buildPath();

export function nodePosition(i: number): Vec3 {
  return ROUTE.pts[ROUTE.nodeIndex[i]];
}

/** Vertex color for a terrain point. Returns [r, g, b] in 0..1. */
export function terrainColor(x: number, y: number, z: number, slope: number): Vec3 {
  const n = fbm(x * 0.12, z * 0.12);
  const snowline = ftToY(6800) + (n - 0.5) * 6;
  const treeline = ftToY(5900) + (n - 0.5) * 4;
  if (y < treeline) {
    // Subalpine forest and meadow around Paradise.
    const g = 0.25 + n * 0.15;
    return [0.13 + n * 0.08, g, 0.15];
  }
  const rocky = slope > 1.05 || (fbm(x * 0.07 + 40, z * 0.07) > 0.68 && y < ftToY(13500));
  if (y < snowline || rocky) {
    const v = 0.26 + n * 0.14;
    return [v + 0.05, v, v - 0.02];
  }
  // Snow and glacier ice, a little bluer where the glaciers flow.
  const ice = fbm(x * 0.04 - 20, z * 0.04 + 7);
  const blue = ice > 0.55 ? (ice - 0.55) * 0.6 : 0;
  const shade = 0.9 + n * 0.1;
  return [shade - blue * 0.6, shade - blue * 0.25, Math.min(1, shade + 0.04)];
}
