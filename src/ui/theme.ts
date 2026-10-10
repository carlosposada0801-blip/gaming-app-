import { packWeightLb } from '../game/gear';
import { has, routeOf } from '../game/helpers';
import { partnerHas } from '../game/partners';
import type { GameState } from '../game/types';
import type { ClimberLook } from '../scene/Climber';

// Alpine-start palette: pre-dawn slate, glacier ice, and rescue-orange hardware.
export const C = {
  bg: '#0c141e',
  panel: '#131e2b',
  raised: '#1a2838',
  line: '#26374b',
  text: '#e7eef5',
  muted: '#8ea3b8',
  faint: '#5d7186',
  accent: '#ff6a2b',
  accentDim: '#5a2a16',
  ice: '#9fd3f2',
  good: '#5cc98a',
  warn: '#f2c14e',
  bad: '#ef5b5b',
};

export const NUM = { fontVariant: ['tabular-nums' as const] };

/** Past high camp, or leaving it on summit day: helmets, harnesses and crampons on. */
const aboveCamp = (s: GameState) => {
  const camp = routeOf(s).camp;
  return s.node >= camp && !(s.node === camp && !s.slept && s.dir === 'up');
};

export function climberLook(s: GameState): ClimberLook {
  const above = aboveCamp(s);
  let jacket = '#4a6fa5';
  let bulky = false;
  if (s.layer >= 1 && (has(s, 'fleece') || has(s, 'cotton'))) jacket = has(s, 'fleece') ? '#3f7d5c' : '#8a8f96';
  if (s.layer >= 2 && has(s, 'shell_jacket')) jacket = '#c8322b';
  if (s.layer >= 3 && has(s, 'parka')) { jacket = '#e8a21a'; bulky = true; }
  const lb = packWeightLb(s.packed, s.campLeft);
  return {
    jacket,
    bulky,
    helmet: has(s, 'helmet') && above,
    glasses: has(s, 'glasses'),
    headlamp: has(s, 'headlamp'),
    axe: has(s, 'axe') && (above || !has(s, 'poles')),
    poles: has(s, 'poles'),
    crampons: (has(s, 'crampons_steel') || has(s, 'crampons_alu')) && above,
    harness: has(s, 'harness') && above,
    rope: has(s, 'rope'),
    pack: Math.max(0.75, Math.min(1.5, 0.75 + (lb - 20) / 40)),
  };
}

export function partnerLook(s: GameState): ClimberLook {
  const above = aboveCamp(s);
  return {
    jacket: s.partner === 'guide' ? '#1f6f5c' : s.layer >= 3 ? '#4f8fd6' : '#6b4aa8',
    bulky: s.layer >= 3,
    helmet: above && partnerHas(s, 'helmet'),
    glasses: true,
    headlamp: true,
    axe: above,
    poles: !above,
    crampons: above,
    harness: above,
    rope: false,
    pack: s.campLeft ? 0.85 : 1.15,
  };
}

export function statColor(v: number, inverted = false) {
  const x = inverted ? 100 - v : v;
  if (x < 25) return C.bad;
  if (x < 50) return C.warn;
  return C.ice;
}
