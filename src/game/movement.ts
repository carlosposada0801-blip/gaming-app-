// Walking the route meter by meter. The thumbstick (and the simulation) call `walk` with a
// distance; stamina, water, food, warmth, altitude sickness and the clock change with every step.
// Reaching a stop runs the same arrival rules as before: weather, turnaround, events.
//
// Calibration: walking a whole leg at a steady pace on the boot track costs about what the old
// one-tap leg cost (same per-100-ft gain rates, same leg times), so the event balance carries over.
// Two things are new and deliberately change the numbers: altitude makes each step harder, and above
// Camp Muir the rest-step rhythm can save or waste stamina.
import {
  PACE_AMS, PACE_STAMINA, canMove, checkVitals, clampStats, clone, elevAt, fmtDuration, has, legMinutes, log,
  profileOf, rollEvent, routeOf, stateRng, summitOf, thermal, updateWeather,
} from './engine';
import { partnerLine } from './partners';
import { packWeightLb } from './gear';
import { DAY, formatClock, formatFt, isNight } from './route';
import type { GameState, Pace, Rng } from './types';
import { SEASONS } from './season';

/** Game seconds per real second while walking: Paradise to Camp Muir is about 12 minutes of play. */
export const TIME_SCALE = 32;

const M_TO_FT = 3.28084;

export interface Stride {
  pace: Pace;
  /** How well the climber is keeping the rest-step rhythm, 0..1 (only matters above Camp Muir going up). */
  rhythm: number;
  /** Wanted sideways offset from the boot track (m); clamped to the corridor. */
  lateral: number;
}

/** Leg containing a distance along the route. */
export function legAt(s: GameState, d = s.dist) {
  const nd = profileOf(s).nodeDist;
  const n = routeOf(s).legs.length;
  for (let i = 0; i < n; i++) if (d < nd[i + 1]) return i;
  return n - 1;
}

export const legLength = (s: GameState, i: number) => profileOf(s).nodeDist[i + 1] - profileOf(s).nodeDist[i];

/** How far you can stray from the boot track here (m). */
export const corridor = (s: GameState, d = s.dist) => routeOf(s).legs[legAt(s, d)].corridor;

/** Off the track by more than this and you're breaking trail. */
export const ON_TRACK_M = 1.5;

/** The stop the party is walking toward, or null when standing on top waiting to start down. */
export function targetNode(s: GameState): number | null {
  const at = profileOf(s).nodeDist[s.node];
  if (s.dir === 'up') {
    if (s.dist < at - 1) return s.node; // went back below the last stop, heading up to it again
    return s.node >= summitOf(s) ? null : s.node + 1;
  }
  if (s.dist > at + 1) return s.node; // turned back mid-leg: first return to the stop below
  return s.node > 0 ? s.node - 1 : null;
}

/** Walking speed (m per game minute) at a pace, on the leg you're on. */
export function speed(s: GameState, pace: Pace) {
  const i = legAt(s);
  const minutes = legMinutes(s, pace, i);
  return minutes > 0 ? legLength(s, i) / minutes : 0;
}

/** Rest-stepping matters on the upper mountain (above high camp), going up. */
export function restStepActive(s: GameState) {
  return s.dir === 'up' && s.dist >= profileOf(s).nodeDist[routeOf(s).camp] - 1 && s.node < summitOf(s);
}

/**
 * Breaths per step in a rest step. Guides teach one breath per step low on the upper mountain,
 * two around 13,000 ft and three near the summit. The exact switch points vary by climber;
 * these are a reasonable middle, not a rule.
 */
export function breathsPerStep(elevM: number) {
  if (elevM < 3700) return 1;
  if (elevM < 4100) return 2;
  return 3;
}

/** Real seconds between rest-step beats on screen. */
export const beatSeconds = (elevM: number) => 0.9 * breathsPerStep(elevM) + 0.3;

/** Each step costs more as the air thins: ~0.85x at Paradise, ~1.15x on the summit. */
function altitudeFactor(elevM: number) {
  return 0.85 + 0.3 * Math.max(0, Math.min(1, (elevM - 1600) / 2800));
}

/**
 * Walk `meters` along the route (positive = in the direction of travel, negative = back).
 * Mutates `s`. Returns the meters actually covered (0 if blocked).
 */
