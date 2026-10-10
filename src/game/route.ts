// The Disappointment Cleaver route on Mount Rainier, the most-climbed route on the mountain.
import { SEASONS, type Season } from './season';

export interface RouteNode {
  name: string;
  ft: number;
  desc: string;
}

export const NODES: RouteNode[] = [
  { name: 'Paradise', ft: 5400, desc: 'Trailhead by the Jackson Visitor Center. Permits, blue bags, and the last flush toilet.' },
  { name: 'Pebble Creek', ft: 7200, desc: 'The trail ends and the Muir Snowfield begins. Fill up here.' },
  { name: 'Camp Muir', ft: 10188, desc: 'Stone huts and a public shelter on a rock ridge. Most parties sleep a few hours and leave around midnight.' },
  { name: 'Ingraham Flats', ft: 11100, desc: 'A flat bench on the Ingraham Glacier, past the rock of Cathedral Gap. Rope up here.' },
  { name: 'Top of the Cleaver', ft: 12300, desc: 'Disappointment Cleaver is behind you. Many parties turn around here, which is how it got its name.' },
  { name: 'High Break', ft: 13000, desc: 'Last real rest before the crater rim. The wind usually starts here.' },
  { name: 'Crater Rim', ft: 14150, desc: 'The summit crater. The register box sits in the rocks, and steam vents warm the crater floor.' },
  { name: 'Columbia Crest', ft: 14411, desc: 'The true summit of Mount Rainier.' },
];

export type Terrain = 'trail' | 'snowfield' | 'gap' | 'cleaver' | 'glacier' | 'upper' | 'crater' | 'ridge' | 'ice';

/** What can happen on a leg; the events in events.ts read these instead of leg numbers. */
export interface Hazards {
  /** Sunny snow below high camp: glare and sunburn without glasses and sunscreen. */
  glare?: boolean;
  /** A wide, featureless snowfield: whiteout navigation, and where wands go. */
  whiteout?: boolean;
  /** Glissade chutes on the way down. */
  glissade?: boolean;
  /** Chance of a rockfall event going up and coming down. */
  rockfall?: [number, number];
  /** A loose rock rib walked in crampons (Disappointment Cleaver). */
  cleaver?: boolean;
  crevasse?: boolean;
  ladder?: boolean;
  /** Steep, hard snow where a slip turns into a slide. */
  slip?: boolean;
  /** Where a lens cloud over the summit is easy to see. */
  lenticular?: boolean;
  /** Afternoon slush balling up under crampons on the way down. */
  balling?: boolean;
  /** Multiplier on the season's avalanche chance. */
  avalanche?: number;
  /** Steep ice: front-pointing with two tools, screws for protection. */
  ice?: boolean;
  /** Exposed to ice falling from seracs above. */
  icefall?: number;
}

export interface Leg {
  /** Minutes going up at a steady pace. */
  minutes: number;
  /**
   * Typical fall-line slope on this stretch, degrees: what you'd slide down if you fell.
   * Approximate, from maps and guide descriptions; it varies a lot with the season's route.
   */
  slopeDeg: number;
  terrain: Terrain;
  name: string;
  roped: boolean;
  /** How far you can stray from the boot track (m). */
  corridor: number;
  hazards: Hazards;
}

/** LEGS[i] connects NODES[i] and NODES[i + 1]. */
export const LEGS: Leg[] = [
  { minutes: 150, slopeDeg: 15, terrain: 'trail', name: 'Skyline Trail to Pebble Creek', roped: false, corridor: 3,
    hazards: { glare: true } },
  { minutes: 240, slopeDeg: 20, terrain: 'snowfield', name: 'Muir Snowfield', roped: false, corridor: 30,
    hazards: { glare: true, whiteout: true, glissade: true, avalanche: 0.5 } },
  { minutes: 75, slopeDeg: 28, terrain: 'gap', name: 'Cathedral Gap and the Ingraham Glacier', roped: true, corridor: 6,
    hazards: { rockfall: [0.5, 0.65], crevasse: true, lenticular: true, balling: true, avalanche: 1 } },
  { minutes: 120, slopeDeg: 32, terrain: 'cleaver', name: 'Disappointment Cleaver', roped: true, corridor: 4,
    hazards: { cleaver: true, rockfall: [0, 0.6], lenticular: true, balling: true, avalanche: 1 } },
  { minutes: 75, slopeDeg: 30, terrain: 'glacier', name: 'Upper Ingraham Glacier', roped: true, corridor: 10,
    hazards: { ladder: true, crevasse: true, slip: true, lenticular: true, balling: true, avalanche: 1 } },
  { minutes: 120, slopeDeg: 33, terrain: 'upper', name: 'Switchbacks to the crater rim', roped: true, corridor: 10,
    hazards: { crevasse: true, slip: true, balling: true, avalanche: 1 } },
  { minutes: 25, slopeDeg: 10, terrain: 'crater', name: 'Across the crater', roped: true, corridor: 15, hazards: {} },
];

export const SUMMIT = NODES.length - 1;
export const MUIR = 2;
export const DAY = 1440;
export const START_CLOCK = 9 * 60; // 9:00 AM, day 1
export const ALPINE_START = DAY + 30; // 12:30 AM, day 2

export function minuteOfDay(clock: number) {
  return ((clock % DAY) + DAY) % DAY;
}

/** Dark between sunset and sunrise for the season (July: about 9:00 PM to 5:30 AM). */
export function isNight(clock: number, season: Season = 'july') {
  const m = minuteOfDay(clock);
  const { dawn, dusk } = SEASONS[season];
  return m < dawn || m > dusk;
}

export function formatClock(clock: number) {
  const m = minuteOfDay(Math.round(clock));
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

export function dayOf(clock: number) {
  return Math.floor(clock / DAY) + 1;
}

export function formatFt(ft: number) {
  return `${String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ft`;
}
