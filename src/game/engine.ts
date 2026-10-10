import { GEAR_BY_ID, packWeightLb, toggleGear } from './gear';
import { DAY, START_CLOCK, formatClock, formatFt, isNight, minuteOfDay } from './route';
import { ROUTES, type RouteId } from './routes';
import type {
  ArrivalContext, Forecast, GameState, HandWear, LayerLevel, Mode, Outcome, Pace, Rng, SkillId, SkillLevels, Stats, Weather,
} from './types';
import { PARTNERS, partnerLine, type PartnerId } from './partners';
import type { CareerEffects } from './career';
import { SEASONS, type Season } from './season';
import { EVENTS, EVENT_BY_ID } from './events';
import { ENDINGS } from './endings';

// ---------- helpers ----------

import { crampons, has, profileOf, roped, routeOf, summitOf } from './helpers';
export { crampons, has, profileOf, roped, routeOf, summitOf };

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

// ---------- seeds ----------

/** The climb's own dice: a mulberry32 generator whose state lives in the game state. */
export function stateRng(s: GameState): Rng {
  return () => {
    s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
    let t = s.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed string to a 32-bit number (FNV-1a). Case and spaces don't matter. */
export function hashSeed(seed: string) {
  let h = 0x811c9dc5;
  for (const ch of seed.trim().toUpperCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeed(rng: Rng = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i++) out += SEED_CHARS[Math.floor(rng() * SEED_CHARS.length)];
  return out;
}

/** Today's Daily Climb: everyone gets the same seed, season and partner (local date). */
export function dailyClimb(date = new Date()) {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const h = hashSeed(`DAILY-${day}`);
  const seasons: Season[] = ['may', 'july', 'september'];
  const partners: PartnerId[] = ['veteran', 'friend', 'firstTimer'];
  return { day, seed: `DAILY-${day}`, season: seasons[h % 3], partner: partners[(h >>> 4) % 3], route: 'dc' as RouteId };
}

export function log(s: GameState, text: string, tone?: 'good' | 'bad' | 'info') {
  s.log.unshift({ clock: s.clock, text, tone });
  if (s.log.length > 60) s.log.length = 60;
}

/** Elevation (m) at a distance along this climb's route, from the real terrain profile. */
export function elevAt(s: GameState, d = s.dist) {
  const { dist, elev } = profileOf(s);
  let lo = 0;
  let hi = dist.length - 1;
  if (d <= 0) return elev[0];
  if (d >= dist[hi]) return elev[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - dist[lo]) / (dist[hi] - dist[lo] || 1);
  return elev[lo] + (elev[hi] - elev[lo]) * t;
}

const M_TO_FT = 3.28084;

/** True when standing at a stop (not partway along a leg). */
export function atStop(s: GameState) {
  return Math.abs(s.dist - profileOf(s).nodeDist[s.node]) < 1;
}

/** Where the party stands, in feet. At a stop this is the stop's published elevation. */
export function currentFt(s: GameState) {
  if (atStop(s)) return routeOf(s).nodes[s.node].ft;
  return elevAt(s) * M_TO_FT;
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

export const HAND_LABEL: Record<HandWear, string> = { 0: 'Liners', 1: 'Gloves', 2: 'Mittens' };

/** The glove or mitten worn over your liners, if any. */
export function handOuter(s: GameState): 'gloves' | 'mitts' | null {
  if (s.hands >= 2 && has(s, 'mitts')) return 'mitts';
  if (s.hands >= 1 && has(s, 'gloves')) return 'gloves';
  if (s.hands >= 1 && has(s, 'mitts')) return 'mitts';
  return null;
}

/** Wet clothing keeps only part of its loft. Synthetic layers dry from body heat; cotton doesn't. */
export const wetFactor = (s: GameState) => 1 - 0.4 * (s.wet / 100);

export function insulation(s: GameState) {
  let total = 0;
  const outer = handOuter(s);
  const wf = wetFactor(s);
  for (const id of s.packed) {
    const g = GEAR_BY_ID[id];
    if (!g || g.warmth === undefined) continue;
    if (!has(s, id)) continue;
    if (g.hand !== undefined) {
      if (id === 'liners' || id === outer) total += g.warmth;
      continue;
    }
    if (g.layer === undefined || g.layer > s.layer) continue;
    if (id === 'cotton' && s.flags.cottonWet) {
      total -= 0.6; // wet cotton pulls heat out of you
      continue;
    }
    total += g.cat === 'Clothing' ? g.warmth * wf : g.warmth;
  }
  return total;
}

/** Insulation on your hands (liners plus whatever is over them). */
export function handInsulation(s: GameState) {
  const outer = handOuter(s);
  return (has(s, 'liners') ? GEAR_BY_ID.liners.warmth ?? 0 : 0) + (outer ? GEAR_BY_ID[outer].warmth ?? 0 : 0);
}

/** Insulation on your feet: boots and gaiters. */
export function feetInsulation(s: GameState) {
  // Worn-out boots leak: wet, cold feet.
  const boots = s.flags.wornBoots ? 0.7 : 1;
  return s.packed.reduce((t, id) => t + (has(s, id) ? (GEAR_BY_ID[id]?.feet ?? 0) * (id.startsWith('boots_') ? boots : 1) : 0), 0);
}

export function coldIndex(s: GameState, ft = currentFt(s), clock = s.clock) {
  let c = (ft - 5000) / 1500;
  const m = minuteOfDay(clock);
  const season = SEASONS[s.season];
  c += season.cold;
  if (isNight(clock, s.season)) c += 2.5 + season.nightCold;
  else if (m > 600 && m < 1020 && s.weather === 'clear') c -= 1.5; // strong sun on snow
  c += { clear: 0, windy: 2, whiteout: 1, coldsnap: 2.5, storm: 3.5 }[s.weather];
  return c;
}

/** Body heat from walking, by pace. */
const EFFORT: Record<Pace, number> = { rest: 1.1, steady: 1.5, push: 2 };

/** Apply warmth, sweat, and hydration for a stretch of time. */
export function thermal(s: GameState, hours: number, moving: boolean, ft: number, pace: Pace = 'steady') {
  const insul = insulation(s) + (moving ? EFFORT[pace] : 0);
  const diff = insul - coldIndex(s, ft);
  if (diff < 0) {
    s.stats.warmth += diff * 7 * hours;
    s.wet -= (moving ? 5 : 2) * hours;
  } else if (moving && diff > 4) {
    // Overdressed: sweating out water and burning energy, and soaking your layers.
    s.stats.hydration -= (diff - 4) * 4 * hours;
    s.stats.stamina -= (diff - 4) * 1.5 * hours;
    s.stats.warmth += 4 * hours;
    s.wet += (diff - 4) * 14 * hours;
  } else {
    s.stats.warmth += 6 * hours;
    s.wet -= (moving ? 10 : 5) * hours;
  }
  // Wet snow and rain soak you unless your hardshell is on.
  const shellOn = s.layer >= 2 && has(s, 'shell_jacket');
  if ((s.weather === 'storm' || s.weather === 'whiteout') && !shellOn) s.wet += 12 * hours;
  s.wet = clamp(s.wet);
  if (s.packed.includes('cotton') && s.layer >= 1 && s.wet > 20 && !s.flags.cottonWet) s.flags.cottonWet = true;
  extremities(s, hours, moving, ft);
}

/**
 * Fingers and toes. When your core is cold, your body cuts blood flow to them first, so they
 * depend on your core warmth as well as on gloves and boots. A game model, not physiology:
 * numb below 40, frostnip (skin freezing, reversible) below 15, frostbite at 0.
 */
function extremities(s: GameState, hours: number, moving: boolean, ft: number) {
  const need = Math.max(0, (coldIndex(s, ft) - 2) * 0.35);
  const core = (s.stats.warmth - 50) / 100;
  const work = moving ? 0.6 : 0;
  const step = (temp: number, have: number) => {
    const d = have - need;
    // Once skin is frozen, the cold works deeper slowly: frostnip to frostbite takes a while.
    if (d < 0) return clamp(temp + d * (temp < 15 ? 9 : 25) * hours);
    return clamp(temp + Math.min(20, 8 + d * 6) * hours);
  };
  s.handTemp = step(s.handTemp, handInsulation(s) + work + core);
  s.footTemp = step(s.footTemp, feetInsulation(s) + work * 0.7 + core);
  checkExtremities(s);
}

function checkExtremities(s: GameState) {
  const parts = [
    { key: 'Hands', temp: s.handTemp, numb: 'numbHands', nip: 'frostnipHands', bite: 'frostbiteHands',
      numbText: 'Your fingers are going numb. Pull on warmer gloves or mittens, or warm them in your armpits at a break.',
      nipText: 'Frostnip: your fingertips are white, waxy and wooden. Rewarm them now. Rope work will be clumsy.',
      biteText: 'Your fingers are frozen hard: frostbite. You have to go down now and get to a doctor.' },
    { key: 'Feet', temp: s.footTemp, numb: 'numbFeet', nip: 'frostnipFeet', bite: 'frostbiteFeet',
      numbText: 'You can’t feel your toes. Keep moving, wiggle them, and check your boots and gaiters.',
      nipText: 'Frostnip on your toes. They burn, then go numb. Walking gets clumsy.',
      biteText: 'Your toes are frozen: frostbite. Walk down on them now; rewarming waits until you’re off the mountain.' },
  ] as const;
  for (const p of parts) {
    const f = s.flags as Record<string, boolean | undefined>;
    if (p.temp > 60) f[p.numb] = false;
    if (p.temp < 40 && !f[p.numb] && p.temp > 15) {
      f[p.numb] = true;
      log(s, p.numbText, 'bad');
    }
    if (p.temp <= 15 && !f[p.nip]) {
      f[p.nip] = true;
      f[p.numb] = true;
      s.stats.morale -= 8;
      log(s, p.nipText, 'bad');
    }
    if (p.temp <= 0 && !f[p.bite]) {
      f[p.bite] = true;
      s.stats.morale -= 20;
      log(s, p.biteText, 'bad');
      if (p.key === 'Hands') s.handTemp = 5;
      else s.footTemp = 5;
      if (s.dir === 'up' && s.node > 0) {
        s.dir = 'down';
        log(s, 'You turn around.', 'info');
      }
    }
  }
}

export function warmthTrend(s: GameState): 'cold' | 'ok' | 'hot' {
  const diff = insulation(s) + 1.5 - coldIndex(s);
  if (diff < 0) return 'cold';
  if (diff > 4) return 'hot';
  return 'ok';
}

/** Are your hands or feet cooling while you walk? */
export function partTrend(s: GameState, part: 'hands' | 'feet'): 'cold' | 'ok' {
  const need = Math.max(0, (coldIndex(s) - 2) * 0.35);
  const core = (s.stats.warmth - 50) / 100;
  const have = part === 'hands' ? handInsulation(s) + 0.6 + core : feetInsulation(s) + 0.42 + core;
  return have < need ? 'cold' : 'ok';
}

/** A line for the skill screen when your hands will make it harder, or undefined. */
export function handicapNote(s: GameState, skill: SkillId) {
  const notes: string[] = [];
  if (s.flags.frostbiteHands) notes.push('Frostbitten fingers: everything is slow and clumsy.');
  else if (s.flags.frostnipHands) notes.push('Frostnipped fingers: knots and clips are clumsy.');
  else if (s.handTemp < 40) notes.push('Numb fingers: you fumble the gear.');
  if ((skill === 'prusik' || skill === 'zpulley') && handOuter(s) === 'mitts') notes.push('You’re wearing mittens for rope work.');
  return notes.length ? notes.join(' ') : undefined;
}

/**
 * Cold or numb fingers make skills harder; mittens make rope work (prusiks, a Z-pulley) clumsy.
 * Returns a multiplier on mini-game performance.
 */
export function skillHandicap(s: GameState, skill: SkillId) {
  let k = 1;
  if (s.flags.frostbiteHands) k *= 0.6;
  else if (s.flags.frostnipHands) k *= 0.8;
  else if (s.handTemp < 40) k *= 0.9;
  if ((skill === 'prusik' || skill === 'zpulley') && handOuter(s) === 'mitts') k *= 0.85;
  return k;
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
  // "Summit day": the day after the last night out (the first day on a day trip).
  const R = routeOf(s);
  const day2 = R.dayTrip || s.clock >= DAY * (1 + R.bivouacs.length);
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

export interface NewGameOptions {
  /** Dice for setting up the climb (the simulation passes its own); otherwise from the seed. */
  rng?: Rng;
  season?: Season;
  route?: RouteId;
  seed?: string;
  partner?: PartnerId;
  mode?: Mode;
  skills?: SkillLevels;
  /** Career mode: training and the state of your gear. */
  career?: CareerEffects;
}

/** Gear a guide service rents you if you show up without it. */
const RENTALS = ['boots_single', 'crampons_steel', 'helmet', 'harness', 'axe', 'headlamp'];

export function newGame(packedIn: string[], opts: NewGameOptions = {}): GameState {
  const season = opts.season ?? 'july';
  const route = opts.route ?? 'dc';
  const mode = opts.mode ?? 'standard';
  const partnerId: PartnerId = mode === 'guided' ? 'guide' : opts.partner ?? 'veteran';
  const partner = PARTNERS[partnerId];
  const skills = opts.skills ?? { nav: 0, arrest: 0, acclim: 0 };
  const seed = opts.seed?.trim().toUpperCase() || randomSeed();
  const rngState = hashSeed(seed);
  const holder = { rngState } as GameState;
  const rng = opts.rng ?? stateRng(holder);

  let packed = [...packedIn];
  const rented: string[] = [];
  if (mode === 'guided') {
    for (const id of RENTALS) {
      if (packed.includes(id)) continue;
      // Guide services want stiff boots and steel crampons: they swap out the wrong kind.
      if (id === 'boots_single' && packed.includes('boots_double')) continue;
      packed = toggleGear(packed, id);
      rented.push(GEAR_BY_ID[id].name.toLowerCase());
    }
  }

  const f = rng();
  const [stable, unsettled] = SEASONS[season].forecast;
  const forecast: Forecast = f < stable ? 'stable' : f < unsettled ? 'unsettled' : 'incoming';
  const s: GameState = {
    season,
    route,
    partner: partnerId,
    mode,
    skills,
    seed,
    rngState: holder.rngState,
    skillLog: [],
    partnerSays: null,
    fitness: opts.career?.fitness ?? 0,
    packed,
    stats: { stamina: 100, warmth: 90, hydration: 85, energy: 85, ams: 0, morale: 75 },
    node: 0,
    dir: 'up',
    clock: ROUTES[route].startClock ?? START_CLOCK,
    weather: 'clear',
    forecast,
    layer: 0,
    hands: 0,
    handTemp: 100,
    footTemp: 100,
    wet: 0,
    water: packed.includes('water') ? 3 : 0,
    // Summit food is about two days' worth; you pack more for each extra night out.
    food: packed.includes('food') ? 6 + 3 * ROUTES[route].bivouacs.length : 0,
    // A day trip has no night out: you start rested at the trailhead.
    slept: !!ROUTES[route].dayTrip,
    bivied: [],
    campLeft: false,
    turnaround: ROUTES[route].turnaround, // 10:00 AM on summit day on the Cleaver
    alpineStart: SEASONS[season].alpineStart + DAY * ROUTES[route].bivouacs.length,
    // Acclimatization from past climbs takes the edge off (a game stand-in for experience).
    susceptibility: (0.7 + rng() * 0.7) * (1 - 0.06 * skills.acclim),
    partnerAms: 0,
    partnerSusceptibility: partner.susceptibility[0] + rng() * (partner.susceptibility[1] - partner.susceptibility[0]),
    summited: false,
    flags: {},
    usedEvents: [],
    pendingEvent: route === 'si' ? null : 'ranger',
    lastOutcome: null,
    ending: null,
    log: [],
    moveId: 0,
    restsHere: 0,
    prevNode: 0,
    dist: 0,
    lateral: 0,
    legStart: ROUTES[route].startClock ?? START_CLOCK,
    legOffTrack: 0,
  };
  if (!opts.rng) s.rngState = holder.rngState;
  const ce = opts.career;
  if (ce?.dullCrampons) { s.flags.cramponsDull = true; log(s, 'Your crampons are worn and dull. Sharpen or replace them soon.', 'bad'); }
  if (ce?.wornBoots) { s.flags.wornBoots = true; log(s, 'Your old boots leak at the seams. Cold feet ahead.', 'bad'); }
  if (ce?.newBoots) { s.flags.newBoots = true; log(s, 'Brand-new boots, still stiff. Expect blisters on the first trip.', 'info'); }
  if (ce?.noArrest) s.flags.noArrest = true;
  log(s, `${ROUTES[route].nodes[0].name} in ${SEASONS[season].label}, ${formatClock(s.clock)}. ${ROUTES[route].name} with ${partner.name}. Seed ${seed}. Pack weight ${packWeightLb(packed)} lb.`, 'info');
  if (rented.length) log(s, `Your guide checks your pack and rents you: ${rented.join(', ')}.`, 'info');
  return s;
}

// ---------- travel ----------

const PACE_TIME: Record<Pace, number> = { rest: 1.3, steady: 1, push: 0.8 };
const PACE_STAMINA: Record<Pace, number> = { rest: 0.75, steady: 1, push: 1.35 };
// Gaining height fast is the classic cause of altitude sickness: pushing builds it much faster.
const PACE_AMS: Record<Pace, number> = { rest: 0.6, steady: 1, push: 1.8 };
const WEATHER_TIME: Record<Weather, number> = { clear: 1, windy: 1.1, whiteout: 1.3, coldsnap: 1.05, storm: 1.5 };

export function legIndex(s: GameState) {
  return s.dir === 'up' ? s.node : s.node - 1;
}

/** Crampons are needed above high camp, and on any glacier or ice below it. */
export function needsCrampons(s: GameState, i: number) {
  const R = routeOf(s);
  const leg = R.legs[i];
  return !!leg && (leg.crampons ?? (i >= R.camp || leg.terrain === 'glacier' || leg.terrain === 'ice'));
}

export function legMinutes(s: GameState, pace: Pace, i = legIndex(s)) {
  const R = routeOf(s);
  const leg = R.legs[i];
  if (!leg) return 0;
  let t = leg.minutes * PACE_TIME[pace];
  if (s.dir === 'down') t *= 0.5;
  if (needsCrampons(s, i) && !crampons(s)) t *= 1.5;
  if (leg.terrain !== 'trail' && has(s, 'boots_hiking')) t *= 1.1;
  if (s.stats.stamina < 25) t *= 1.25;
  if (s.flags.snowBlind) t *= 1.2;
  if (s.flags.ankle) t *= 1.4;
  // The party moves at the slower climber's pace.
  t *= PARTNERS[s.partner].pace;
  if (s.flags.frostbiteFeet) t *= 1.3;
  else if (s.flags.frostnipFeet) t *= 1.15;
  // Spring: deep soft snow below high camp. Without snowshoes you sink in to your shins or knees.
  if (i < R.camp && SEASONS[s.season].softSnow && !has(s, 'snowshoes')) t *= 1.2;
  if (i >= R.camp && i < R.legs.length - 1) t *= SEASONS[s.season].upperTime;
  t *= WEATHER_TIME[s.weather];
  return Math.round(t);
}

export function canMove(s: GameState): { ok: boolean; reason?: string } {
  if (s.ending || s.pendingEvent) return { ok: false };
  if (s.dir === 'up' && s.node >= summitOf(s)) return { ok: false, reason: 'You’re on top. Time to go down.' };
  if (isNight(s.clock, s.season) && !has(s, 'headlamp')) {
    return { ok: false, reason: 'Too dark to move without a headlamp. Wait for first light.' };
  }
  return { ok: true };
}

function travel(s: GameState, pace: Pace, rng: Rng) {
  const R = routeOf(s);
  const { nodes, camp } = R;
  const summit = nodes.length - 1;
  const i = legIndex(s);
  const from = s.node;
  const to = s.dir === 'up' ? from + 1 : from - 1;
  const minutes = legMinutes(s, pace);
  const hours = minutes / 60;
  const start = s.clock;

  if (s.dir === 'up' && from === camp) s.campLeft = true; // sleeping bag, pad, stove stay at camp

  const gain = Math.max(0, nodes[to].ft - nodes[from].ft);
  const loss = Math.max(0, nodes[from].ft - nodes[to].ft);
  const lb = packWeightLb(s.packed, s.campLeft);
  const weightFactor = 1 + Math.max(0, lb - 30) * 0.015;

  let cost = (gain / 100) * 1.1 + (loss / 100) * 0.35;
  cost *= PACE_STAMINA[pace] * weightFactor;
  if (s.stats.energy < 25) cost *= 1.4;
  if (s.stats.hydration < 25) cost *= 1.3;
  if (s.stats.ams > 70) cost *= 1.3;
  if (i < camp && !has(s, 'poles')) cost *= 1.08;
  if (R.legs[i].terrain !== 'trail' && has(s, 'boots_hiking')) cost *= 1.12;
  if (s.weather === 'storm' || s.weather === 'whiteout') cost *= 1.2;
  if (i < camp && SEASONS[s.season].softSnow && !has(s, 'snowshoes')) cost *= 1.2;
  s.stats.stamina -= cost;

  const sunny = s.weather === 'clear' && !isNight(s.clock, s.season);
  s.stats.hydration -= hours * (8 + (sunny ? 2 : 0));
  s.stats.energy -= hours * 7 * (pace === 'push' ? 1.2 : 1);
  if (s.stats.energy <= 0) { s.stats.stamina -= 8; s.stats.morale -= 8; }
  if (s.stats.hydration <= 0) { s.stats.stamina -= 8; s.stats.ams += 8; }

  thermal(s, hours, true, (nodes[from].ft + nodes[to].ft) / 2, pace);

  if (s.dir === 'up') {
    const above = Math.max(0, nodes[to].ft - Math.max(nodes[from].ft, 8000));
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
  s.dist = profileOf(s).nodeDist[to];
  s.lateral = 0;
  s.legStart = s.clock;
  s.legOffTrack = 0;
  s.moveId += 1;
  s.restsHere = 0;

  if (s.dir === 'up' && R.legs[i].hazards.whiteout && has(s, 'wands') && !s.flags.wandsPlaced) {
    s.flags.wandsPlaced = true;
    log(s, 'You placed wands every rope length across the snowfield.', 'info');
  }
  if (s.dir === 'down' && to === camp) s.campLeft = false; // back with your camp gear

  const verb = s.dir === 'up' ? 'Reached' : 'Down to';
  log(s, `${verb} ${nodes[to].name} (${formatFt(nodes[to].ft)}) after ${fmtDuration(minutes)}.`);

  if (s.dir === 'up' && to === summit) s.summited = true;
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
    log(s, `Back at the ${nodes[0].name} trailhead.`, 'good');
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
  s.handTemp = clamp(s.handTemp);
  s.footTemp = clamp(s.footTemp);
  s.wet = clamp(s.wet);
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
  const R = routeOf(s);
  const { nodes, camp } = R;
  const summit = nodes.length - 1;
  if (s.ending || s.pendingEvent) return [];
  const out: Action[] = [];
  const move = canMove(s);
  const atTop = s.node === summit;

  if (s.dir === 'up' && !atTop) {
    const next = nodes[s.node + 1];
    out.push({ id: 'go:steady', label: `Climb to ${next.name}`, detail: `Steady pace · ${fmtDuration(legMinutes(s, 'steady'))}`, disabled: !move.ok, primary: true });
    out.push({ id: 'go:rest', label: 'Rest-step pace', detail: `Slower, easier on lungs · ${fmtDuration(legMinutes(s, 'rest'))}`, disabled: !move.ok });
    out.push({ id: 'go:push', label: 'Push hard', detail: `Faster, harder · ${fmtDuration(legMinutes(s, 'push'))}`, disabled: !move.ok });
  } else {
    const next = nodes[s.node - 1];
    out.push({ id: 'go:steady', label: `Descend to ${next.name}`, detail: fmtDuration(legMinutes(s, 'steady')), disabled: !move.ok, primary: true });
    out.push({ id: 'go:rest', label: 'Descend carefully', detail: `Slower, safer footing · ${fmtDuration(legMinutes(s, 'rest'))}`, disabled: !move.ok });
  }

  if (R.bivouacs.includes(s.node) && s.dir === 'up' && !s.bivied.includes(s.node) && atStop(s)) {
    out.push({ id: 'bivy', label: 'Camp here for the night', detail: `Up at first light (${formatClock(SEASONS[s.season].dawn)})`, primary: true });
  }
  if (s.node === camp && s.dir === 'up' && !s.slept && atStop(s)) {
    out.push({ id: 'sleep', label: 'Sleep until alpine start', detail: `Wake at ${formatClock(s.alpineStart)}`, primary: true });
    out.push({ id: 'alpine', label: `Alpine start: ${formatClock(s.alpineStart)}`, detail: 'Earlier is colder and darker, but leaves time to spare. Tap to change' });
  }
  if (s.node === camp && s.dir === 'up' && atStop(s)) {
    out.push({ id: 'turnaround', label: `Turnaround time: ${formatClock(s.turnaround)}`, detail: 'Tap to change' });
  }
  if ((s.node === camp || (R.bivouacs.includes(s.node) && s.dir === 'up')) && has(s, 'stove') && atStop(s)) {
    out.push({ id: 'melt', label: 'Melt snow for water', detail: '45 min · refill to 3 L', disabled: s.water >= 3 });
  }
  out.push({ id: 'drink', label: 'Drink', detail: s.water > 0 ? `${s.water.toFixed(1)} L left` : 'No water', disabled: s.water < 0.5 });
  out.push({ id: 'eat', label: 'Eat', detail: s.food > 0 ? `${s.food} servings left` : 'No food', disabled: s.food <= 0 });
  out.push({ id: 'layer:up', label: 'Add a layer', detail: s.layer < 3 ? LAYER_LABEL[(s.layer + 1) as LayerLevel] : 'Wearing everything', disabled: s.layer >= 3 });
  out.push({ id: 'layer:down', label: 'Shed a layer', detail: s.layer > 0 ? LAYER_LABEL[(s.layer - 1) as LayerLevel] : 'Base layer only', disabled: s.layer <= 0 });
  const nextHands = nextHandWear(s);
  out.push({ id: 'hands', label: 'Change gloves', detail: nextHands === null ? 'Liners only' : `Switch to ${HAND_LABEL[nextHands].toLowerCase()}`, disabled: nextHands === null });
  out.push({ id: 'rest', label: 'Take a break', detail: '20 min' });
  if (s.dir === 'up' && s.node > 0 && !atTop) {
    out.push({ id: 'turnback', label: 'Turn back', detail: 'Start the descent from here' });
  }
  if (!move.ok && move.reason && isNight(s.clock, s.season)) {
    out.push({ id: 'wait', label: 'Wait for first light', detail: `Until ${formatClock(SEASONS[s.season].dawn)}` });
  }
  return out;
}

/** The next hand setting you can switch to (cycling liners → gloves → mittens), or null. */
export function nextHandWear(s: GameState): HandWear | null {
  const avail: HandWear[] = [0];
  if (has(s, 'gloves')) avail.push(1);
  if (has(s, 'mitts')) avail.push(2);
  if (avail.length < 2) return null;
  const cur = avail.indexOf(handOuter(s) === 'mitts' ? 2 : handOuter(s) === 'gloves' ? 1 : 0);
  return avail[(cur + 1) % avail.length];
}

export function moveBlockedReason(s: GameState) {
  return canMove(s).reason;
}

export function doAction(prev: GameState, id: string, rngIn?: Rng): GameState {
  const R = routeOf(prev);
  const { nodes, camp } = R;
  const summit = nodes.length - 1;
  const s = clone(prev);
  const rng = rngIn ?? stateRng(s);
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
    if (s.node === summit) s.dir = 'down';
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
  } else if (id === 'hands') {
    const h = nextHandWear(s);
    if (h !== null) s.hands = h;
  } else if (id === 'rest') {
    const gain = s.restsHere < 2 ? 12 : 4;
    s.restsHere += 1;
    s.stats.stamina += gain;
    s.stats.ams -= 3;
    // Hands in your armpits, swing your arms, wiggle your toes.
    s.handTemp = Math.min(100, s.handTemp + 12);
    s.footTemp = Math.min(100, s.footTemp + 6);
    idle(20);
    log(s, gain > 4 ? 'Took a 20-minute break.' : 'Another break. Your legs stiffen as you sit in the cold.');
  } else if (id === 'melt' && has(s, 'stove') && (s.node === camp || R.bivouacs.includes(s.node)) && atStop(s)) {
    s.water = 3;
    s.stats.morale += 3;
    idle(45);
    log(s, 'Melted snow and refilled to 3 liters.', 'good');
  } else if (id === 'sleep' && s.node === camp && !s.slept && atStop(s)) {
    sleepAtCamp(s, rng);
  } else if (id === 'turnaround') {
    const options = [R.turnaround - 60, R.turnaround, R.turnaround + 60];
    const idx = options.indexOf(s.turnaround);
    s.turnaround = options[(idx + 1) % options.length];
  } else if (id === 'bivy' && R.bivouacs.includes(s.node) && !s.bivied.includes(s.node) && atStop(s)) {
    bivouac(s);
  } else if (id === 'alpine' && !s.slept) {
    const def = defaultAlpineStart(s);
    const options = [def - 60, def, def + 60];
    const idx = options.indexOf(s.alpineStart);
    s.alpineStart = options[(idx + 1) % options.length];
  } else if (id === 'turnback') {
    s.dir = 'down';
    if (s.weather === 'storm' || s.weather === 'whiteout' || s.stats.ams > 60 || s.clock > s.turnaround) {
      s.flags.goodCall = true;
    }
    log(s, `Turned back at ${nodes[s.node].name}.`, 'info');
  } else if (id === 'wait') {
    const m = minuteOfDay(s.clock);
    const dawn = SEASONS[s.season].dawn;
    const until = m < dawn ? dawn - m : DAY - m + dawn;
    idle(until);
    log(s, 'Waited in the dark for first light.', 'info');
  }

  clampStats(s);
  checkVitals(s);
  return s;
}

/** The usual time to leave high camp: the season's alpine start, on the last day of the approach. */
export function defaultAlpineStart(s: GameState) {
  return SEASONS[s.season].alpineStart + DAY * routeOf(s).bivouacs.length;
}

/** A night out on the approach: up at first light. */
function bivouac(s: GameState) {
  const bag = has(s, 'bag');
  const pad = has(s, 'pad');
  const dawn = SEASONS[s.season].dawn;
  const m = minuteOfDay(s.clock);
  const wake = s.clock + (m < dawn ? dawn - m : DAY - m + dawn);
  s.clock = wake;
  s.bivied.push(s.node);
  s.stats.stamina += 20 + (bag ? 25 : 0) + (pad ? 10 : 0);
  s.stats.warmth = bag ? 90 : pad ? 55 : 45;
  s.stats.hydration -= 6;
  s.stats.energy -= 8;
  s.handTemp = bag ? 100 : 70;
  s.footTemp = bag ? 100 : 65;
  s.wet *= bag ? 0.3 : 0.8;
  s.stats.morale += bag ? 4 : -10;
  log(s, bag ? `A night on the glacier in your bag. Up at ${formatClock(wake)}.` : `A long, cold night without a sleeping bag. Up at ${formatClock(wake)}.`, bag ? 'good' : 'bad');
  clampStats(s);
}

function sleepAtCamp(s: GameState, rng: Rng) {
  const bag = has(s, 'bag');
  const pad = has(s, 'pad');
  const wake = Math.max(s.alpineStart, s.clock + 120);
  // Most parties get four to six hours; less than that and you start summit day tired.
  const rested = Math.max(0.5, Math.min(1, (wake - s.clock) / 60 / 6));
  s.clock = wake;
  s.slept = true;
  s.stats.stamina += (10 + (bag ? 25 : 0) + (pad ? 15 : 0)) * rested;
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
  s.hands = 1;
  // Fingers and toes rewarm in the bag, and damp layers dry from body heat inside it.
  s.handTemp = bag ? 100 : 70;
  s.footTemp = bag ? 100 : 65;
  if (s.wet > 20 && bag) log(s, 'You dried your damp base layer inside your sleeping bag.', 'info');
  s.wet *= bag ? 0.3 : 0.8;
  log(
    s,
    bag
      ? `Slept a few hours ${s.route === 'dc' ? 'in the shelter' : 'in the tent'}. Alarm at ${formatClock(wake)}.`
      : `A miserable night shivering ${s.route === 'dc' ? 'on the shelter floor' : 'in the tent'}. Up at ${formatClock(wake)}.`,
    bag ? 'good' : 'bad',
  );
  clampStats(s);
}

// ---------- events ----------

export function eventChoices(s: GameState) {
  if (!s.pendingEvent) return [];
  return EVENT_BY_ID[s.pendingEvent].choices(s);
}

export function chooseEvent(prev: GameState, index: number, rngIn?: Rng, perf?: number): GameState {
  if (!prev.pendingEvent) return prev;
  const s = clone(prev);
  const rng = rngIn ?? stateRng(s);
  const def = EVENT_BY_ID[prev.pendingEvent];
  const choice = def.choices(s)[index];
  if (!choice || choice.disabled) return prev;
  // Without snow school there is no practiced self-arrest: it's down to luck.
  const untrained = choice.skill === 'arrest' && s.flags.noArrest;
  const p = untrained ? undefined : perf === undefined || !choice.skill ? perf : perf * skillHandicap(s, choice.skill);
  const outcome: Outcome = choice.resolve(s, rng, p === undefined ? undefined : Math.max(0, Math.min(1, p)));
  if (choice.skill && p !== undefined) s.skillLog.push({ skill: choice.skill, perf: Math.max(0, Math.min(1, p)) });
  // Rope work in the snow chills your hands, less so in mittens.
  if (choice.skill === 'prusik' || choice.skill === 'zpulley') {
    s.handTemp -= handOuter(s) === 'mitts' ? 4 : handOuter(s) === 'gloves' ? 10 : 18;
  }
  applyOutcome(s, outcome);
  s.usedEvents.push(def.id);
  s.pendingEvent = outcome.next && !s.ending ? outcome.next : null;
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
  checkExtremities(s);
  if (o.turnBack) s.dir = 'down';
  if (o.ending) s.ending = o.ending;
  s.lastOutcome = o.text;
  log(s, o.text, o.tone);
  clampStats(s);
  checkVitals(s);
}

export { packWeightLb };

// ---------- the guide's pick ----------

/**
 * Which event choice a careful guide would take: each option is played out a few times with the
 * climb's dice, and the one that leaves the party best off (alive, warm, rested, on schedule) wins.
 * Turning around only wins when going on looks clearly worse.
 */
export function recommendChoice(s: GameState): number {
  const choices = eventChoices(s);
  const open = choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
  let best = open[0] ?? 0;
  let bestValue = -Infinity;
  for (const i of open) {
    let total = 0;
    for (let k = 0; k < 8; k++) {
      const dice = stateRng({ rngState: (s.rngState + k * 7919 + i * 104729) >>> 0 } as GameState);
      const n = chooseEvent(s, i, dice, choices[i].skill ? 0.7 : undefined);
      const st = n.stats;
      let v = st.stamina + st.warmth + st.hydration + st.energy + st.morale - st.ams * 1.5 - (n.clock - s.clock) * 0.15;
      if (s.dir === 'up' && n.dir === 'down') v -= 60;
      if (n.ending) v += ENDINGS[n.ending].good ? 300 : -2000;
      total += v;
    }
    if (total > bestValue) {
      bestValue = total;
      best = i;
    }
  }
  return best;
}