export function walkMut(s: GameState, meters: number, stride: Stride, rng: Rng = stateRng(s)): number {
  if (s.ending || s.pendingEvent || meters === 0) return 0;
  // On top, pushing forward starts the descent.
  const R = routeOf(s);
  const nodeDist = profileOf(s).nodeDist;
  if (s.dir === 'up' && s.node === summitOf(s) && meters > 0) {
    s.dir = 'down';
    log(s, 'Starting down from Columbia Crest.', 'info');
  }
  if (!canMove(s).ok) return 0;
  const target = targetNode(s);
  if (target === null) return 0;

  const from = nodeDist[s.node];
  const to = nodeDist[target];
  const forward = Math.sign(to - from) || (s.dir === 'up' ? 1 : -1);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const d0 = s.dist;
  const d1 = Math.max(lo, Math.min(hi, d0 + forward * meters));
  const moved = Math.abs(d1 - d0);
  if (moved < 1e-6) return 0;

  // Leaving a stop.
  if (Math.abs(d0 - from) < 1) {
    s.legStart = s.clock;
    if (s.dir === 'up' && s.node === R.camp) s.campLeft = true; // sleeping bag, pad, stove stay at camp
  }

  const i = legAt(s, (d0 + d1) / 2);
  const leg = R.legs[i];
  const e0 = elevAt(s, d0);
  const e1 = elevAt(s, d1);
  const gainFt = Math.max(0, e1 - e0) * M_TO_FT;
  const lossFt = Math.max(0, e0 - e1) * M_TO_FT;
  const minutes = moved * (legMinutes(s, stride.pace, i) / legLength(s, i));
  const hours = minutes / 60;

  s.lateral = Math.max(-leg.corridor, Math.min(leg.corridor, stride.lateral));
  const offTrack = Math.abs(s.lateral) > ON_TRACK_M;
  if (offTrack) s.legOffTrack += moved;

  // Stamina: the same per-foot rates as a whole leg used to cost, scaled by everything else.
  const lb = packWeightLb(s.packed, s.campLeft);
  const weightFactor = 1 + Math.max(0, lb - 30) * 0.015;
  let cost = (gainFt / 100) * 1.1 + (lossFt / 100) * 0.35;
  cost *= PACE_STAMINA[stride.pace] * weightFactor * altitudeFactor((e0 + e1) / 2);
  if (s.stats.energy < 25) cost *= 1.4;
  if (s.stats.hydration < 25) cost *= 1.3;
  if (s.stats.ams > 70) cost *= 1.3;
  if (i < R.camp && !has(s, 'poles')) cost *= 1.08;
  if (leg.terrain !== 'trail' && has(s, 'boots_hiking')) cost *= 1.12;
  if (s.weather === 'storm' || s.weather === 'whiteout') cost *= 1.2;
  if (offTrack) cost *= 1.3; // post-holing in untracked snow
  if (i < R.camp && SEASONS[s.season].softSnow && !has(s, 'snowshoes')) cost *= 1.2; // spring: sinking in
  if (s.flags.frostbiteFeet) cost *= 1.15;
  if (restStepActive(s) && forward * (d1 - d0) > 0) cost *= 1.15 - 0.4 * Math.max(0, Math.min(1, stride.rhythm));
  s.stats.stamina -= cost;

  // Water, food and warmth by time on the move.
  const sunny = s.weather === 'clear' && !isNight(s.clock, s.season);
  s.stats.hydration -= hours * (8 + (sunny ? 2 : 0));
  s.stats.energy -= hours * 7 * (stride.pace === 'push' ? 1.2 : 1);
  thermal(s, hours, true, ((e0 + e1) / 2) * M_TO_FT, stride.pace);

  // Altitude: climbing above 8,000 ft builds it, losing height relieves it.
  const ft0 = e0 * M_TO_FT;
  const ft1 = e1 * M_TO_FT;
  if (gainFt > 0) {
    const above = Math.max(0, ft1 - Math.max(ft0, 8000));
    const dry = s.stats.hydration < 35 ? 1.4 : 1;
    s.stats.ams += (above / 1000) * 5.5 * PACE_AMS[stride.pace] * s.susceptibility * dry;
    s.partnerAms += (above / 1000) * 5.5 * PACE_AMS[stride.pace] * s.partnerSusceptibility;
  } else if (lossFt > 0) {
    s.stats.ams -= (lossFt / 1000) * 12;
    s.partnerAms = Math.max(0, s.partnerAms - (lossFt / 1000) * 12);
  }

  s.clock += minutes;
  s.dist = d1;
  clampStats(s);
  checkVitals(s);
  if (s.ending) return moved;

  if (Math.abs(d1 - to) < 1e-6) arriveMut(s, target, rng);
  return moved;
}

