// Three climbing seasons on the Disappointment Cleaver route. The numbers are game tuning built on
// what guides and the park describe in general terms; where a number is a guess it says so.
//
// Daylight is computed for Paradise (46.79° N, 121.74° W) on the 15th of each month, Pacific
// Daylight Time, from the standard sunrise equation: May 5:32 AM–8:34 PM, July 5:28 AM–8:58 PM,
// September 6:45 AM–7:19 PM. "Night" in the game is sunrise to sunset; twilight is ignored.

export type Season = 'may' | 'july' | 'september';

export interface SeasonInfo {
  label: string;
  /** One line for the pack screen. */
  blurb: string;
  /** Gear guides add for this season, on top of the summer list. */
  extraGear: string[];
  /** When parties leave Camp Muir on summit day (clock, day 2 = 1440 + minutes). */
  alpineStart: number;
  /** Minutes after midnight: sunrise and sunset. */
  dawn: number;
  dusk: number;
  /** Rough elevation (ft) where continuous snow starts. Varies a lot year to year. */
  snowlineFt: number;
  /** Meters to move the 3D scene's snowline from its July position. */
  sceneSnowShift: number;
  /** Added to the cold index all day, and extra at night. Guesses, tuned for play. */
  cold: number;
  nightCold: number;
  /** Chance of a stable, then unsettled, forecast; the rest is a front. Guesses. */
  forecast: [number, number];
  /** Multiplier on hidden-crevasse falls. */
  crevasse: number;
  /** Chance of a ladder crossing on the upper Ingraham Glacier. */
  ladder: number;
  /** Base chance of an avalanche problem per upper-mountain leg. */
  avalanche: number;
  /** Multiplier on rockfall at Cathedral Gap and the Cleaver. */
  rockfall: number;
  /** Deep soft snow below Camp Muir: slow and tiring without snowshoes. */
  softSnow: boolean;
  /** Time multiplier above Camp Muir, where late-season routes wind around open crevasses. */
  upperTime: number;
  /** Bare, hard glacier ice: more slips, and an ice axe bites poorly when you try to arrest. */
  hardIce: boolean;
  /** Chance of good glissade chutes on the snowfield going down. */
  glissade: number;
}

export const SEASONS: Record<Season, SeasonInfo> = {
  may: {
    label: 'May',
    blurb:
      'Deep snow from the parking lot up. Crevasses are mostly buried under strong bridges, but new snow and spring warming bring avalanche danger. Cold nights.',
    extraGear: ['avy', 'snowshoes', 'wands'],
    alpineStart: 1440 + 30,
    dawn: 332,
    dusk: 1234,
    // Paradise often still has several feet of snow on the ground in May.
    snowlineFt: 4500,
    sceneSnowShift: -800,
    cold: 1.0,
    nightCold: 0.5,
    forecast: [0.35, 0.75],
    crevasse: 0.6,
    // Guide services usually set ladders once the route opens up in summer; uncommon in May.
    ladder: 0.05,
    avalanche: 0.14,
    // Snow still holds the loose rock in place on Cathedral Gap and the Cleaver.
    rockfall: 0.6,
    softSnow: true,
    upperTime: 1,
    hardIce: false,
    glissade: 0.85,
  },
  july: {
    label: 'July',
    blurb:
      'Peak season. The trail to Pebble Creek is mostly dry, the snowfield is firm in the morning, and snow bridges are weakening. The standard guide’s list.',
    extraGear: [],
    alpineStart: 1440 + 30,
    dawn: 328,
    dusk: 1258,
    snowlineFt: 6500,
    sceneSnowShift: 0,
    cold: 0,
    nightCold: 0,
    forecast: [0.45, 0.85],
    crevasse: 1,
    ladder: 0.35,
    // Wind slab after a summer storm is uncommon but real.
    avalanche: 0.02,
    rockfall: 1,
    softSnow: false,
    upperTime: 1,
    hardIce: false,
    glissade: 0.75,
  },
  september: {
    label: 'September',
    blurb:
      'Late season. Dry trail to Pebble Creek, a thin, icy snowfield, open crevasses and more ladders, more rockfall, and short days. Hard glacier ice takes ice screws, not pickets.',
    extraGear: ['screws'],
    // The longer late-season route usually means an earlier start: midnight here, a guess.
    alpineStart: 1440,
    dawn: 405,
    dusk: 1159,
    // The lower Muir Snowfield melts back by late summer; roughly 7,500–8,000 ft. Not measured.
    snowlineFt: 7700,
    sceneSnowShift: 380,
    cold: 0.3,
    nightCold: 0.8,
    // Autumn storms start to return in late September.
    forecast: [0.35, 0.75],
    // Most crevasses are open and visible by now, but the bridges that remain are thin.
    crevasse: 0.85,
    ladder: 0.75,
    avalanche: 0,
    rockfall: 1.35,
    softSnow: false,
    // Late in the season the route often detours around open crevasses, or moves; this is a guess.
    upperTime: 1.15,
    hardIce: true,
    glissade: 0.3,
  },
};

export const SEASON_IDS: Season[] = ['may', 'july', 'september'];
