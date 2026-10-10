// Career mode: work your way from a forest hike to Rainier. You start with a hiker's kit and some
// savings, buy or rent the rest, pay for permits and gas, and your gear wears out.
//
// All prices are rough 2020s US retail and rental prices, rounded; real ones vary a lot by brand,
// shop and year. Permit and pass fees are approximate and change; check the agencies before a real trip.
import { ENDINGS } from './endings';
import type { RouteId } from './routes';
import type { GameState, Season } from './types';

export type TripId = 'si' | 'muir' | 'school' | 'helens' | 'adams' | 'baker' | 'rainier';

export interface TripDef {
  id: TripId;
  name: string;
  /** The route played; Rainier lets you pick any route you have unlocked. */
  route: RouteId | null;
  /** Fixed season for the trip, or null to choose (Rainier). */
  season: Season | null;
  what: string;
  /** Permits, passes and course fees ($, approximate). */
  fees: number;
  feeNote: string;
  /** Gas and food for the trip ($, approximate). */
  travel: number;
  /** What it gives you besides the experience. */
  teaches: string;
  /** Needs this trip done first. */
  after: TripId | null;
}

export const TRIPS: TripDef[] = [
  {
    id: 'si', name: 'Mount Si', route: 'si', season: 'july', after: null,
    what: 'A training hike: 3,200 ft of forest switchbacks above North Bend.',
    fees: 10, feeNote: 'Discover Pass (day)', travel: 25,
    teaches: 'Fitness: every climb after this costs a little less stamina (up to three times).',
  },
  {
    id: 'muir', name: 'Camp Muir day hike', route: 'muir', season: 'july', after: 'si',
    what: 'Paradise to Camp Muir and back in a day: altitude, the snowfield, and whiteout country.',
    fees: 30, feeNote: 'Mount Rainier entrance (vehicle)', travel: 50,
    teaches: 'Acclimatization and navigation practice.',
  },
  {
    id: 'school', name: 'Snow school', route: null, season: null, after: 'muir',
    what: 'A day on a practice slope: ice axe self-arrest, feet first, head first and on your back.',
    fees: 250, feeNote: 'one-day course', travel: 50,
    teaches: 'Unlocks the self-arrest skill. Until then a slide is up to luck, with poor odds.',
  },
  {
    id: 'helens', name: 'Mount St. Helens', route: 'helens', season: 'may', after: 'school',
    what: 'The spring snow climb up Monitor Ridge to the crater rim. Your first summit.',
    fees: 20, feeNote: 'climbing permit and Northwest Forest Pass', travel: 60,
    teaches: 'A summit, and self-arrest practice for real.',
  },
  {
    id: 'adams', name: 'Mount Adams', route: 'adams', season: 'july', after: 'helens',
    what: 'Two days on the South Spur: a night at Lunch Counter, then 12,276 ft.',
    fees: 25, feeNote: 'Cascade Volcano Pass and Northwest Forest Pass', travel: 90,
    teaches: 'Your first night out high, and real altitude.',
  },
  {
    id: 'baker', name: 'Mount Baker', route: 'baker', season: 'july', after: 'adams',
    what: 'Your first glacier: roped up on the Easton, past Sherman Crater to Grant Peak.',
    fees: 5, feeNote: 'Northwest Forest Pass', travel: 70,
    teaches: 'Rope work and crevasse country.',
  },
  {
    id: 'rainier', name: 'Mount Rainier', route: null, season: null, after: 'baker',
    what: 'The big one. Pick any route you have unlocked and any season.',
    fees: 90, feeNote: 'climbing fee and park entrance', travel: 80,
    teaches: 'The summit of Washington.',
  },
];
export const TRIP_BY_ID: Record<TripId, TripDef> = Object.fromEntries(TRIPS.map((t) => [t.id, t])) as Record<TripId, TripDef>;

