/// <reference types="node" />
// Plays thousands of seeded climbs with different player styles and reports how they end.
//   npm run sim                      # 2,000 climbs per style, in each season
//   npm run sim -- --runs 500
//   npm run sim -- --season may      # one season (may | july | september)
//
// Styles:
//   smart     the season's guide's gear list, steady pace, eats/drinks/layers and gloves on time,
//             keeps rest-step rhythm, respects the turnaround time, turns back in a storm or with
//             bad altitude sickness.
//   legacy    the same player using the old one-tap legs and the usual start, for comparison.
//   budget    the smart player in hiking boots and aluminum crampons, without mittens.
//   careless  cotton, hiking boots, aluminum crampons, no parka/glasses/navigation; neglects food,
//             water and layers; no rhythm; never turns back.
//   pusher    full gear but always "push hard", ignores the turnaround time and the weather.
//   cautious  smart, but turns back at the first warning sign.
import { chooseEvent, defaultAlpineStart, doAction, eventChoices, handOuter, newGame, nextHandWear, partTrend, warmthTrend } from '../src/game/engine';
import { ENDINGS, computeScore } from '../src/game/endings';
import { RECOMMENDED, recommendedFor } from '../src/game/gear';
import { SEASON_IDS, SEASONS, type Season } from '../src/game/season';
import { walkMut, type Stride } from '../src/game/movement';
import { formatClock, isNight } from '../src/game/route';
import { ROUTES, ROUTE_IDS, type RouteId } from '../src/game/routes';
import { routeOf, summitOf } from '../src/game/helpers';
import type { PartnerId } from '../src/game/partners';
import type { EndingId, GameState, Rng } from '../src/game/types';

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Policy {
  name: string;
  /** Typical skill performance (0..1) in the Phase 2 mini-games; undefined = classic odds. */
  skill?: number;
  pack: (season: Season, route: RouteId) => string[];
  stride: (s: GameState, rng: Rng) => Stride;
  /** An action id to take before moving, or null. */
  maintain: (s: GameState) => string | null;
  choose: (s: GameState, rng: Rng) => number;
  legacy?: boolean;
}

const enabled = (s: GameState) => eventChoices(s).map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);

/** A skill performance for this player: their typical level with some spread. */
function perfFor(p: Policy, s: GameState, i: number, rng: Rng) {
  if (p.skill === undefined || !eventChoices(s)[i]?.skill) return undefined;
  return Math.max(0, Math.min(1, p.skill + (rng() + rng() + rng() - 1.5) * 0.25));
}

/** Smart choice: try each option a few times and keep the one that leaves you best off. */
function lookahead(s: GameState, rng: Rng, skill?: number) {
  let best = enabled(s)[0] ?? 0;
  let bestScore = -Infinity;
  for (const i of enabled(s)) {
    let total = 0;
    for (let k = 0; k < 6; k++) {
      const r = mulberry32(Math.floor(rng() * 1e9));
      const n = chooseEvent(s, i, r, eventChoices(s)[i]?.skill && skill !== undefined ? skill : undefined);
      const st = n.stats;
      let v = st.stamina + st.warmth + st.hydration + st.energy + st.morale - st.ams * 1.5 - (n.clock - s.clock) * 0.15;
      // Turning around gives up the summit: only worth it when the alternative is worse.
      if (s.dir === 'up' && n.dir === 'down') v -= 60;
      if (n.ending) v += ENDINGS[n.ending].good ? 300 : -2000;
      total += v;
    }
    if (total > bestScore) {
      bestScore = total;
      best = i;
    }
  }
  return best;
}

/** Warmer gloves when fingers are cooling; back to gloves when mittens aren't needed (they're clumsy). */
function handCare(s: GameState): string | null {
  const next = nextHandWear(s);
  if (next === null) return null;
  const cur = handOuter(s) === 'mitts' ? 2 : handOuter(s) === 'gloves' ? 1 : 0;
  if (partTrend(s, 'hands') === 'cold' && next > cur) return 'hands';
  if (cur === 2 && s.handTemp > 70 && partTrend({ ...s, hands: 1 }, 'hands') === 'ok' && s.packed.includes('gloves')) return 'hands';
  return null;
}

