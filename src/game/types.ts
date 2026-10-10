import type { Season } from './season';
import type { RouteId } from './routes';
import type { PartnerId } from './partners';
export type { Season, RouteId, PartnerId };

/** standard; guided (a guide makes the calls, rents missing gear, lower score); hardcore (one life). */
export type Mode = 'standard' | 'guided' | 'hardcore';

/** Skill levels 0..5 carried in from your logbook (see src/game/profile.ts). */
export interface SkillLevels {
  nav: number;
  arrest: number;
  acclim: number;
}

export type Weather = 'clear' | 'windy' | 'whiteout' | 'coldsnap' | 'storm';
export type Forecast = 'stable' | 'unsettled' | 'incoming';
export type Pace = 'rest' | 'steady' | 'push';
/** 0 = base layer only, 1 = + midlayer, 2 = + shells, 3 = full kit with parka. */
export type LayerLevel = 0 | 1 | 2 | 3;
/** What's on your hands: liner gloves alone, insulated gloves, or mittens (both over the liners). */
export type HandWear = 0 | 1 | 2;

export interface Stats {
  stamina: number;
  warmth: number;
  hydration: number;
  energy: number;
  /** Altitude sickness. 0 is fine, 100 is HACE/HAPE. */
  ams: number;
  morale: number;
}

export type EndingId =
  | 'summit'
  | 'retreat'
  | 'hypothermia'
  | 'exhaustion'
  | 'ams'
  | 'crevasse'
  | 'fall'
  | 'rockfall'
  | 'lost'
  | 'partner'
  | 'avalanche'
  | 'icefall';

export interface LogEntry {
  clock: number;
  text: string;
  tone?: 'good' | 'bad' | 'info';
}

export interface Flags {
  skippedBlueBags?: boolean;
  wandsPlaced?: boolean;
  snowBlind?: boolean;
  /** Frostnip on the face (wind). Hands and feet have their own flags. */
  frostnip?: boolean;
  frostnipHands?: boolean;
  frostnipFeet?: boolean;
  frostbiteHands?: boolean;
  frostbiteFeet?: boolean;
  /** Warned about numb fingers / toes; cleared once they rewarm. */
  numbHands?: boolean;
  numbFeet?: boolean;
  sunburn?: boolean;
  cottonWet?: boolean;
  cramponsDull?: boolean;
  ankle?: boolean;
  goodCall?: boolean;
  pushedPastTurnaround?: boolean;
  partnerDown?: boolean;
  /** Your partner was hurt (rockfall without a helmet). */
  partnerHurt?: boolean;
}

export interface GameState {
  season: Season;
  route: RouteId;
  partner: PartnerId;
  mode: Mode;
  skills: SkillLevels;
  /** Shown to the player; the same seed gives the same forecast and the same dice for the same choices. */
  seed: string;
  /** State of the climb's own random number generator. */
  rngState: number;
  /** Every skill you performed and how well (0..1), for the logbook and skill levels. */
  skillLog: { skill: SkillId; perf: number }[];
  /** The last thing your partner said, if anything new. */
  partnerSays: string | null;
  packed: string[];
  stats: Stats;
  /** Index into the route's nodes: the stop the climber is at or last left. */
  node: number;
  dir: 'up' | 'down';
  /** Minutes since midnight on day 1. */
  clock: number;
  weather: Weather;
  forecast: Forecast;
  layer: LayerLevel;
  hands: HandWear;
  /** Warmth of fingers and toes, 0..100. Below ~40 they go numb, below 15 frostnip, 0 frostbite. */
  handTemp: number;
  footTemp: number;
  /** Sweat soaked into your clothing, 0 (dry) .. 100 (soaked). Wet layers insulate less. */
  wet: number;
  water: number; // liters carried
  food: number; // servings left
  slept: boolean;
  /** Bivouac stops already slept at on the way up. */
  bivied: number[];
  campLeft: boolean;
  turnaround: number; // clock value on day 2
  /** When you plan to leave Camp Muir on summit day (clock). */
  alpineStart: number;
  susceptibility: number; // personal AMS factor
  partnerAms: number;
  partnerSusceptibility: number;
  summited: boolean;
  flags: Flags;
  usedEvents: string[];
  pendingEvent: string | null;
  /** Result text of the last resolved event, shown once. */
  lastOutcome: string | null;
  ending: EndingId | null;
  log: LogEntry[];
  /** Incremented on every leg so the 3D scene knows to animate. */
  moveId: number;
  restsHere: number;
  prevNode: number;
  /** Meters along the route from Paradise (see src/game/data/routeProfile.ts). */
  dist: number;
  /** Sideways offset from the boot track, meters (+ = right of travel direction going up). */
  lateral: number;
  /** Clock when the party left the last stop, for the arrival events. */
  legStart: number;
  /** Meters walked off the boot track on this leg. */
  legOffTrack: number;
}

export type Rng = () => number;

export interface Outcome {
  text: string;
  delta?: Partial<Stats>;
  minutes?: number;
  ending?: EndingId;
  turnBack?: boolean;
  tone?: 'good' | 'bad' | 'info';
  mutate?: (s: GameState) => void;
  /** An event that follows at once (e.g. a slip after a front point shears out). */
  next?: string;
}

/** Hands-on skills the player performs as a mini-game (Phase 2). */
export type SkillId = 'arrest' | 'prusik' | 'zpulley' | 'ladder';

export interface Choice {
  label: string;
  hint?: string;
  disabled?: boolean;
  /** If set, the climb screen plays this skill and passes the result to `resolve`. */
  skill?: SkillId;
  /**
   * `perf` is how well the player performed the skill, 0 (botched) to 1 (textbook). When it is
   * undefined (no mini-game, e.g. the simulation's legacy players) the classic odds apply.
   */
  resolve: (s: GameState, rng: Rng, perf?: number) => Outcome;
}

export interface EventDef {
  id: string;
  title: string;
  /** Probability (0..1) that this event fires now. Called after arriving at a node. */
  chance: (s: GameState, ctx: ArrivalContext) => number;
  text: (s: GameState) => string;
  choices: (s: GameState) => Choice[];
  repeatable?: boolean;
}

export interface ArrivalContext {
  /** Leg index just travelled (0 = Paradise to Pebble Creek). */
  leg: number;
  dir: 'up' | 'down';
  /** Clock at the start of the leg. */
  start: number;
  minutes: number;
  /** Meters walked off the boot track on this leg (raises crevasse risk on glaciers). */
  offTrack?: number;
}
