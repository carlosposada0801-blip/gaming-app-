// Your rope partner. Each one carries their own gear and has their own body and temperament: how
// fast altitude gets to them, how well they hold a fall, and what they say when things change.
// The personalities are archetypes every guide will recognize, not real people.
import type { GameState } from './types';

export type PartnerId = 'veteran' | 'friend' | 'firstTimer' | 'guide';

export interface PartnerDef {
  id: PartnerId;
  name: string;
  title: string;
  blurb: string;
  /** Range of their altitude-sickness susceptibility (yours is 0.7..1.4). */
  susceptibility: [number, number];
  /** Chance they stop the rope team when you slide and can't arrest. */
  catch: number;
  /** Multiplier on Z-pulley time when they build it. */
  rigging: number;
  /** Multiplier on the party's walking time (the party moves at the slower climber's pace). */
  pace: number;
  /** Their own kit. */
  gear: string[];
}

const FULL = ['helmet', 'harness', 'axe', 'crampons_steel', 'rescue_kit', 'picket', 'mitts', 'gloves', 'parka', 'headlamp', 'glasses'];

export const PARTNERS: Record<PartnerId, PartnerDef> = {
  veteran: {
    id: 'veteran',
    name: 'Ash',
    title: 'The cautious veteran',
    blurb: 'Twenty-odd Rainier summits and as many turnarounds. Slow to worry, quick to call it. Carries everything.',
    susceptibility: [0.6, 0.9],
    catch: 0.9,
    rigging: 0.85,
    pace: 1,
    gear: [...FULL, 'screws'],
  },
  friend: {
    id: 'friend',
    name: 'Jordan',
    title: 'The strong, reckless friend',
    blurb: 'Fit, fast and fun. Left the helmet and mittens in the car to save weight, and hates turning around.',
    susceptibility: [0.8, 1.4],
    catch: 0.8,
    rigging: 1,
    pace: 0.95,
    gear: FULL.filter((g) => g !== 'helmet' && g !== 'mitts' && g !== 'picket'),
  },
  firstTimer: {
    id: 'firstTimer',
    name: 'Riley',
    title: 'The nervous first-timer',
    blurb: 'Took a glacier course in the spring. Rented everything, packed too much, and asks good questions. Altitude is new to them.',
    susceptibility: [0.9, 1.6],
    catch: 0.6,
    rigging: 1.3,
    pace: 1.1,
    gear: FULL.filter((g) => g !== 'crampons_steel').concat(['crampons_alu']),
  },
  guide: {
    id: 'guide',
    name: 'Your guide',
    title: 'A guide from a guide service',
    blurb: 'Checks your gear, sets the pace, makes the calls, and turns the team around when it is time.',
    susceptibility: [0.5, 0.8],
    catch: 0.95,
    rigging: 0.8,
    pace: 1,
    gear: [...FULL, 'screws'],
  },
};

export const PARTNER_IDS: PartnerId[] = ['veteran', 'friend', 'firstTimer'];

export const partnerOf = (s: GameState) => PARTNERS[s.partner];
export const partnerHas = (s: GameState, id: string) => PARTNERS[s.partner].gear.includes(id);

type Line = { key: string; when: (s: GameState) => boolean; say: Partial<Record<PartnerId, string>> };

/**
 * Things your partner says as the climb changes. Each line is said once per climb; the first one
 * that applies wins. Checked at every stop.
 */
const LINES: Line[] = [
  {
    key: 'turnaround',
    when: (s) => s.dir === 'up' && !s.summited && s.clock > s.turnaround - 60 && s.clock < s.turnaround,
    say: {
      veteran: 'An hour to our turnaround. If we’re not on top by then, we go down. No debate.',
      friend: 'Turnaround’s just a number. We’re so close.',
      firstTimer: 'Shouldn’t we be heading down soon? It’s getting late.',
      guide: 'One hour to turnaround. Pick it up a little, or we’ll be turning around short.',
    },
  },
  {
    key: 'weather',
    when: (s) => s.dir === 'up' && (s.weather === 'storm' || s.weather === 'whiteout' || s.weather === 'windy'),
    say: {
      veteran: 'That wind is building. I’d think hard about going on.',
      friend: 'It’s just a little wind. Keeps us cool.',
      firstTimer: 'I really don’t like this. Can we talk about going down?',
      guide: 'Weather’s turning. I’m watching it. Layers on at the next stop.',
    },
  },
  {
    key: 'altitude',
    when: (s) => s.partnerAms > 35,
    say: {
      veteran: 'Headache’s coming on. I’ll tell you if it gets worse. Drink up.',
      friend: 'I’m fine. Totally fine. Let’s go.',
      firstTimer: 'My head is pounding. Is that normal up here?',
      guide: 'Everyone drink. Altitude headaches come on about now.',
    },
  },
  {
    key: 'tired',
    when: (s) => s.dir === 'up' && s.stats.stamina < 35,
    say: {
      veteran: 'You’re working too hard. Rest-step: lock the knee, breathe, step.',
      friend: 'Come on, you’ve got this! Push!',
      firstTimer: 'You look as wrecked as I feel.',
      guide: 'Slow it down. Rest-step. We go as fast as the slowest climber.',
    },
  },
];

/** What your partner says on arriving at a stop, if anything (each line once per climb). */
export function partnerLine(s: GameState): string | null {
  for (const line of LINES) {
    const text = line.say[s.partner];
    if (!text || s.usedEvents.includes(`say:${line.key}`)) continue;
    if (!line.when(s)) continue;
    s.usedEvents.push(`say:${line.key}`);
    return `${PARTNERS[s.partner].name}: “${text}”`;
  }
  return null;
}