function careMaintenance(s: GameState, t: { drink: number; eat: number; rest: number; layers: boolean; early?: boolean }) {
  // Planners leave Muir an hour before the usual start, to have time in hand at the turnaround.
  if (routeOf(s).bivouacs.includes(s.node) && s.dir === 'up' && !s.bivied.includes(s.node)) return 'bivy';
  if (t.early && s.node === routeOf(s).camp && s.dir === 'up' && !s.slept && s.alpineStart >= defaultAlpineStart(s)) return 'alpine';
  if (s.node === routeOf(s).camp && s.dir === 'up' && !s.slept) return 'sleep';
  if ((s.node === routeOf(s).camp || routeOf(s).bivouacs.includes(s.node)) && s.water < 2 && s.packed.includes('stove') && !s.campLeft) return 'melt';
  if (s.stats.hydration < t.drink && s.water >= 0.5) return 'drink';
  if (s.stats.energy < t.eat && s.food > 0) return 'eat';
  if (t.layers) {
    // Only change if the new layer doesn't overshoot into the opposite problem.
    const trend = warmthTrend(s);
    const tryLayer = (d: 1 | -1) => warmthTrend({ ...s, layer: (s.layer + d) as GameState['layer'] });
    if (trend === 'cold' && s.layer < 3 && tryLayer(1) !== 'hot') return 'layer:up';
    if (trend === 'hot' && s.layer > 0 && tryLayer(-1) !== 'cold') return 'layer:down';
    const h = handCare(s);
    if (h) return h;
    if ((s.handTemp < 35 || s.footTemp < 35) && s.restsHere < 2) return 'rest';
  }
  // Going up, time is the scarce thing: break only when you need to. Coming down, rest freely.
  const restBelow = s.dir === 'up' ? Math.min(t.rest, 40) : t.rest;
  if (s.stats.stamina < restBelow && s.restsHere < 2) return 'rest';
  return null;
}

export const turnReasons: Record<string, number> = {};
function smartTurnBack(s: GameState, cautious: boolean) {
  const r = turnReason(s, cautious);
  if (r) turnReasons[r] = (turnReasons[r] ?? 0) + 1;
  return !!r;
}
function turnReason(s: GameState, cautious: boolean): string | null {
  if (s.dir !== 'up' || s.node === 0 || s.node >= summitOf(s)) return null;
  const bad = s.weather === 'storm' || s.weather === 'whiteout';
  if (cautious) {
    if (bad || s.weather === 'coldsnap') return 'weather';
    if (s.stats.ams > 45) return 'altitude';
    if (s.clock > s.turnaround - 60) return 'time';
    if (s.stats.stamina < 25) return 'tired';
    return null;
  }
  if (bad && s.node >= routeOf(s).camp) return 'weather';
  if (s.stats.ams > 65) return 'altitude';
  if (s.clock > s.turnaround) return 'time';
  if (s.stats.stamina < 30 && s.node > routeOf(s).camp) return 'tired';
  return null;
}
function oldTurnBack(s: GameState, cautious: boolean) {
  if (s.dir !== 'up' || s.node === 0 || s.node >= summitOf(s)) return false;
  const bad = s.weather === 'storm' || s.weather === 'whiteout';
  if (cautious) return bad || s.weather === 'coldsnap' || s.stats.ams > 45 || s.clock > s.turnaround - 60 || s.stats.stamina < 45;
  return (bad && s.node >= routeOf(s).camp) || s.stats.ams > 65 || s.clock > s.turnaround || (s.stats.stamina < 30 && s.node > routeOf(s).camp);
}

const CARELESS_PACK = RECOMMENDED.filter((id) => !['parka', 'glasses', 'sun', 'gps', 'map', 'fleece', 'boots_single', 'crampons_steel', 'bivy'].includes(id))
  .concat(['cotton', 'boots_hiking', 'crampons_alu']);

// Common beginner savings: hiking boots, light aluminum crampons, no mittens. Otherwise smart.
const BUDGET_PACK = (season: Season, route: RouteId) => recommendedFor(season, route).filter((id) => !['boots_single', 'crampons_steel', 'mitts'].includes(id))
  .concat(['boots_hiking', 'crampons_alu']);

