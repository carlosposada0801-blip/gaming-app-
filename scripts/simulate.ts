/// <reference types="node" />
// Plays thousands of seeded climbs with different player styles and reports how they end.
//   npm run sim                 # 2,000 climbs per style
//   npm run sim -- --runs 500
//
// Styles:
//   smart     guide's gear list, steady pace, eats/drinks/layers on time, keeps rest-step rhythm,
//             respects the turnaround time, turns back in a storm or with bad altitude sickness.
//   legacy    the same player using the old one-tap legs, for comparison with walking.
//   careless  cotton, hiking boots, aluminum crampons, no parka/glasses/navigation; neglects food,
//             water and layers; no rhythm; never turns back.
//   pusher    full gear but always "push hard", ignores the turnaround time and the weather.
//   cautious  smart, but turns back at the first warning sign.
import { atStop, chooseEvent, doAction, eventChoices, newGame, warmthTrend } from '../src/game/engine';
import { ENDINGS, computeScore } from '../src/game/endings';
import { RECOMMENDED } from '../src/game/gear';
import { walkMut, type Stride } from '../src/game/movement';
import { MUIR, SUMMIT, formatClock, isNight } from '../src/game/route';
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
  pack: () => string[];
  stride: (s: GameState, rng: Rng) => Stride;
  /** An action id to take before moving, or null. */
  maintain: (s: GameState) => string | null;
  choose: (s: GameState, rng: Rng) => number;
  legacy?: boolean;
}

const enabled = (s: GameState) => eventChoices(s).map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);

/** Smart choice: try each option a few times and keep the one that leaves you best off. */
function lookahead(s: GameState, rng: Rng) {
  let best = enabled(s)[0] ?? 0;
  let bestScore = -Infinity;
  for (const i of enabled(s)) {
    let total = 0;
    for (let k = 0; k < 6; k++) {
      const r = mulberry32(Math.floor(rng() * 1e9));
      const n = chooseEvent(s, i, r);
      const st = n.stats;
      let v = st.stamina + st.warmth + st.hydration + st.energy + st.morale - st.ams * 1.5 - (n.clock - s.clock) * 0.15;
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

function careMaintenance(s: GameState, t: { drink: number; eat: number; rest: number; layers: boolean }) {
  if (s.node === MUIR && s.dir === 'up' && !s.slept) return 'sleep';
  if (s.node === MUIR && s.water < 2 && s.packed.includes('stove') && !s.campLeft) return 'melt';
  if (s.stats.hydration < t.drink && s.water >= 0.5) return 'drink';
  if (s.stats.energy < t.eat && s.food > 0) return 'eat';
  if (t.layers) {
    // Only change if the new layer doesn't overshoot into the opposite problem.
    const trend = warmthTrend(s);
    const tryLayer = (d: 1 | -1) => warmthTrend({ ...s, layer: (s.layer + d) as GameState['layer'] });
    if (trend === 'cold' && s.layer < 3 && tryLayer(1) !== 'hot') return 'layer:up';
    if (trend === 'hot' && s.layer > 0 && tryLayer(-1) !== 'cold') return 'layer:down';
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
  if (s.dir !== 'up' || s.node === 0 || s.node >= SUMMIT) return null;
  const bad = s.weather === 'storm' || s.weather === 'whiteout';
  if (cautious) {
    if (bad || s.weather === 'coldsnap') return 'weather';
    if (s.stats.ams > 45) return 'altitude';
    if (s.clock > s.turnaround - 60) return 'time';
    if (s.stats.stamina < 25) return 'tired';
    return null;
  }
  if (bad && s.node >= MUIR) return 'weather';
  if (s.stats.ams > 65) return 'altitude';
  if (s.clock > s.turnaround) return 'time';
  if (s.stats.stamina < 30 && s.node >= 3) return 'tired';
  return null;
}
function oldTurnBack(s: GameState, cautious: boolean) {
  if (s.dir !== 'up' || s.node === 0 || s.node >= SUMMIT) return false;
  const bad = s.weather === 'storm' || s.weather === 'whiteout';
  if (cautious) return bad || s.weather === 'coldsnap' || s.stats.ams > 45 || s.clock > s.turnaround - 60 || s.stats.stamina < 45;
  return (bad && s.node >= MUIR) || s.stats.ams > 65 || s.clock > s.turnaround || (s.stats.stamina < 30 && s.node >= 3);
}

const CARELESS_PACK = RECOMMENDED.filter((id) => !['parka', 'glasses', 'sun', 'gps', 'map', 'fleece', 'boots_single', 'crampons_steel', 'bivy'].includes(id))
  .concat(['cotton', 'boots_hiking', 'crampons_alu']);

const POLICIES: Policy[] = [
  {
    name: 'smart',
    pack: () => [...RECOMMENDED],
    stride: (_s, rng) => ({ pace: 'steady', rhythm: 0.75 + rng() * 0.2, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, false) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true })),
    choose: lookahead,
  },
  {
    name: 'legacy',
    legacy: true,
    pack: () => [...RECOMMENDED],
    stride: () => ({ pace: 'steady', rhythm: 0.8, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, false) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true })),
    choose: lookahead,
  },
  {
    name: 'careless',
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
    pack: () => [...RECOMMENDED],
    stride: () => ({ pace: 'push', rhythm: 0.45, lateral: 0 }),
    maintain: (s) => careMaintenance(s, { drink: 35, eat: 35, rest: 25, layers: true }),
    choose: (s) => enabled(s)[0] ?? 0,
  },
  {
    name: 'cautious',
    pack: () => [...RECOMMENDED],
    stride: (_s, rng) => ({ pace: 'steady', rhythm: 0.75 + rng() * 0.2, lateral: 0 }),
    maintain: (s) => (smartTurnBack(s, true) ? 'turnback' : careMaintenance(s, { drink: 55, eat: 55, rest: 60, layers: true })),
    choose: lookahead,
  },
];

