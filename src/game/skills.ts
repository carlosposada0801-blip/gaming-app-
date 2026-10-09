// How a performed skill turns into an outcome. Each function keeps the event's original outcome
// shape and only moves the numbers: the gear checks that decide which options exist stay in
// events.ts. Performance `perf` is 0 (botched) .. 1 (textbook).
import { crampons, has } from './helpers';
import { LEGS } from './route';
import type { GameState, Outcome } from './types';

/** The leg the party is on (or just finished), for its slope. */
export function legOf(s: GameState) {
  return Math.max(0, Math.min(LEGS.length - 1, s.dir === 'up' ? s.node - 1 : s.node));
}

/**
 * Chance a self-arrest stops you. Fast, committed technique matters most; steeper slopes and dull
 * crampon points (which catch, flip you, and are a reason to keep your feet up) make it harder.
 */
export function arrestOdds(s: GameState, perf: number) {
  const slope = LEGS[legOf(s)].slopeDeg;
  let p = 0.15 + 0.95 * perf;
  p -= Math.max(0, slope - 28) * 0.012;
  if (s.flags.cramponsDull) p -= 0.08;
  if (!crampons(s)) p -= 0.05;
  return Math.max(0.02, Math.min(0.97, p));
}

/** Prusiking out of a crevasse: steady rhythm is fast and warm; flailing burns you out. */
export function prusikOutcome(perf: number): Outcome {
  if (perf < 0.2) {
    return {
      text: 'Your loops tangle and your arms give out halfway up. Your partner rigs a haul and drags you over the lip.',
      minutes: 85,
      delta: { stamina: -24, warmth: -20, morale: -10 },
      tone: 'bad',
    };
  }
  const slack = 1 - perf;
  return {
    text: perf > 0.75
      ? 'Foot loop, waist loop, slide, stand. A clean rhythm, and you flop over the lip.'
      : 'Slide, stand, slip, try again. It takes a while, but you flop over the lip.',
    minutes: Math.round(25 + slack * 35),
    delta: { stamina: -Math.round(9 + slack * 14), warmth: -Math.round(5 + slack * 9) },
    tone: 'good',
  };
}

/** Helping your partner build a 3:1 Z-pulley: rigging in the right order, then hauling together. */
export function zpulleyOutcome(s: GameState, perf: number): Outcome {
  const base = has(s, 'picket') ? 50 : 75;
  const slack = 1 - perf;
  return {
    text: perf > 0.75
      ? (has(s, 'picket') ? 'Picket buried, prusik on, pulley clipped. Three clean hauls and you’re out.' : 'An axe anchor, a prusik, a pulley. Smooth hauls, and you’re out.')
      : 'The system slips twice before it holds. Slow, cold work, but you’re out.',
    minutes: Math.round(base * (0.75 + slack * 0.7)),
    delta: { stamina: -Math.round(5 + slack * 6), warmth: -Math.round(10 + slack * 16), morale: perf > 0.75 ? 4 : -6 },
    tone: 'good',
  };
}

/** Walking a ladder over a crevasse, clipped to the hand line. */
export function ladderOutcome(perf: number): Outcome {
  if (perf < 0.25) {
    return {
      text: 'A crampon skates off a rung and you lurch sideways. The hand line catches your harness. Shaking, you finish on your knees.',
      minutes: 25,
      delta: { stamina: -8, morale: -12 },
      tone: 'bad',
    };
  }
  return {
    text: perf > 0.75 ? 'Front points between the rungs, eyes on the far side. Done.' : 'A wobble in the middle, but you keep your feet. Done.',
    minutes: Math.round(10 + (1 - perf) * 10),
    delta: { morale: Math.round(5 - (1 - perf) * 8) },
    tone: 'good',
  };
}