/** Arriving at a stop: the per-leg effects and checks that used to run at the end of a leg. */
function arriveMut(s: GameState, to: number, rng: Rng) {
  const R = routeOf(s);
  const NODES = R.nodes;
  const from = s.node;
  const leg = Math.min(from, to);
  const minutes = s.clock - s.legStart;
  s.dist = profileOf(s).nodeDist[to];

  if (to === from) {
    // Back at the stop you had left.
    log(s, `Back at ${NODES[to].name}.`, 'info');
    s.legStart = s.clock;
    s.legOffTrack = 0;
    return;
  }

  s.prevNode = from;
  s.node = to;
  s.moveId += 1;
  s.restsHere = 0;

  if (s.stats.energy <= 0) { s.stats.stamina -= 8; s.stats.morale -= 8; }
  if (s.stats.hydration <= 0) { s.stats.stamina -= 8; s.stats.ams += 8; }
  if (s.weather === 'storm') s.stats.morale -= 8;
  else if (s.weather === 'whiteout') s.stats.morale -= 5;
  else if (s.weather === 'clear') s.stats.morale += 2;
  if (s.stats.ams > 40) s.stats.morale -= 4;

  if (s.dir === 'up' && R.legs[leg].hazards.whiteout && has(s, 'wands') && !s.flags.wandsPlaced) {
    s.flags.wandsPlaced = true;
    log(s, 'You placed wands every rope length across the snowfield.', 'info');
  }
  if (s.dir === 'down' && to === R.camp) s.campLeft = false;

  const verb = s.dir === 'up' ? 'Reached' : 'Down to';
  log(s, `${verb} ${NODES[to].name} (${formatFt(NODES[to].ft)}) after ${fmtDuration(minutes)}.`);
  if (s.dir === 'up' && to === summitOf(s)) s.summited = true;
  if (s.dir === 'up' && s.clock > s.turnaround && s.clock > DAY && !s.flags.pushedPastTurnaround) {
    s.flags.pushedPastTurnaround = true;
    log(s, `Past your ${formatClock(s.turnaround)} turnaround time. Snow bridges soften and rockfall picks up as the day warms.`, 'bad');
  }
  if (s.flags.cottonWet && !s.usedEvents.includes('cotton_note')) {
    s.usedEvents.push('cotton_note');
    log(s, 'Your cotton hoodie is soaked with sweat and won’t dry.', 'bad');
  }

  updateWeather(s, rng);
  clampStats(s);
  checkVitals(s);
  const ctx = { leg, dir: s.dir, start: s.legStart, minutes, offTrack: s.legOffTrack };
  s.legStart = s.clock;
  s.legOffTrack = 0;
  if (s.ending) return;
  if (s.dir === 'down' && s.node === 0) {
    s.ending = s.summited ? 'summit' : 'retreat';
    log(s, `Back at the ${NODES[0].name} trailhead.`, 'good');
    return;
  }
  rollEvent(s, ctx, rng);
  const line = partnerLine(s);
  if (line) {
    s.partnerSays = line;
    log(s, line, 'info');
  }
}

/** Pure version for callers that keep immutable state. */
export function walk(prev: GameState, meters: number, stride: Stride, rng?: Rng): GameState {
  const s = clone(prev);
  walkMut(s, meters, stride, rng ?? stateRng(s));
  return s;
}

/** Name of the stop ahead, for the HUD. */
export function nextStopName(s: GameState) {
  const t = targetNode(s);
  return t === null ? null : routeOf(s).nodes[t].name;
}

/** Meters to the stop ahead. */
export function metersToNext(s: GameState) {
  const t = targetNode(s);
  return t === null ? 0 : Math.abs(profileOf(s).nodeDist[t] - s.dist);
}
