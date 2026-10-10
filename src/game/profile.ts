// Your climbing life across games: the logbook, skills that level up with use, badges, unlocked
// routes, Daily Climb results and the hardcore streak. Pure functions; src/ui/storage.ts saves it.
import { ENDINGS, computeScore } from './endings';
import { routeOf } from './helpers';
import type { RouteId } from './routes';
import type { GameState, Mode, PartnerId, Season, SkillLevels } from './types';

export interface LogbookEntry {
  id: string;
  /** ISO date of the climb. */
  date: string;
  seed: string;
  daily: boolean;
  route: RouteId;
  season: Season;
  partner: PartnerId;
  mode: Mode;
  ending: string;
  summited: boolean;
  score: number;
  highFt: number;
  hours: number;
  /** File URI (phone) or data URL (web) of the summit photo, if one was taken. */
  photo?: string;
}

export interface Profile {
  xp: SkillLevels;
  log: LogbookEntry[];
  badges: string[];
  /** Best score for each Daily Climb, by date. */
  daily: Record<string, number>;
  /** Hardcore: safe returns in a row, and the best run. A bad ending resets the run. */
  hardcore: { streak: number; best: number };
}

export const EMPTY_PROFILE: Profile = {
  xp: { nav: 0, arrest: 0, acclim: 0 },
  log: [],
  badges: [],
  daily: {},
  hardcore: { streak: 0, best: 0 },
};

export const SKILL_NAMES: Record<keyof SkillLevels, { name: string; what: string }> = {
  nav: { name: 'Navigation', what: 'Faster map-and-compass work and fewer wrong turns in a whiteout.' },
  arrest: { name: 'Self-arrest', what: 'Better odds of stopping a slide.' },
  acclim: { name: 'Acclimatization', what: 'Altitude sickness builds more slowly.' },
};

/** XP needed for each level 1..5. */
const LEVELS = [2, 5, 9, 14, 20];
export const MAX_LEVEL = LEVELS.length;

export function levelOf(xp: number) {
  let lvl = 0;
  while (lvl < LEVELS.length && xp >= LEVELS[lvl]) lvl++;
  return lvl;
}

/** Progress toward the next level, 0..1 (1 at max level). */
export function levelProgress(xp: number) {
  const lvl = levelOf(xp);
  if (lvl >= LEVELS.length) return 1;
  const lo = lvl === 0 ? 0 : LEVELS[lvl - 1];
  return (xp - lo) / (LEVELS[lvl] - lo);
}

export const skillLevels = (p: Profile): SkillLevels => ({
  nav: levelOf(p.xp.nav),
  arrest: levelOf(p.xp.arrest),
  acclim: levelOf(p.xp.acclim),
});

/** What a climb teaches you. */
export function xpFromClimb(s: GameState): SkillLevels {
  const arrests = s.skillLog.filter((x) => x.skill === 'arrest');
  const whiteouts = s.usedEvents.filter((e) => e === 'whiteout_up' || e === 'whiteout_down').length;
  const R = routeOf(s);
  const reachedCamp = s.slept || s.log.some((l) => l.text.includes(R.nodes[R.camp].name));
  return {
    // Practice that counts: every self-arrest you perform, extra for a clean one.
    arrest: arrests.length + arrests.filter((x) => x.perf > 0.75).length,
    // Route finding: every whiteout, plus a little for each climb above high camp.
    nav: whiteouts * 2 + (reachedCamp ? 1 : 0),
    // A night at high camp, and time near 14,000 ft.
    acclim: (s.slept ? 1 : 0) + (s.summited ? 1 : 0),
  };
}

export function isUnlocked(p: Profile, route: RouteId) {
  const summits = (r: RouteId) => p.log.some((e) => e.route === r && e.summited && ENDINGS[e.ending as keyof typeof ENDINGS]?.good);
  switch (route) {
    case 'dc': return true;
    case 'emmons': return summits('dc');
    case 'kautz': return summits('emmons');
    case 'liberty': return summits('kautz') && levelOf(p.xp.arrest) >= 2;
  }
}

export interface Badge {
  id: string;
  name: string;
  how: string;
}