const CHUNK_M = 40;

function play(policy: Policy, seed: number) {
  const rng = mulberry32(seed);
  let s = newGame(policy.pack(), rng);
  let guard = 0;
  let idle = 0;
  while (!s.ending && guard++ < 50000) {
    if (s.pendingEvent) {
      s = chooseEvent(s, policy.choose(s, rng), rng);
      continue;
    }
    const act = policy.maintain(s);
    if (act) {
      const next = doAction(s, act, rng);
      const sig = (x: GameState) => JSON.stringify([x.stats, x.clock, x.dir, x.layer, x.water, x.food, x.slept]);
      if (sig(next) !== sig(s)) {
        s = next;
        continue;
      }
    }
    if (isNight(s.clock) && !s.packed.includes('headlamp')) {
      s = doAction(s, 'wait', rng);
      continue;
    }
    if (policy.legacy) {
      const pace = policy.stride(s, rng).pace;
      if (s.node === SUMMIT && s.dir === 'up') s = doAction(s, 'go:steady', rng);
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

function trace(style: string, seed: number) {
  const p = POLICIES.find((x) => x.name === style);
  if (!p) throw new Error(`No style ${style}`);
  const s = play(p, seed);
  for (const e of [...s.log].reverse()) console.log(`${formatClock(e.clock).padStart(8)}  ${e.text}`);
  console.log(`\nEnding: ${s.ending}  stats: ${JSON.stringify(s.stats)}`);
}

function main() {
  const t = process.argv.indexOf('--trace');
  if (t > 0) return trace(process.argv[t + 1], Number(process.argv[t + 2] ?? 1000));
  const arg = process.argv.indexOf('--runs');
  const runs = arg > 0 ? Number(process.argv[arg + 1]) : 2000;
  const endings = Object.keys(ENDINGS) as EndingId[];
  console.log(`Summit Rainier simulation: ${runs} climbs per style\n`);
  const header = ['style', 'summit', 'retreat', ...endings.filter((e) => !ENDINGS[e].good), 'stuck', 'avg score', 'avg hours'];
  console.log(header.map((h) => h.padStart(10)).join(''));
  for (const p of POLICIES) {
    const count: Record<string, number> = {};
    let score = 0;
    let hours = 0;
    for (let i = 0; i < runs; i++) {
      const s = play(p, 1000 + i);
      const key = s.ending ?? 'stuck';
      count[key] = (count[key] ?? 0) + 1;
      score += computeScore(s);
      hours += (s.clock - 9 * 60) / 60;
    }
    const pct = (k: string) => `${(((count[k] ?? 0) / runs) * 100).toFixed(1)}%`;
    const row = [p.name, pct('summit'), pct('retreat'), ...endings.filter((e) => !ENDINGS[e].good).map(pct), pct('stuck'),
      (score / runs).toFixed(0), (hours / runs).toFixed(1)];
    console.log(row.map((c) => c.padStart(10)).join(''));
    if (Object.keys(turnReasons).length) {
      console.log(`${''.padStart(10)}turned back for: ${Object.entries(turnReasons).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const k of Object.keys(turnReasons)) delete turnReasons[k];
    }
  }
}

main();
