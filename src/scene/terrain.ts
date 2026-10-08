// Procedural Mount Rainier: a broad volcanic cone with radial ridges and noise,
// plus the Disappointment Cleaver route projected onto its surface.
import { NODES } from '../game/route';

export const MOUNTAIN_H = 60;
export const TERRAIN_SIZE = 280;
export const TERRAIN_SEGMENTS = 300;
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

export function heightAt(x: number, z: number) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const base = MOUNTAIN_H / (1 + Math.pow(r / 26, 2.3));
  const ridges = Math.pow(Math.abs(Math.sin(th * 5 + r * 0.04)), 3) * Math.min(1, r / 15) * Math.exp(-r / 60) * 5;
  const n = (fbm(x * 0.05 + 10, z * 0.05 + 10) - 0.5) * 6 * Math.min(1, r / 12);
  const dome = r < 6 ? (fbm(x * 0.3, z * 0.3) - 0.5) * 0.6 : 0;
  // Eroded gullies and rock ribs running down the flanks.
  const flank = Math.min(1, r / 10) * Math.exp(-r / 85);
  const ridged = 1 - Math.abs(fbm(x * 0.11 - 4, z * 0.11 + 9, 5) * 2 - 1);
  const gullies = (ridged * ridged - 0.35) * 2.4 * flank;
  // Fine surface texture: seracs, moraine and rock steps.
  const detail = (fbm(x * 0.35 + 3, z * 0.35 - 6, 3) - 0.5) * 0.9 * Math.min(1, r / 8);
  return base + ridges + n + dome + gullies + detail;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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

// Linear-space colors, picked from photos of the mountain in July.
const FOREST: Vec3 = [0.035, 0.07, 0.04];
const MEADOW: Vec3 = [0.16, 0.2, 0.08];
const ROCK: Vec3 = [0.16, 0.14, 0.13];
const ROCK_DARK: Vec3 = [0.07, 0.065, 0.065];
const ROCK_RED: Vec3 = [0.2, 0.12, 0.09]; // oxidized andesite, like the Cleaver
const SNOW: Vec3 = [0.86, 0.89, 0.93];
const GLACIER: Vec3 = [0.6, 0.74, 0.86];

/** Vertex color for a terrain point. Returns [r, g, b] in 0..1 (linear). */
export function terrainColor(x: number, y: number, z: number, slope: number): Vec3 {
  const n = fbm(x * 0.12, z * 0.12);
  const fine = fbm(x * 0.6 + 3, z * 0.6 - 2, 3);
  const treeline = ftToY(5900) + (n - 0.5) * 4;
  const snowline = ftToY(6800) + (n - 0.5) * 7;

  // Bare ground: forest and meadow low down, rock above.
  let rock = mix3(ROCK, ROCK_DARK, smooth(0.35, 0.75, fine));
  rock = mix3(rock, ROCK_RED, smooth(0.6, 0.8, fbm(x * 0.05 + 40, z * 0.05 - 13)) * 0.7);
  const green = mix3(FOREST, MEADOW, smooth(0.45, 0.7, n));
  let c = mix3(rock, green, 1 - smooth(treeline - 1.5, treeline + 1.5, y));

  // Snow and glacier cover everything above the snowline except the steepest ground for that
  // height (rock ribs like the Cleaver) and a few wind-scoured buttresses. The cone steepens
  // with height, so "steep" is measured against the typical slope at this elevation.
  const typical = Math.min(1.85, 0.12 + 0.04 * Math.max(0, y));
  const steep = smooth(typical * 1.2, typical * 1.5, slope);
  const scoured = smooth(0.7, 0.76, fbm(x * 0.07 + 40, z * 0.07)) * (1 - smooth(ftToY(12500), ftToY(13500), y)) * 0.6;
  const cover = smooth(snowline - 2, snowline + 2, y) * (1 - steep) * (1 - scoured);
  const ice = smooth(0.5, 0.65, fbm(x * 0.04 - 20, z * 0.04 + 7)) * smooth(ftToY(7500), ftToY(9000), y);
  const snow = mix3(SNOW, GLACIER, ice * 0.6);
  c = mix3(c, snow, cover);

  // Soft cavity shading so gullies read without real-time shadows.
  const shade = 0.82 + 0.18 * fine;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}