const POLICIES: Policy[] = [
  {
    name: 'smart',
    skill: 0.8,
    pack: (season, route) => recommendedFor(season, route),
    stride: (_s, rng) => ({ pace: 'steady', rhythm: 0.75 + rng() * 0.2, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, false) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true, early: true })),
    choose: (s, rng) => lookahead(s, rng, POLICIES[0].skill),
  },
  {
    name: 'legacy',
    legacy: true,
    pack: (season, route) => recommendedFor(season, route),
    stride: () => ({ pace: 'steady', rhythm: 0.8, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, false) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true })),
    choose: lookahead,
  },
  {
    name: 'budget',
    skill: 0.8,
    pack: BUDGET_PACK,
    stride: (_s, rng) => ({ pace: 'steady', rhythm: 0.75 + rng() * 0.2, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, false) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true, early: true })),
    choose: (s, rng) => lookahead(s, rng, 0.8),
  },
  {
    name: 'careless',
    skill: 0.45,
    pack: () => [...CARELESS_PACK],
    stride: (_s, rng) => ({ pace: rng() < 0.5 ? 'push' : 'steady', rhythm: 0.15, lateral: rng() < 0.2 ? 6 : 0 }),
    maintain: (s) => careMaintenance(s, { drink: 15, eat: 15, rest: 12, layers: false }),
    choose: (s, rng) => {
      const e = enabled(s);
      return e[Math.floor(rng() * e.length)] ?? 0;
    },
  },
  {
    name: 'pusher',
    skill: 0.65,
    // Packs the summer list whatever the season.
    pack: () => [...RECOMMENDED],
    stride: () => ({ pace: 'push', rhythm: 0.45, lateral: 0 }),
    maintain: (s) => careMaintenance(s, { drink: 35, eat: 35, rest: 25, layers: true }),
    choose: (s) => enabled(s)[0] ?? 0,
  },
  {
    name: 'cautious',
    skill: 0.8,
    pack: (season, route) => recommendedFor(season, route),
    stride: (_s, rng) => ({ pace: 'steady', rhythm: 0.75 + rng() * 0.2, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, true) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true })),
    choose: lookahead,
  },
];

const CHUNK_M = 40;
let partnerArg: PartnerId = 'veteran';

function play(policy: Policy, seed: number, season: Season, route: RouteId = 'dc') {
  const rng = mulberry32(seed);
  let s = newGame(policy.pack(season, route), { rng, season, route, partner: partnerArg });
  let guard = 0;
  let idle = 0;
  while (!s.ending && guard++ < 50000) {
    if (s.pendingEvent) {
      const pick = policy.choose(s, rng);
      s = chooseEvent(s, pick, rng, perfFor(policy, s, pick, rng));
      continue;
    }
    const act = policy.maintain(s);
    if (act) {
      const next = doAction(s, act, rng);
      const sig = (x: GameState) => JSON.stringify([x.stats, x.clock, x.dir, x.layer, x.hands, x.water, x.food, x.slept, x.bivied, x.alpineStart]);
      if (sig(next) !== sig(s)) {
        s = next;
        continue;
      }
    }
    if (isNight(s.clock, s.season) && !s.packed.includes('headlamp')) {
      s = doAction(s, 'wait', rng);
      continue;
    }
    if (policy.legacy) {
      const pace = policy.stride(s, rng).pace;
      if (s.node === summitOf(s) && s.dir === 'up') s = doAction(s, 'go:steady', rng);
      else s = doAction(s, `go:${pace}`, rng);
      continue;
    }
    const moved = walkMut(s, CHUNK_M, policy.stride(s, rng), rng);
    if (moved === 0) {
      if (++idle > 20) break;
      s = doAction(s, 'rest', rng);
    } else idle = 0;
  }
  return s;
}

function trace(style: string, seed: number, season: Season, route: RouteId) {
  const p = POLICIES.find((x) => x.name === style);
  if (!p) throw new Error(`No style ${style}`);
  const s = play(p, seed, season, route);
  for (const e of [...s.log].reverse()) console.log(`${formatClock(e.clock).padStart(8)}  ${e.text}`);
  console.log(`\nEnding: ${s.ending}  stats: ${JSON.stringify(s.stats)}  hands ${Math.round(s.handTemp)} feet ${Math.round(s.footTemp)} wet ${Math.round(s.wet)}`);
}