/** Approximate new price and per-trip rental ($). Rental is null where shops don't usually rent it. */
export const PRICES: Record<string, { buy: number; rent: number | null }> = {
  boots_single: { buy: 450, rent: 45 }, boots_double: { buy: 900, rent: 70 }, boots_hiking: { buy: 180, rent: null },
  crampons_steel: { buy: 200, rent: 25 }, crampons_alu: { buy: 170, rent: 20 }, gaiters: { buy: 60, rent: 10 },
  snowshoes: { buy: 250, rent: 25 }, axe: { buy: 120, rent: 15 }, tool: { buy: 250, rent: 30 }, helmet: { buy: 90, rent: 12 },
  harness: { buy: 70, rent: 12 }, poles: { buy: 100, rent: 10 }, rope: { buy: 150, rent: 30 }, rescue_kit: { buy: 120, rent: 20 },
  picket: { buy: 45, rent: 8 }, screws: { buy: 150, rent: 20 }, avy: { buy: 550, rent: 50 },
  base: { buy: 90, rent: null }, fleece: { buy: 80, rent: null }, cotton: { buy: 40, rent: null }, shell_jacket: { buy: 300, rent: 30 },
  shell_pants: { buy: 220, rent: 25 }, parka: { buy: 250, rent: 30 }, liners: { buy: 30, rent: null }, gloves: { buy: 80, rent: 12 },
  mitts: { buy: 90, rent: 12 }, balaclava: { buy: 35, rent: null }, glasses: { buy: 120, rent: 15 }, goggles: { buy: 90, rent: 12 },
  sun: { buy: 15, rent: null }, map: { buy: 30, rent: null }, gps: { buy: 350, rent: 25 }, wands: { buy: 40, rent: null },
  oximeter: { buy: 40, rent: null }, plb: { buy: 300, rent: 20 }, headlamp: { buy: 50, rent: null }, water: { buy: 30, rent: null },
  food: { buy: 40, rent: null }, firstaid: { buy: 60, rent: null }, bivy: { buy: 60, rent: null }, bluebags: { buy: 10, rent: null },
  bag: { buy: 400, rent: 40 }, pad: { buy: 120, rent: 15 }, stove: { buy: 150, rent: 20 },
};

/** What a hiker already owns on day one. */
const STARTER = ['boots_hiking', 'base', 'cotton', 'liners', 'sun', 'map', 'headlamp', 'water', 'firstaid'];
/** Bought fresh for every trip with the trip money (food, blue bags): always available. */
export const CONSUMABLES = ['food', 'bluebags'];

/** Pay for a week of work between trips ($, after expenses; a stand-in, not a wage table). */
export const WEEK_PAY = 450;
export const START_MONEY = 600;

export interface Career {
  money: number;
  weeks: number;
  /** Gear you own and how worn it is, 0 (new) .. 100 (worn out). */
  owned: Record<string, number>;
  done: TripId[];
  /** Training from Mount Si, 0..3. */
  fitness: number;
  /** Trips attempted, including failures. */
  trips: number;
}

export function newCareer(): Career {
  return { money: START_MONEY, weeks: 0, owned: Object.fromEntries(STARTER.map((id) => [id, 0])), done: [], fitness: 0, trips: 0 };
}

export const tripOpen = (c: Career, t: TripDef) => !t.after || c.done.includes(t.after);
export const nextTrip = (c: Career) => TRIPS.find((t) => !c.done.includes(t.id) && tripOpen(c, t)) ?? null;
export const tripCost = (t: TripDef) => t.fees + t.travel;

export const canBuy = (c: Career, id: string) => !(id in c.owned) && c.money >= (PRICES[id]?.buy ?? Infinity);

export function buy(c: Career, id: string): Career {
  if (!canBuy(c, id)) return c;
  return { ...c, money: c.money - PRICES[id].buy, owned: { ...c.owned, [id]: 0 } };
}

export function work(c: Career): Career {
  return { ...c, money: c.money + WEEK_PAY, weeks: c.weeks + 1 };
}

/** Cost of renting these items for one trip. */
export const rentalCost = (ids: string[]) => ids.reduce((sum, id) => sum + (PRICES[id]?.rent ?? 0), 0);

/** Gear available on a trip: owned, rented for it, and the trip's consumables. */
export const usable = (c: Career, rented: string[]) => [...Object.keys(c.owned), ...rented, ...CONSUMABLES];

