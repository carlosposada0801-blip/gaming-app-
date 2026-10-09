import { GEAR_BY_ID } from './gear';
import type { Season } from './season';
import type { EndingId, GameState } from './types';

export interface EndingInfo {
  title: string;
  body: string;
  lesson: string;
  good: boolean;
}

export const ENDINGS: Record<EndingId, EndingInfo> = {
  summit: {
    title: 'Summit and home',
    body: 'You stood on Columbia Crest and walked back into the Paradise parking lot. That’s the whole climb.',
    lesson: 'About half the people who attempt Rainier reach the summit. Getting down is the part that counts.',
    good: true,
  },
  retreat: {
    title: 'Home safe',
    body: 'No summit this time, but you came home. The mountain will be there next season.',
    lesson: 'Experienced climbers turn around all the time. Turning back early is a skill, not a failure.',
    good: true,
  },
  hypothermia: {
    title: 'Hypothermia',
    body: 'Your core temperature dropped until you stopped shivering and started stumbling. Rangers carried you down.',
    lesson: 'Put on your parka at every stop, before you feel cold. Wind and wet clothes steal heat fastest.',
    good: false,
  },
  exhaustion: {
    title: 'Out of gas',
    body: 'Your legs quit. Your partner called for help, and a ranger team helped you down.',
    lesson: 'Use the rest step, eat and drink at every break, and keep your pack light. Save energy for the descent.',
    good: false,
  },
  ams: {
    title: 'Altitude sickness',
    body: 'Confusion, stumbling, and a crushing headache: HACE. You were evacuated by helicopter.',
    lesson: 'Climb slower, drink more, and descend at the first sign of confusion or lost coordination. Descent is the cure.',
    good: false,
  },
  crevasse: {
    title: 'Crevasse fall',
    body: 'You fell into a crevasse unroped. Rescue took hours.',
    lesson: 'Always rope up on glaciers, and carry a crevasse rescue kit you know how to use.',
    good: false,
  },
  fall: {
    title: 'Uncontrolled slide',
    body: 'You couldn’t stop sliding down the steep snow and were badly hurt.',
    lesson: 'Carry an ice axe, practice self-arrest until it’s automatic, and travel roped on steep glacier slopes.',
    good: false,
  },
  rockfall: {
    title: 'Hit by rockfall',
    body: 'A falling rock struck you on the head. You needed a helicopter evacuation.',
    lesson: 'Wear a helmet through Cathedral Gap and on the Cleaver, move quickly through rockfall zones, and be off them before the day warms.',
    good: false,
  },
  lost: {
    title: 'Lost in the whiteout',
    body: 'You wandered off the snowfield in the cloud and spent the night without shelter. Searchers found you the next day.',
    lesson: 'Carry a GPS with the route loaded, a map and compass, and wands. Carry an emergency bivy in case you’re stuck.',
    good: false,
  },
  avalanche: {
    title: 'Caught in an avalanche',
    body: 'The slope fractured above you and carried you down. Rescuers dug you out, badly hurt.',
    lesson: 'In spring, carry a transceiver, probe and shovel, dig a pit before committing to a loaded slope, and cross one at a time. Turning around is often the only safe call.',
    good: false,
  },
  partner: {
    title: 'Partner down',
    body: 'Your partner collapsed with HACE high on the mountain. A rescue team brought them down.',
    lesson: 'Watch your partner as closely as yourself. Loss of coordination at altitude means descend, right away.',
    good: false,
  },
};

export function computeScore(s: GameState): number {
  if (!s.ending) return 0;
  const info = ENDINGS[s.ending];
  if (!info.good) return s.summited ? 300 : 100;
  let score = s.ending === 'summit' ? 1000 : 400;
  if (s.flags.goodCall) score += 250;
  score += Math.round(s.stats.stamina + s.stats.warmth + s.stats.morale);
  if (s.flags.frostnip) score -= 100;
  if (s.flags.frostbiteHands || s.flags.frostbiteFeet) score -= 250;
  else if (s.flags.frostnipHands || s.flags.frostnipFeet) score -= 100;
  if (s.flags.snowBlind) score -= 100;
  if (s.flags.ankle) score -= 80;
  if (s.flags.pushedPastTurnaround) score -= 150;
  return Math.max(0, score);
}

/** Gear-specific tips for the debrief. */
export function gearReview(packed: string[], season: Season = 'july'): string[] {
  const tips: string[] = [];
  const has = (id: string) => packed.includes(id);
  if (!has('helmet')) tips.push('No helmet. Rockfall at Cathedral Gap and on the Cleaver is common.');
  if (!has('rope') || !has('harness')) tips.push('No rope team. Every glacier above Muir has hidden crevasses.');
  if (!has('axe')) tips.push('No ice axe. Without one, a slip on steep snow can’t be stopped.');
  if (!has('crampons_steel') && !has('crampons_alu')) tips.push('No crampons. Hard morning ice above Muir needs them.');
  if (has('crampons_alu')) tips.push('Aluminum crampons dull on the Cleaver’s rock. Steel is the Rainier standard.');
  if (has('boots_hiking')) tips.push('Hiking boots flex out of crampons, soak through in snow, and leave your toes cold. Use stiff mountaineering boots.');
  if (!has('mitts')) tips.push('No mittens. In wind above 13,000 ft, gloves alone often aren’t enough for your fingers.');
  if (has('cotton')) tips.push('Cotton soaks up sweat and stays wet. Stick to synthetics and wool.');
  if (season === 'may' && !has('avy')) tips.push('No transceiver, probe or shovel. Spring slopes slide, and without them nobody can find you.');
  if (season === 'may' && !has('snowshoes')) tips.push('No snowshoes. Spring snow below Muir is deep and soft by late morning.');
  if (season !== 'may' && has('avy')) tips.push('Avalanche gear is about 4.4 lb of extra weight on a summer Cleaver climb.');
  if (season !== 'may' && has('snowshoes')) tips.push('Snowshoes are dead weight once the trail melts out.');
  if (season === 'september' && !has('screws')) tips.push('No ice screws. Late-season glaciers are hard ice where a picket won’t hold.');
  if (!has('glasses')) tips.push('No glacier glasses. Snow blindness can set in within hours on a sunny snowfield.');
  if (!has('parka')) tips.push('No parka. Breaks and the summit get very cold.');
  if (!has('gps') && !has('map')) tips.push('No navigation. The Muir Snowfield whiteout is a classic trap.');
  if (!has('wands')) tips.push('Wands are cheap insurance for coming down the snowfield in a cloud.');
  const heavy = packed.reduce((n, id) => n + (GEAR_BY_ID[id]?.oz ?? 0), 0) / 16;
  if (heavy > 45) tips.push(`Your kit weighed about ${Math.round(heavy)} lb before the pack. Every pound costs energy.`);
  return tips.slice(0, 5);
}