function main() {
  const se = process.argv.indexOf('--season');
  const seasons: Season[] = se > 0 ? [process.argv[se + 1] as Season] : SEASON_IDS;
  if (seasons.some((x) => !SEASONS[x])) throw new Error(`Season must be one of ${SEASON_IDS.join(', ')}`);
  const ro = process.argv.indexOf('--route');
  const routes: RouteId[] = ro > 0 ? (process.argv[ro + 1] === 'all' ? ROUTE_IDS : [process.argv[ro + 1] as RouteId]) : ['dc'];
  if (routes.some((x) => !ROUTES[x])) throw new Error(`Route must be one of ${ROUTE_IDS.join(', ')} or all`);
  const pa = process.argv.indexOf('--partner');
  if (pa > 0) partnerArg = process.argv[pa + 1] as PartnerId;
  const t = process.argv.indexOf('--trace');
  if (t > 0) return trace(process.argv[t + 1], Number(process.argv[t + 2] ?? 1000), seasons.length === 1 ? seasons[0] : 'july', routes[0]);
  // --skill X sets every player's mini-game performance (0..1), to see how much skill matters.
  const sk = process.argv.indexOf('--skill');
  if (sk > 0) for (const p of POLICIES) if (p.skill !== undefined) p.skill = Number(process.argv[sk + 1]);
  const arg = process.argv.indexOf('--runs');
  const runs = arg > 0 ? Number(process.argv[arg + 1]) : 2000;
  const endings = Object.keys(ENDINGS) as EndingId[];
  const bad = endings.filter((e) => !ENDINGS[e].good);
  const short: Record<string, string> = { hypothermia: 'hypotherm', exhaustion: 'exhausted', avalanche: 'avalanche', crevasse: 'crevasse', rockfall: 'rockfall' };
  console.log(`Summit Rainier simulation: ${runs} climbs per style per season`);
  for (const route of routes) for (const season of seasons) {
    console.log(`\n=== ${ROUTES[route].name}, ${SEASONS[season].label}, partner ${partnerArg} ===`);
    const header = ['style', 'summit', 'retreat', ...bad.map((e) => short[e] ?? e), 'stuck', 'avg score', 'avg hours'];
    console.log(header.map((h) => h.padStart(10)).join(''));
    for (const p of POLICIES) {
      const count: Record<string, number> = {};
      const cold = { nipHands: 0, nipFeet: 0, bite: 0, face: 0, wet: 0 };
      let score = 0;
      let hours = 0;
      for (let i = 0; i < runs; i++) {
        const s = play(p, 1000 + i, season, route);
        const key = s.ending ?? 'stuck';
        count[key] = (count[key] ?? 0) + 1;
        score += computeScore(s);
        hours += (s.clock - 9 * 60) / 60;
        if (s.flags.frostnipHands) cold.nipHands++;
        if (s.flags.frostnipFeet) cold.nipFeet++;
        if (s.flags.frostbiteHands || s.flags.frostbiteFeet) cold.bite++;
        if (s.flags.frostnip) cold.face++;
        if (s.flags.cottonWet || s.wet > 40) cold.wet++;
      }
      const pct = (k: string) => `${(((count[k] ?? 0) / runs) * 100).toFixed(1)}%`;
      const row = [p.name, pct('summit'), pct('retreat'), ...bad.map(pct), pct('stuck'),
        (score / runs).toFixed(0), (hours / runs).toFixed(1)];
      console.log(row.map((c) => c.padStart(10)).join(''));
      const f = (n: number) => `${((n / runs) * 100).toFixed(1)}%`;
      console.log(`${''.padStart(10)}frostnip hands ${f(cold.nipHands)}, feet ${f(cold.nipFeet)}, face ${f(cold.face)}; frostbite ${f(cold.bite)}; wet layers ${f(cold.wet)}`);
      if (Object.keys(turnReasons).length) {
        console.log(`${''.padStart(10)}turned back for: ${Object.entries(turnReasons).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        for (const k of Object.keys(turnReasons)) delete turnReasons[k];
      }
    }
  }
}

main();
