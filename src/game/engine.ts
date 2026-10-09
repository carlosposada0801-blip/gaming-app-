import { GEAR_BY_ID, packWeightLb } from './gear';
import {
  ALPINE_START, DAY, LEGS, MUIR, NODES, START_CLOCK, SUMMIT, formatClock, formatFt, isNight, minuteOfDay,
} from './route';
import type {
  ArrivalContext, Forecast, GameState, LayerLevel, Outcome, Pace, Rng, Stats, Weather,
} from './types';
import { EVENTS, EVENT_BY_ID } from './events';
import { NODE_DIST, PROFILE_DIST, PROFILE_ELEV } from './data/routeProfile';

// ---------- helpers ----------

import { crampons, has, roped } from './helpers';
export { crampons, has, roped };

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

export function log(s: GameState, text: string, tone?: 'good' | 'bad' | 'info') {
  s.log.unshift({ clock: s.clock, text, tone });
  if (s.log.length > 60) s.log.length = 60;
}

/** Elevation (m) at a distance along the route, from the real terrain profile. */
export function elevAt(d: number) {
  let lo = 0;
  let hi = PROFILE_DIST.length - 1;
  if (d <= 0) return PROFILE_ELEV[0];
  if (d >= PROFILE_DIST[hi]) return PROFILE_ELEV[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PROFILE_DIST[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - PROFILE_DIST[lo]) / (PROFILE_DIST[hi] - PROFILE_DIST[lo] || 1);
  return PROFILE_ELEV[lo] + (PROFILE_ELEV[hi] - PROFILE_ELEV[lo]) * t;
}

const M_TO_FT = 3.28084;

/** True when standing at a stop (not partway along a leg). */
export function atStop(s: GameState) {
  return Math.abs(s.dist - NODE_DIST[s.node]) < 1;
}

/** Where the party stands, in feet. At a stop this is the stop's published elevation. */
export function currentFt(s: GameState) {
  if (Math.abs(s.dist - NODE_DIST[s.node]) < 1) return NODES[s.node].ft;
  return elevAt(s.dist) * M_TO_FT;
}

export const WEATHER_LABEL: Record<Weather, string> = {
  clear: 'Clear',
  windy: 'High wind',
  whiteout: 'Whiteout',
  coldsnap: 'Cold snap',
  storm: 'Storm',
};

export { FORECAST_TEXT } from './helpers';

export const LAYER_LABEL: Record<LayerLevel, string> = {
  0: 'Base layer',
  1: 'Midlayer',
  2: 'Shells',
  3: 'Full kit',
};

// ---------- warmth ----------

export function insulation(s: GameState) {
  let total = 0;
  for (const id of s.packed) {
    const g = GEAR_BY_ID[id];
    if (!g || g.warmth === undefined || g.layer === undefined) continue;
    if (g.layer > s.layer) continue;
    if (id === 'cotton' && s.flags.cottonWet) {
      total -= 0.6; // wet cotton pulls heat out of you
      continue;
    }
    total += g.warmth;
  }
  return total;
}

export function coldIndex(s: GameState, ft = currentFt(s), clock = s.clock) {
  let c = (ft - 5000) / 1500;
  const m = minuteOfDay(clock);
  if (isNight(clock)) c += 2.5;
  else if (m > 600 && m < 1020 && s.weather === 'clear') c -= 1.5; // strong sun on snow
  c += { clear: 0, windy: 2, whiteout: 1, coldsnap: 2.5, storm: 3.5 }[s.weather];
  return c;
}

/** Apply warmth, sweat, and hydration for a stretch of time. */
export function thermal(s: GameState, hours: number, moving: boolean, ft: number) {
  const insul = insulation(s) + (moving ? 1.5 : 0);
  const diff = insul - coldIndex(s, ft);
  if (diff < 0) {
    s.stats.warmth += diff * 7 * hours;
  } else if (moving && diff > 4) {
    // Overdressed: sweating out water and burning energy.
    s.stats.hydration -= (diff - 4) * 4 * hours;
    s.stats.stamina -= (diff - 4) * 1.5 * hours;
    s.stats.warmth += 4 * hours;
    if (s.packed.includes('cotton') && s.layer >= 1 && !s.flags.cottonWet) {
      s.flags.cottonWet = true;
    }
  } else {
    s.stats.warmth += 6 * hours;
  }
}

export function warmthTrend(s: GameState): 'cold' | 'ok' | 'hot' {
  const diff = insulation(s) + 1.5 - coldIndex(s);
  if (diff < 0) return 'cold';
  if (diff > 4) return 'hot';
  return 'ok';
}

// ---------- weather ----------

const WORSE: Record<Weather, Weather[]> = {
  clear: ['windy'],
  windy: ['whiteout', 'coldsnap'],
  whiteout: ['storm'],
  coldsnap: ['storm'],
  storm: ['storm'],
};
const BETTER: Record<Weather, Weather> = {
  clear: 'clear', windy: 'clear', whiteout: 'windy', coldsnap: 'windy', storm: 'windy',
};

export function updateWeather(s: GameState, rng: Rng) {
  const day2 = s.clock >= DAY;
  const m = minuteOfDay(s.clock);
  let worsen = 0.05;
  let improve = 0.35;
  if (s.forecast === 'unsettled') {
    worsen = 0.1 + (day2 && m > 540 ? 0.2 : 0);
    improve = 0.2;
  } else if (s.forecast === 'incoming') {
    worsen = day2 && m > 300 ? 0.4 : 0.1;
    improve = 0.08;
  }
  const before = s.weather;
  const r = rng();
  if (r < worsen) {
    const opts = WORSE[s.weather];
    s.weather = opts[Math.floor(rng() * opts.length)];
  } else if (r < worsen + improve) {
    s.weather = BETTER[s.weather];
  }
  if (s.weather !== before) {
    const bad = ['clear', 'windy', 'whiteout', 'coldsnap', 'storm'].indexOf(s.weather) >
      ['clear', 'windy', 'whiteout', 'coldsnap', 'storm'].indexOf(before);
    log(s, `Weather: ${WEATHER_LABEL[before]} → ${WEATHER_LABEL[s.weather]}.`, bad ? 'bad' : 'good');
  }
}

// ---------- new game ----------

export function newGame(packed: string[], rng: Rng = Math.random): GameState {
  const f = rng();
  const forecast: Forecast = f < 0.45 ? 'stable' : f < 0.85 ? 'unsettled' : 'incoming';
  const s: GameState = {
    packed: [...packed],
    stats: { stamina: 100, warmth: 90, hydration: 85, energy: 85, ams: 0, morale: 75 },
    node: 0,
    dir: 'up',
    clock: START_CLOCK,
    weather: 'clear',
    forecast,
    layer: 0,
    water: packed.includes('water') ? 3 : 0,
    food: packed.includes('food') ? 6 : 0,
    slept: false,
    campLeft: false,
    turnaround: DAY + 600, // 10:00 AM on summit day
    susceptibility: 0.7 + rng() * 0.7,
    partnerAms: 0,
    partnerSusceptibility: 0.7 + rng() * 0.8,
    summited: false,
    flags: {},
    usedEvents: [],
    pendingEvent: 'ranger',
    lastOutcome: null,
    ending: null,
    log: [],
    moveId: 0,
    restsHere: 0,
    prevNode: 0,
    dist: NODE_DIST[0],
    lateral: 0,
    legStart: START_CLOCK,
    legOffTrack: 0,
  };
  log(s, `Paradise, ${formatClock(s.clock)}. Pack weight ${packWeightLb(packed)} lb.`, 'info');
  return s;
}

// ---------- travel ----------

const PACE_TIME: Record<Pace, number> = { rest: 1.3, steady: 1, push: 0.8 };
const PACE_STAMINA: Record<Pace, number> = { rest: 0.75, steady: 1, push: 1.35 };
const PACE_AMS: Record<Pace, number> = { rest: 0.6, steady: 1, push: 1.5 };
const WEATHER_TIME: Record<Weather, number> = { clear: 1, windy: 1.1, whiteout: 1.3, coldsnap: 1.05, storm: 1.5 };

export function legIndex(s: GameState) {
  return s.dir === 'up' ? s.node : s.node - 1;
}

export function legMinutes(s: GameState, pace: Pace, i = legIndex(s)) {
  const leg = LEGS[i];
  if (!leg) return 0;
  let t = leg.minutes * PACE_TIME[pace];
  if (s.dir === 'down') t *= 0.5;
  if (i >= 2 && !crampons(s)) t *= 1.5;
  if (i >= 1 && has(s, 'boots_hiking')) t *= 1.1;
  if (s.stats.stamina < 25) t *= 1.25;
  if (s.flags.snowBlind) t *= 1.2;
  if (s.flags.ankle) t *= 1.4;
  t *= WEATHER_TIME[s.weather];
  return Math.round(t);
}

export function canMove(s: GameState): { ok: boolean; reason?: string } {
  if (s.ending || s.pendingEvent) return { ok: false };
  if (s.dir === 'up' && s.node >= SUMMIT) return { ok: false, reason: 'You’re on top. Time to go down.' };
  if (isNight(s.clock) && !has(s, 'headlamp')) {
    return { ok: false, reason: 'Too dark to move without a headlamp. Wait for first light.' };
  }
  return { ok: true };
}

function travel(s: GameState, pace: Pace, rng: Rng) {
  const i = legIndex(s);
  const leg = LEGS[i];
  const from = s.node;
  const to = s.dir === 'up' ? from + 1 : from - 1;
  const minutes = legMinutes(s, pace);
  const hours = minutes / 60;
  const start = s.clock;

  if (s.dir === 'up' && from === MUIR) s.campLeft = true; // sleeping bag, pad, stove stay at Muir

  const gain = Math.max(0, NODES[to].ft - NODES[from].ft);
  const loss = Math.max(0, NODES[from].ft - NODES[to].ft);
  const lb = packWeightLb(s.packed, s.campLeft);
  const weightFactor = 1 + Math.max(0, lb - 30) * 0.015;

  let cost = (gain / 100) * 1.1 + (loss / 100) * 0.35;
  cost *= PACE_STAMINA[pace] * weightFactor;
  if (s.stats.energy < 25) cost *= 1.4;
  if (s.stats.hydration < 25) cost *= 1.3;
  if (s.stats.ams > 70) cost *= 1.3;
  if (i <= 1 && !has(s, 'poles')) cost *= 1.08;
  if (i >= 1 && has(s, 'boots_hiking')) cost *= 1.12;
  if (s.weather === 'storm' || s.weather === 'whiteout') cost *= 1.2;
  s.stats.stamina -= cost;

  const sunny = s.weather === 'clear' && !isNight(s.clock);
  s.stats.hydration -= hours * (8 + (sunny ? 2 : 0));
  s.stats.energy -= hours * 7 * (pace === 'push' ? 1.2 : 1);
  if (s.stats.energy <= 0) { s.stats.stamina -= 8; s.stats.morale -= 8; }
  if (s.stats.hydration <= 0) { s.stats.stamina -= 8; s.stats.ams += 8; }

  thermal(s, hours, true, (NODES[from].ft + NODES[to].ft) / 2);

  if (s.dir === 'up') {
    const above = Math.max(0, NODES[to].ft - Math.max(NODES[from].ft, 8000));
    const dry = s.stats.hydration < 35 ? 1.4 : 1;
    s.stats.ams += (above / 1000) * 5.5 * PACE_AMS[pace] * s.susceptibility * dry;
    s.partnerAms += (above / 1000) * 5.5 * PACE_AMS[pace] * s.partnerSusceptibility;
  } else {
    s.stats.ams -= (loss / 1000) * 12;
    s.partnerAms = Math.max(0, s.partnerAms - (loss / 1000) * 12);
  }

  if (s.weather === 'storm') s.stats.morale -= 8;
  else if (s.weather === 'whiteout') s.stats.morale -= 5;
  else if (s.weather === 'clear') s.stats.morale += 2;
  if (s.stats.ams > 40) s.stats.morale -= 4;

  s.clock += minutes;
  s.prevNode = from;
  s.node = to;
  s.dist = NODE_DIST[to];
  s.lateral = 0;
  s.legStart = s.clock;
  s.legOffTrack = 0;
  s.moveId += 1;
  s.restsHere = 0;

  if (s.dir === 'up' && i === 1 && has(s, 'wands')) {
    s.flags.wandsPlaced = true;
    log(s, 'You placed wands every rope length across the snowfield.', 'info');
  }
  if (s.dir === 'down' && to === MUIR) s.campLeft = false; // back with your camp gear

  const verb = s.dir === 'up' ? 'Reached' : 'Down to';
  log(s, `${verb} ${NODES[to].name} (${formatFt(NODES[to].ft)}) after ${fmtDuration(minutes)}.`);

  if (s.dir === 'up' && to === SUMMIT) s.summited = true;
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
  if (s.ending) return;

  if (s.dir === 'down' && s.node === 0) {
    s.ending = s.summited ? 'summit' : 'retreat';
    log(s, 'Back at the Paradise parking lot.', 'good');
    return;
  }

  rollEvent(s, { leg: i, dir: s.dir, start, minutes }, rng);
}

export { PACE_TIME, PACE_STAMINA, PACE_AMS };

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function clampStats(s: GameState) {
  const st = s.stats;
  (Object.keys(st) as (keyof Stats)[]).forEach((k) => { st[k] = clamp(st[k]); });
  s.partnerAms = clamp(s.partnerAms);
}

export function checkVitals(s: GameState) {
  if (s.ending) return;
  if (s.stats.warmth <= 0) s.ending = 'hypothermia';
  else if (s.stats.stamina <= 0) s.ending = 'exhaustion';
  else if (s.stats.ams >= 100) s.ending = 'ams';
}

export function rollEvent(s: GameState, ctx: ArrivalContext, rng: Rng) {
  for (const ev of EVENTS) {
    if (!ev.repeatable && s.usedEvents.includes(ev.id)) continue;
    const p = ev.chance(s, ctx);
    if (p > 0 && rng() < p) {
      s.pendingEvent = ev.id;
      return;
    }
  }
}

// ---------- actions ----------

export interface Action {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  primary?: boolean;
}

export function listActions(s: GameState): Action[] {
  if (s.ending || s.pendingEvent) return [];
  const out: Action[] = [];
  const move = canMove(s);
  const atTop = s.node === SUMMIT;

  if (s.dir === 'up' && !atTop) {
    const next = NODES[s.node + 1];
    out.push({ id: 'go:steady', label: `Climb to ${next.name}`, detail: `Steady pace · ${fmtDuration(legMinutes(s, 'steady'))}`, disabled: !move.ok, primary: true });
    out.push({ id: 'go:rest', label: 'Rest-step pace', detail: `Slower, easier on lungs · ${fmtDuration(legMinutes(s, 'rest'))}`, disabled: !move.ok });
    out.push({ id: 'go:push', label: 'Push hard', detail: `Faster, harder · ${fmtDuration(legMinutes(s, 'push'))}`, disabled: !move.ok });
  } else {
    const next = NODES[s.node - 1];
    out.push({ id: 'go:steady', label: `Descend to ${next.name}`, detail: fmtDuration(legMinutes(s, 'steady')), disabled: !move.ok, primary: true });
    out.push({ id: 'go:rest', label: 'Descend carefully', detail: `Slower, safer footing · ${fmtDuration(legMinutes(s, 'rest'))}`, disabled: !move.ok });
  }

  if (s.node === MUIR && s.dir === 'up' && !s.slept && atStop(s)) {
    out.push({ id: 'sleep', label: 'Sleep until alpine start', detail: `Wake at ${formatClock(ALPINE_START)}`, primary: true });
  }
  if (s.node === MUIR && s.dir === 'up' && atStop(s)) {
    out.push({ id: 'turnaround', label: `Turnaround time: ${formatClock(s.turnaround)}`, detail: 'Tap to change' });
  }
  if (s.node === MUIR && has(s, 'stove') && atStop(s)) {
    out.push({ id: 'melt', label: 'Melt snow for water', detail: '45 min · refill to 3 L', disabled: s.water >= 3 });
  }
  out.push({ id: 'drink', label: 'Drink', detail: s.water > 0 ? `${s.water.toFixed(1)} L left` : 'No water', disabled: s.water < 0.5 });
  out.push({ id: 'eat', label: 'Eat', detail: s.food > 0 ? `${s.food} servings left` : 'No food', disabled: s.food <= 0 });
  out.push({ id: 'layer:up', label: 'Add a layer', detail: s.layer < 3 ? LAYER_LABEL[(s.layer + 1) as LayerLevel] : 'Wearing everything', disabled: s.layer >= 3 });
  out.push({ id: 'layer:down', label: 'Shed a layer', detail: s.layer > 0 ? LAYER_LABEL[(s.layer - 1) as LayerLevel] : 'Base layer only', disabled: s.layer <= 0 });
  out.push({ id: 'rest', label: 'Take a break', detail: '20 min' });
  if (s.dir === 'up' && s.node > 0 && !atTop) {
    out.push({ id: 'turnback', label: 'Turn back', detail: 'Start the descent from here' });
  }
  if (!move.ok && move.reason && isNight(s.clock)) {
    out.push({ id: 'wait', label: 'Wait for first light', detail: 'Until 5:30 AM' });
  }
  return out;
}

export function moveBlockedReason(s: GameState) {
  return canMove(s).reason;
}

export function doAction(prev: GameState, id: string, rng: Rng = Math.random): GameState {
  const s = clone(prev);
  s.lastOutcome = null;
  const ft = currentFt(s);
  const idle = (min: number) => {
    s.clock += min;
    thermal(s, min / 60, false, ft);
    s.stats.hydration -= (min / 60) * 3;
    s.stats.energy -= (min / 60) * 3;
  };

  if (id.startsWith('go:')) {
    if (!canMove(s).ok) return prev;
    if (s.node === SUMMIT) s.dir = 'down';
    travel(s, id.slice(3) as Pace, rng);
  } else if (id === 'drink' && s.water >= 0.5) {
    s.water = Math.round((s.water - 0.5) * 10) / 10;
    s.stats.hydration += 22;
    idle(5);
  } else if (id === 'eat' && s.food > 0) {
    s.food -= 1;
    s.stats.energy += 25;
    s.stats.morale += 4;
    idle(10);
  } else if (id === 'layer:up' && s.layer < 3) {
    s.layer = (s.layer + 1) as LayerLevel;
  } else if (id === 'layer:down' && s.layer > 0) {
    s.layer = (s.layer - 1) as LayerLevel;
  } else if (id === 'rest') {
    const gain = s.restsHere < 2 ? 12 : 4;
    s.restsHere += 1;
    s.stats.stamina += gain;
    s.stats.ams -= 3;
    idle(20);
    log(s, gain > 4 ? 'Took a 20-minute break.' : 'Another break. Your legs stiffen as you sit in the cold.');
  } else if (id === 'melt' && has(s, 'stove') && s.node === MUIR && atStop(s)) {
    s.water = 3;
    s.stats.morale += 3;
    idle(45);
    log(s, 'Melted snow and refilled to 3 liters.', 'good');
  } else if (id === 'sleep' && s.node === MUIR && !s.slept && atStop(s)) {
    sleepAtMuir(s, rng);
  } else if (id === 'turnaround') {
    const options = [DAY + 540, DAY + 600, DAY + 660];
    const idx = options.indexOf(s.turnaround);
    s.turnaround = options[(idx + 1) % options.length];
  } else if (id === 'turnback') {
    s.dir = 'down';
    if (s.weather === 'storm' || s.weather === 'whiteout' || s.stats.ams > 60 || s.clock > s.turnaround) {
      s.flags.goodCall = true;
    }
    log(s, `Turned back at ${NODES[s.node].name}.`, 'info');
  } else if (id === 'wait') {
    const m = minuteOfDay(s.clock);
    const until = m < 330 ? 330 - m : DAY - m + 330;
    idle(until);
    log(s, 'Waited in the dark for first light.', 'info');
  }

  clampStats(s);
  checkVitals(s);
  return s;
}

function sleepAtMuir(s: GameState, rng: Rng) {
  const bag = has(s, 'bag');
  const pad = has(s, 'pad');
  const wake = Math.max(ALPINE_START, s.clock + 120);
  s.clock = wake;
  s.slept = true;
  s.stats.stamina += 10 + (bag ? 25 : 0) + (pad ? 15 : 0);
  s.stats.warmth = bag ? 90 : pad ? 55 : 45;
  s.stats.hydration -= 8;
  s.stats.energy -= 10;
  s.stats.ams = Math.max(0, s.stats.ams - (bag ? 12 : 6));
  if (rng() < 0.3 * s.susceptibility) {
    s.stats.ams += 12;
    log(s, 'You woke with a pounding headache. Sleeping high is when altitude sickness shows up.', 'bad');
  }
  s.stats.morale += bag ? 6 : -10;
  s.layer = 3;
  log(
    s,
    bag
      ? `Slept a few hours in the shelter. Alarm at ${formatClock(wake)}.`
      : `A miserable night shivering on the shelter floor. Up at ${formatClock(wake)}.`,
    bag ? 'good' : 'bad',
  );
  clampStats(s);
}

// ---------- events ----------

export function eventChoices(s: GameState) {
  if (!s.pendingEvent) return [];
  return EVENT_BY_ID[s.pendingEvent].choices(s);
}

export function chooseEvent(prev: GameState, index: number, rng: Rng = Math.random): GameState {
  if (!prev.pendingEvent) return prev;
  const s = clone(prev);
  const def = EVENT_BY_ID[prev.pendingEvent];
  const choice = def.choices(s)[index];
  if (!choice || choice.disabled) return prev;
  const outcome: Outcome = choice.resolve(s, rng);
  applyOutcome(s, outcome);
  s.usedEvents.push(def.id);
  s.pendingEvent = null;
  return s;
}

function applyOutcome(s: GameState, o: Outcome) {
  if (o.delta) {
    for (const [k, v] of Object.entries(o.delta)) {
      s.stats[k as keyof Stats] += v as number;
    }
  }
  if (o.minutes) {
    s.clock += o.minutes;
    if (o.minutes >= 15) thermal(s, o.minutes / 60, false, currentFt(s));
  }
  o.mutate?.(s);
  if (o.turnBack) s.dir = 'down';
  if (o.ending) s.ending = o.ending;
  s.lastOutcome = o.text;
  log(s, o.text, o.tone);
  clampStats(s);
  checkVitals(s);
}

export { packWeightLb };