export const BADGES: Badge[] = [
  { id: 'home', name: 'Home safe', how: 'Walk back into the trailhead parking lot.' },
  { id: 'summit', name: 'Columbia Crest', how: 'Stand on the summit and get home.' },
  { id: 'good_call', name: 'Good call', how: 'Turn back for the right reason.' },
  { id: 'arrest', name: 'Pick in, toes in', how: 'A textbook self-arrest.' },
  { id: 'rescue', name: 'Out of the slot', how: 'Climb or haul out of a crevasse.' },
  { id: 'clean', name: 'All ten fingers', how: 'Summit with no frostnip, snow blindness or injury.' },
  { id: 'may', name: 'Spring snow', how: 'Summit in May.' },
  { id: 'september', name: 'Late season', how: 'Summit in September.' },
  { id: 'seasons', name: 'Three seasons', how: 'Summit in May, July and September.' },
  { id: 'route_dc', name: 'The Cleaver', how: 'Summit by the Disappointment Cleaver.' },
  { id: 'route_emmons', name: 'Biggest glacier', how: 'Summit by the Emmons-Winthrop.' },
  { id: 'route_kautz', name: 'Ice chute', how: 'Summit by the Kautz Glacier.' },
  { id: 'route_liberty', name: 'Liberty Ridge', how: 'Summit by Liberty Ridge.' },
  { id: 'all_routes', name: 'Four sides', how: 'Summit by all four routes.' },
  { id: 'daily', name: 'Daily climber', how: 'Finish a Daily Climb.' },
  { id: 'guided', name: 'Client', how: 'Finish a guided climb.' },
  { id: 'hardcore', name: 'One life', how: 'Summit and get home in hardcore mode.' },
  { id: 'streak', name: 'Old climber', how: 'Five safe returns in a row in hardcore mode.' },
  { id: 'friends', name: 'Rope team', how: 'Climb with all three partners.' },
];

export interface ClimbResult {
  profile: Profile;
  entry: LogbookEntry;
  newBadges: Badge[];
  /** Skills that went up a level, with the new level. */
  levelUps: { skill: keyof SkillLevels; level: number }[];
}

/** Adds a finished climb to the profile. */
export function recordClimb(prev: Profile, s: GameState, extra: { daily: boolean; highFt: number; photo?: string; now?: Date }): ClimbResult {
  const good = !!s.ending && ENDINGS[s.ending].good;
  const now = extra.now ?? new Date();
  const entry: LogbookEntry = {
    id: `${now.getTime()}`,
    date: now.toISOString(),
    seed: s.seed,
    daily: extra.daily,
    route: s.route,
    season: s.season,
    partner: s.partner,
    mode: s.mode,
    ending: s.ending ?? 'retreat',
    summited: s.summited,
    score: computeScore(s),
    highFt: extra.highFt,
    hours: Math.round(((s.clock - 9 * 60) / 60) * 10) / 10,
    photo: extra.photo,
  };
  const gained = xpFromClimb(s);
  const before = skillLevels(prev);
  const profile: Profile = {
    xp: { nav: prev.xp.nav + gained.nav, arrest: prev.xp.arrest + gained.arrest, acclim: prev.xp.acclim + gained.acclim },
    log: [entry, ...prev.log].slice(0, 200),
    badges: [...prev.badges],
    daily: { ...prev.daily },
    hardcore: { ...prev.hardcore },
  };
  if (extra.daily) {
    const day = s.seed.replace(/^DAILY-/, '');
    profile.daily[day] = Math.max(profile.daily[day] ?? 0, entry.score);
  }
  if (s.mode === 'hardcore') {
    profile.hardcore.streak = good ? profile.hardcore.streak + 1 : 0;
    profile.hardcore.best = Math.max(profile.hardcore.best, profile.hardcore.streak);
  }
  const after = skillLevels(profile);
  const levelUps = (Object.keys(after) as (keyof SkillLevels)[])
    .filter((k) => after[k] > before[k])
    .map((k) => ({ skill: k, level: after[k] }));

  const summitHome = good && s.summited;
  const summitsIn = (pred: (e: LogbookEntry) => boolean) => profile.log.some((e) => e.summited && ENDINGS[e.ending as keyof typeof ENDINGS]?.good && pred(e));
  const f = s.flags;
  const earned: Record<string, boolean> = {
    home: good,
    summit: summitHome,
    good_call: good && !!f.goodCall,
    arrest: s.skillLog.some((x) => x.skill === 'arrest' && x.perf > 0.75),
    rescue: good && s.skillLog.some((x) => x.skill === 'prusik' || x.skill === 'zpulley'),
    clean: summitHome && !f.frostnip && !f.frostnipHands && !f.frostnipFeet && !f.snowBlind && !f.ankle && !f.sunburn,
    may: summitHome && s.season === 'may',
    september: summitHome && s.season === 'september',
    seasons: (['may', 'july', 'september'] as Season[]).every((x) => summitsIn((e) => e.season === x)),
    route_dc: summitHome && s.route === 'dc',
    route_emmons: summitHome && s.route === 'emmons',
    route_kautz: summitHome && s.route === 'kautz',
    route_liberty: summitHome && s.route === 'liberty',
    all_routes: (['dc', 'emmons', 'kautz', 'liberty'] as RouteId[]).every((r) => summitsIn((e) => e.route === r)),
    daily: extra.daily,
    guided: s.mode === 'guided',
    hardcore: summitHome && s.mode === 'hardcore',
    streak: profile.hardcore.streak >= 5,
    friends: (['veteran', 'friend', 'firstTimer'] as PartnerId[]).every((p) => profile.log.some((e) => e.partner === p)),
  };
  const newBadges = BADGES.filter((b) => earned[b.id] && !profile.badges.includes(b.id));
  profile.badges.push(...newBadges.map((b) => b.id));
  return { profile, entry, newBadges, levelUps };
}
