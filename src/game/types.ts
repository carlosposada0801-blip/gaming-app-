export type Weather = 'clear' | 'windy' | 'whiteout' | 'coldsnap' | 'storm';
export type Forecast = 'stable' | 'unsettled' | 'incoming';
export type Pace = 'rest' | 'steady' | 'push';
/** 0 = base layer only, 1 = + midlayer, 2 = + shells & gloves, 3 = full kit with parka. */
export type LayerLevel = 0 | 1 | 2 | 3;

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
  | 'partner';

export interface LogEntry {
  clock: number;
  text: string;
  tone?: 'good' | 'bad' | 'info';
}

export interface Flags {
  skippedBlueBags?: boolean;
  wandsPlaced?: boolean;
  snowBlind?: boolean;
  frostnip?: boolean;
  sunburn?: boolean;
  cottonWet?: boolean;
  cramponsDull?: boolean;
  ankle?: boolean;
  goodCall?: boolean;
  pushedPastTurnaround?: boolean;
  partnerDown?: boolean;
}

export interface GameState {
  packed: string[];
  stats: Stats;
  /** Index into NODES where the climber currently stands. */
  node: number;
  dir: 'up' | 'down';
  /** Minutes since midnight on day 1. */
  clock: number;
  weather: Weather;
  forecast: Forecast;
  layer: LayerLevel;
  water: number; // liters carried
  food: number; // servings left
  slept: boolean;
  campLeft: boolean;
  turnaround: number; // clock value on day 2
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
}

export interface Choice {
  label: string;
  hint?: string;
  disabled?: boolean;
  resolve: (s: GameState, rng: Rng) => Outcome;
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
}