/** How a career shapes the climb: worn gear and training. Passed into newGame. */
export interface CareerEffects {
  fitness: number;
  /** Crampons at 60% wear or more start dull. */
  dullCrampons: boolean;
  /** Boots at 70% wear leak: your feet stay colder. */
  wornBoots: boolean;
  /** Brand-new boots aren't broken in: blisters cost stamina. */
  newBoots: boolean;
  /** No snow school yet: no self-arrest skill, poor odds on a slide. */
  noArrest: boolean;
}

export function effectsFor(c: Career, packed: string[]): CareerEffects {
  const wear = (id: string) => (id in c.owned ? c.owned[id] : -1);
  const crampons = packed.find((id) => id.startsWith('crampons_'));
  const boots = packed.find((id) => id.startsWith('boots_'));
  return {
    fitness: c.fitness,
    dullCrampons: !!crampons && wear(crampons) >= 60,
    wornBoots: !!boots && wear(boots) >= 70,
    newBoots: !!boots && wear(boots) === 0 && boots !== 'boots_hiking',
    noArrest: !c.done.includes('school'),
  };
}

/** Wear added to each owned item used on a trip. Rough: crampons dull on rock, a rope that holds a fall is retired. */
function wearFor(id: string, s: GameState): number {
  const ropeHeldFall = s.log.some((l) => /rope comes tight/i.test(l.text)) || s.usedEvents.includes('crevasse');
  if (id === 'rope') return ropeHeldFall ? 100 : 8;
  if (id.startsWith('crampons_')) return (id === 'crampons_alu' ? 2 : 1) * (s.flags.cramponsDull ? 25 : 10);
  if (id.startsWith('boots_')) return 9;
  if (['gloves', 'mitts', 'liners', 'gaiters', 'shell_jacket', 'shell_pants'].includes(id)) return 7;
  if (['axe', 'helmet', 'harness', 'picket', 'screws', 'tool', 'rescue_kit'].includes(id)) return 4;
  return 3;
}

export interface TripResult {
  career: Career;
  notes: string[];
}

/** After a trip: pay, wear, progress. */
export function finishTrip(prev: Career, trip: TripDef, s: GameState, rented: string[]): TripResult {
  const notes: string[] = [];
  const good = !!s.ending && ENDINGS[s.ending].good;
  const c: Career = { ...prev, owned: { ...prev.owned }, done: [...prev.done], trips: prev.trips + 1 };
  const spent = tripCost(trip) + rentalCost(rented);
  c.money -= spent;
  notes.push(`Trip cost $${spent}: ${trip.feeNote} $${trip.fees}, gas and food $${trip.travel}${rented.length ? `, rentals $${rentalCost(rented)}` : ''}.`);
  for (const id of s.packed) {
    if (!(id in c.owned) || CONSUMABLES.includes(id)) continue;
    c.owned[id] = Math.min(100, c.owned[id] + wearFor(id, s));
    if (c.owned[id] >= 100) {
      delete c.owned[id];
      notes.push(id === 'rope'
        ? 'Your rope held a hard fall. A rope that has caught a big fall gets retired: buy a new one.'
        : `Your ${id.replace(/_/g, ' ')} ${id.startsWith('boots_') ? 'are' : 'is'} worn out.`);
    }
  }
  const success = good && (s.summited || trip.id === 'school');
  if (success && !c.done.includes(trip.id)) {
    c.done.push(trip.id);
    notes.push(`${trip.name}: done. ${trip.teaches}`);
    if (trip.id === 'si') c.fitness = Math.min(3, c.fitness + 1);
  } else if (success && trip.id === 'si') {
    if (c.fitness < 3) {
      c.fitness += 1;
      notes.push(`Fitness up to ${c.fitness}.`);
    }
  } else if (!success) {
    notes.push(`${trip.name} isn't done yet. ${good ? 'Coming home was the right call. Try again.' : 'Recover, then try again.'}`);
  }
  // A rescue isn't free in the game's world either: bills and lost work.
  if (!good) {
    c.money -= 300;
    notes.push('Medical bills and a lost week of work: $300.');
  }
  return { career: c, notes };
}

/** Snow school is passed with a decent average over three self-arrest drills. */
export const SCHOOL_PASS = 0.55;
