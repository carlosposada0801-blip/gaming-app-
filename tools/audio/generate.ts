/// <reference types="node" />
// Synthesizes every sound effect in the game from noise and sine waves, so there are no
// third-party recordings to license or credit. Writes 16-bit mono WAVs to assets/sounds/.
//   npx tsx tools/audio/generate.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 22050;
const OUT = join(__dirname, '..', '..', 'assets', 'sounds');
mkdirSync(OUT, { recursive: true });
// Seeded random so the files are the same on every run.
let seed = 20260709;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
const white = () => rand() * 2 - 1;

function wav(name: string, data: Float32Array) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i] * gain)) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, `${name}.wav`), buf);
  console.log(`${name}.wav  ${(data.length / RATE).toFixed(2)} s  ${(buf.length / 1024).toFixed(0)} KB`);
}

/** Biquad band-pass (RBJ cookbook), center frequency can change per sample. */
function bandpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number, f: number, q: number) => {
    const w = (2 * Math.PI * f) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const y = ((alpha * x) - (alpha * x2) - (-2 * Math.cos(w)) * y1 - (1 - alpha) * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function lowpass(cut: number) {
  const k = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
  let y = 0;
  return (x: number) => (y += k * (x - y));
}

/** Smooth random 0..1 curve, a new target every `period` seconds. */
function drift(period: number) {
  let from = rand();
  let to = rand();
  let t = 0;
  return () => {
    t += 1 / (RATE * period);
    if (t >= 1) { t -= 1; from = to; to = rand(); }
    const e = t * t * (3 - 2 * t);
    return from + (to - from) * e;
  };
}

/** Make a buffer loop seamlessly by crossfading its tail into its head. */
function loopable(data: Float32Array, fade: number) {
  const n = Math.round(fade * RATE);
  const out = data.slice(0, data.length - n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out[i] = data[i] * Math.sqrt(t) + data[data.length - n + i] * Math.sqrt(1 - t);
  }
  return out;
}

const seconds = (s: number) => new Float32Array(Math.round(s * RATE));

// ---------- wind: a low steady roar ----------
{
  const d = seconds(9);
  const lp1 = lowpass(380);
  const lp2 = lowpass(380);
  const swell = drift(1.6);
  for (let i = 0; i < d.length; i++) d[i] = lp2(lp1(white())) * (0.55 + 0.45 * swell());
  wav('wind', loopable(d, 1.5));
}

// ---------- gusts: whistling over rock and the pack, rising and falling ----------
{
  const d = seconds(10);
  const bp = bandpass();
  const bp2 = bandpass();
  const pitch = drift(1.1);
  const amp = drift(0.8);
  for (let i = 0; i < d.length; i++) {
    const p = pitch();
    const a = Math.pow(amp(), 2.2);
    d[i] = (bp(white(), 500 + 900 * p, 6) + 0.5 * bp2(white(), 1400 + 1300 * p, 9)) * a;
  }
  wav('gust', loopable(d, 1.5));
}

// ---------- breathing: one hard breath at altitude (in through the mouth, out harder) ----------
{
  const d = seconds(2.2);
  const bp = bandpass();
  const lp = lowpass(2500);
  for (let i = 0; i < d.length; i++) {
    const t = i / RATE;
    let env = 0;
    let f = 900;
    if (t < 0.75) { env = Math.sin((Math.PI * t) / 0.75) * 0.6; f = 1100 + 500 * (t / 0.75); }
    else if (t > 0.85 && t < 1.85) { const u = (t - 0.85) / 1.0; env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.4); f = 750 - 200 * u; }
    d[i] = lp(bp(white(), f, 1.3)) * env;
  }
  wav('breath', d);
}

// ---------- crampons into snow: a crisp crunch of many tiny fractures ----------
for (let v = 1; v <= 3; v++) {
  const d = seconds(0.26);
  const bp = bandpass();
  const lp = lowpass(5000);
  const grains = 30 + Math.floor(rand() * 25);
  const hits: number[] = [];
  for (let g = 0; g < grains; g++) hits.push(Math.floor(Math.pow(rand(), 1.6) * d.length * 0.8));
  let crack = 0;
  for (let i = 0; i < d.length; i++) {
    if (hits.includes(i)) crack = 0.6 + rand() * 0.6;
    crack *= 0.985;
    const t = i / d.length;
    const env = Math.min(1, t * 40) * Math.pow(1 - t, 2);
    d[i] = lp(bp(white(), 1800 + 900 * v, 1.1)) * (0.35 * env + crack);
  }
  wav(`snow${v}`, d);
}

// ---------- crampons on rock: steel points scraping and ringing ----------
for (let v = 1; v <= 2; v++) {
  const d = seconds(0.32);
  const bp = bandpass();
  const bp2 = bandpass();
  const ring = [3100 + 400 * v, 4700 + 300 * v, 6900];
  for (let i = 0; i < d.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t * 120) * Math.exp(-t * 11);
    const scrape = bp(white(), 2600 + 1800 * (1 - t / 0.32), 3) + 0.6 * bp2(white(), 5200, 5);
    const tone = ring.reduce((sum, f, k) => sum + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (28 + 10 * k)), 0) * 0.25;
    d[i] = (scrape * env + tone) * (rand() < 0.002 ? 2 : 1);
  }
  wav(`rock${v}`, d);
}

// ---------- boots on the dirt trail: a soft thud and a little gravel ----------
for (let v = 1; v <= 2; v++) {
  const d = seconds(0.22);
  const lp = lowpass(260);
  const bp = bandpass();
  for (let i = 0; i < d.length; i++) {
    const t = i / RATE;
    const thud = lp(white()) * Math.exp(-t * 32) * 3;
    const grit = bp(white(), 2200 + 500 * v, 1.5) * Math.exp(-t * 18) * (rand() < 0.04 ? 1 : 0.25);
    d[i] = thud + grit;
  }
  wav(`dirt${v}`, d);
}

// ---------- carabiner clink: inharmonic partials of a small aluminum bar ----------
for (let v = 1; v <= 2; v++) {
  const d = seconds(0.45);
  const partials = [2150, 3480, 5240, 7900].map((f) => f * (v === 1 ? 1 : 1.13));
  for (let i = 0; i < d.length; i++) {
    const t = i / RATE;
    let s = 0;
    partials.forEach((f, k) => { s += Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t * (9 + 7 * k)) / (k + 1); });
    // A second, softer hit a moment later.
    const t2 = t - 0.07;
    if (t2 > 0) partials.forEach((f, k) => { s += 0.4 * Math.sin(2 * Math.PI * f * 1.01 * t2) * Math.exp(-t2 * (12 + 7 * k)) / (k + 1); });
    d[i] = s * Math.min(1, t * 2000);
  }
  wav(`clink${v}`, d);
}

// ---------- rope dragging over snow ----------
{
  const d = seconds(0.6);
  const bp = bandpass();
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    const env = Math.sin(Math.PI * t) ** 1.5;
    d[i] = bp(white(), 700 + 1500 * t, 0.9) * env;
  }
  wav('rope', d);
}
