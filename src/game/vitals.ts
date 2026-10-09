// What a fingertip pulse oximeter would read. Approximate, for a game: real readings vary by
// several points between people, with cold fingers, and with how still you hold your hand.
//
// SpO2 baseline by altitude follows typical published values for climbers on a fast ascent
// (no time to acclimatize): about 97-98% at sea level, 95-96% at Paradise (1,650 m), around 90-92%
// at Camp Muir (3,100 m) and in the low to mid 80s near the summit (4,390 m). Readings drop a few
// points while working hard, and climbers who are getting sick tend to read lower than their
// partners at the same height. SpO2 alone does not diagnose altitude sickness.
//
// Heart rate: resting pulse rises a few beats per 1,000 m; climbing pace sets most of it.
// The numbers here are plausible ranges, not measurements.
import { elevAt } from './engine';
import type { GameState, Pace } from './types';

const SPO2_ALT = [0, 1600, 2500, 3100, 3700, 4000, 4400];
const SPO2_VAL = [98, 96, 93.5, 91, 88, 86, 83.5];

/** Typical SpO2 at rest for a climber on a fast ascent, by elevation (m). */
export function baseline(elevM: number) {
  if (elevM <= SPO2_ALT[0]) return SPO2_VAL[0];
  for (let i = 1; i < SPO2_ALT.length; i++) {
    if (elevM <= SPO2_ALT[i]) {
      const t = (elevM - SPO2_ALT[i - 1]) / (SPO2_ALT[i] - SPO2_ALT[i - 1]);
      return SPO2_VAL[i - 1] + (SPO2_VAL[i] - SPO2_VAL[i - 1]) * t;
    }
  }
  return SPO2_VAL[SPO2_VAL.length - 1];
}

/** Small, steady wobble so the display doesn't look like a formula (changes every 2 game minutes). */
function wobble(clock: number, salt: number) {
  const x = Math.sin(Math.floor(clock / 2) * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2; // -1..1
}

const workDrop = (pace: Pace | null) => (pace === 'push' ? 4 : pace === 'steady' ? 2.5 : pace === 'rest' ? 1.5 : 0);

/** How a reading compares with what's typical here and now: a few points low is a warning. */
export function oxConcern(spo2: number, s: GameState, pace: Pace | null): 'ok' | 'low' | 'very low' {
  const typical = baseline(elevAt(s.dist)) - workDrop(pace);
  if (spo2 < typical - 6) return 'very low';
  if (spo2 < typical - 3) return 'low';
  return 'ok';
}

export interface PulseOx {
  spo2: number;
  hr: number;
}

/** Your reading. `pace` is null when standing still. */
export function readPulseOx(s: GameState, pace: Pace | null): PulseOx {
  const elev = elevAt(s.dist);
  const spo2 = baseline(elev) - workDrop(pace) - s.stats.ams * 0.07 - (s.stats.hydration < 25 ? 1 : 0) + wobble(s.clock, 1);
  const rest = 64 + 5 * (elev / 1000);
  const effort = pace === 'push' ? 82 : pace === 'steady' ? 62 : pace === 'rest' ? 45 : 0;
  let hr = rest + effort;
  if (s.stats.stamina < 25) hr += 12;
  if (s.stats.hydration < 25) hr += 8;
  if (s.stats.warmth < 30) hr -= 6; // cold, slow, shutting down
  hr += s.stats.ams * 0.15 + wobble(s.clock, 2) * 3;
  return { spo2: Math.round(Math.min(99, spo2)), hr: Math.round(hr) };
}

/** Your partner's reading: same height, their own altitude sickness. */
export function readPartnerOx(s: GameState, pace: Pace | null): PulseOx {
  const elev = elevAt(s.dist);
  const spo2 = baseline(elev) - workDrop(pace) - s.partnerAms * 0.1 + wobble(s.clock, 3);
  const effort = pace === 'push' ? 80 : pace === 'steady' ? 60 : pace === 'rest' ? 44 : 0;
  const hr = 66 + 5 * (elev / 1000) + effort + s.partnerAms * 0.25 + wobble(s.clock, 4) * 3;
  return { spo2: Math.round(Math.min(99, spo2)), hr: Math.round(hr) };
}
