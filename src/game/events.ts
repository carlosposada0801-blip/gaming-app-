import { FORECAST_TEXT, crampons, has, roped, routeOf, summitOf } from './helpers';
import { DAY, formatClock as formatClockShort, isNight, minuteOfDay } from './route';
import { anchorMinutes, arrestOdds, ladderOutcome, prusikOutcome, zpulleyOutcome } from './skills';
import { SEASONS } from './season';
import { PARTNERS, partnerHas, partnerOf } from './partners';
import type { ArrivalContext, Choice, EventDef, GameState, Outcome, Rng, SkillId } from './types';

const ft = (s: GameState) => routeOf(s).nodes[s.node].ft;
/** The leg just walked, and what can happen on it. */
const legOf = (s: GameState, c: ArrivalContext) => routeOf(s).legs[c.leg];
const hz = (s: GameState, c: ArrivalContext) => legOf(s, c)?.hazards ?? {};
const isDC = (s: GameState) => s.route === 'dc';
const here = (s: GameState) => routeOf(s).nodes[s.node].name;

/** Rockfall roll shared by Cathedral Gap and the Cleaver. */
function rockfall(s: GameState, p: number, rng: Rng, base: Outcome): Outcome {
  // Less snow holding the rock in place late in the season, more in spring.
  p *= SEASONS[s.season].rockfall;
  // Late in the day the sun loosens rock frozen in place overnight.
  if (s.flags.pushedPastTurnaround) p += 0.2;
  if (rng() >= p) return base;
  // Sometimes it's your partner the rock finds.
  if (rng() < 0.3) {
    const name = partnerOf(s).name;
    if (partnerHas(s, 'helmet')) {
      return { ...base, text: `${base.text} A rock cracks off ${name}’s helmet. Shaken, but okay.`, delta: { ...base.delta, morale: (base.delta?.morale ?? 0) - 6 }, tone: 'bad' };
    }
    return {
      text: `A rock hits ${name} in the head. No helmet. They’re conscious but bleeding, and you start down at once.`,
      delta: { morale: -20, stamina: -8 },
      turnBack: true,
      mutate: (x) => { x.flags.partnerHurt = true; },
      tone: 'bad',
    };
  }
  if (has(s, 'helmet')) {
    return {
      ...base,
      text: `${base.text} A fist-sized rock cracks off your helmet. Shaken, but okay.`,
      delta: { ...base.delta, morale: (base.delta?.morale ?? 0) - 8, stamina: (base.delta?.stamina ?? 0) - 4 },
      tone: 'bad',
    };
  }
  return { text: 'A falling rock hits you in the head. No helmet.', ending: 'rockfall', tone: 'bad' };
}

/** A sliding fall. Self-arrest first, then the rope team. */
function slide(s: GameState, rng: Rng, arrestOdds: number, soft = false): Outcome {
  if (has(s, 'axe') && rng() < arrestOdds) {
    return {
      text: 'You roll onto the pick, drive it into the snow, and kick in your toes. Self-arrest. Your heart is pounding.',
      delta: { stamina: -8, morale: -6 },
      tone: 'good',
    };
  }
  if (roped(s) && rng() < partnerOf(s).catch) {
    return {
      text: `You can’t stop yourself, but ${partnerOf(s).name} hears the shout and drops into self-arrest. The rope comes tight.`,
      delta: { stamina: -12, morale: -12, warmth: -5 },
      tone: 'bad',
    };
  }
  if (soft && rng() < 0.5) {
    return { text: 'You slide 200 feet and stop in a soft runout. Bruised and scared.', delta: { stamina: -18, morale: -18 }, tone: 'bad' };
  }
  return { text: 'You can’t stop the slide.', ending: 'fall', tone: 'bad' };
}

/** Caught in a slide. A buried climber lives or dies by the transceiver, probe and shovel. */
function caught(s: GameState, rng: Rng): Outcome {
  if (has(s, 'avy')) {
    return rng() < 0.8
      ? {
          text: 'The slope releases and sweeps you down, burying you to the chest. Your partner switches their transceiver to search, probes, and digs you out in minutes.',
          delta: { stamina: -30, warmth: -25, morale: -30 },
          turnBack: true,
          tone: 'bad',
        }
      : { text: 'The slope releases and buries you deep.', ending: 'avalanche', tone: 'bad' };
  }
  return rng() < 0.35
    ? {
        text: 'The slope releases and tumbles you down. You come to rest with one arm out of the debris, and your partner digs you out by hand.',
        delta: { stamina: -35, warmth: -30, morale: -35 },
        turnBack: true,
        tone: 'bad',
      }
    : { text: 'The slope releases and buries you. With no transceiver, nobody can find you in time.', ending: 'avalanche', tone: 'bad' };
}

/** What you see from the top of each trip. */
const SUMMIT_TEXT: Partial<Record<string, string>> = {
  dc: 'Columbia Crest, 14,411 feet. The highest point in Washington. Mount Adams, Mount Hood, and Mount St. Helens line up to the south. You’re only halfway: most accidents happen on the way down.',
  si: 'The top of the Haystack, 4,167 feet. North Bend and the Snoqualmie Valley are straight below, Seattle’s towers far to the west, and Rainier floats over the ridges to the south. Down-climbing the Haystack is the tricky part.',
  muir: 'Camp Muir, 10,188 feet. The stone shelter, the guide hut, a row of tents, and the Cowlitz Glacier at your feet. Most day hikers turn around here. The snowfield below is where whiteouts catch people.',
  helens: 'The crater rim, about 8,300 feet. Two thousand feet below, the lava dome steams inside the crater blown open in 1980. Rainier, Adams and Hood stand around the horizon. The snow you’re on may be a cornice over nothing.',
  adams: 'The summit of Mount Adams, 12,276 feet. Rainier to the north, St. Helens and Hood to the west and south. The long snow slope you came up will be a glissade on the way down, once it softens.',
  baker: 'Grant Peak, 10,781 feet, the top of Mount Baker. The San Juan Islands and the Salish Sea glitter to the west, the North Cascades bristle to the east, and Sherman Crater steams below.',
};

const req = (cond: boolean, label: string, need: string, resolve: Choice['resolve'], skill?: SkillId): Choice => ({
  label,
  hint: cond ? undefined : `Needs ${need}`,
  disabled: !cond,
  skill,
  resolve,
});

export const EVENTS: EventDef[] = [
  // ---- forced story beats ----
  {
    id: 'ranger',
    title: 'Ranger check',
    chance: () => 0, // set as the opening event
    text: (s) =>
      `A climbing ranger at ${routeOf(s).ranger} checks your permit and reads the forecast: “${FORECAST_TEXT[s.forecast]}” Then: “Got blue bags?”`,
    choices: (s) =>
      has(s, 'bluebags')
        ? [{ label: 'Show your blue bags and hit the trail', resolve: () => ({ text: `The ranger nods. You start up the ${routeOf(s).legs[0].name}.`, delta: { morale: 3 }, tone: 'good' }) }]
        : [
            {
              label: 'Grab some at the ranger station',
              hint: '20 min',
              resolve: () => ({
                text: 'You pick up a few blue bags. Waste goes in, and you carry it out.',
                minutes: 20,
                mutate: (st) => { st.packed.push('bluebags'); },
                tone: 'info',
              }),
            },
            {
              label: 'Skip it',
              resolve: () => ({ text: 'You head up without them.', mutate: (st) => { st.flags.skippedBlueBags = true; } }),
            },
          ],
  },
  {
    id: 'summit',
    title: 'On top',
    chance: (s) => (s.dir === 'up' && s.node === summitOf(s) ? 1 : 0),
    text: (s) => SUMMIT_TEXT[s.route] ?? SUMMIT_TEXT.dc ?? '',
    choices: () => [
      {
        label: 'Take the photo, then start down',
        hint: '10 min',
        resolve: () => ({ text: 'Summit photo taken. Time to descend.', minutes: 10, delta: { morale: 20 }, turnBack: true, tone: 'good' }),
      },
    ],
  },
  {
    id: 'crater',
    title: 'The crater',
    chance: (s) => (s.dir === 'up' && s.node === routeOf(s).crater ? 1 : 0),
    text: () =>
      'You crest the crater rim. Steam vents have melted caves into the ice of the crater floor, and the summit register sits in a metal box among the rocks.',
    choices: () => [
      { label: 'Sign the summit register', hint: '10 min', resolve: () => ({ text: 'You add your name to the register.', minutes: 10, delta: { morale: 6 }, tone: 'good' }) },
      { label: 'Head straight for Columbia Crest', resolve: () => ({ text: 'You cross the crater toward the high point.' }) },
    ],
  },
  {
    id: 'partner',
    title: 'Your partner is struggling',
    repeatable: true,
    chance: (s) => (s.dir === 'up' && s.node > routeOf(s).camp && s.partnerAms > 55 && !s.flags.partnerDown ? 1 : 0),
    text: () =>
      'Your rope partner is slurring words and can’t walk heel-to-toe in a straight line. Losing coordination (ataxia) is a warning sign of HACE, swelling of the brain at altitude. The treatment is going down.',
    choices: () => [
      {
        label: 'Descend together, now',
        resolve: () => ({
          text: 'You turn around. Within a thousand feet your partner is talking normally again.',
          turnBack: true,
          delta: { morale: -5 },
          mutate: (st) => { st.flags.goodCall = true; st.partnerAms = Math.max(0, st.partnerAms - 15); },
          tone: 'good',
        }),
      },
      {
        label: 'Rest, water, and food, then decide',
        hint: '30 min',
        resolve: () => ({
          text: 'Rest helps a little. Rest doesn’t treat HACE; only descent does.',
          minutes: 30,
          mutate: (st) => { st.partnerAms = Math.max(0, st.partnerAms - 8); },
          tone: 'info',
        }),
      },
      {
        label: 'Keep climbing',
        resolve: (s, rng) =>
          rng() < 0.45
            ? { text: 'Your partner collapses in the snow.', ending: 'partner', tone: 'bad' }
            : { text: 'They insist they’re fine. They aren’t.', mutate: (st) => { st.partnerAms += 15; }, tone: 'bad' },
      },
    ],
  },

  // ---- lower mountain ----
  {
    id: 'nature_calls',
    title: 'Nature calls',
    chance: (s) => (s.flags.skippedBlueBags && s.node === routeOf(s).camp && s.dir === 'up' ? 1 : 0),
    text: (s) =>
      `Nature calls at ${here(s)}, and the snow around camp is everyone’s drinking water. Away from the few toilets, the park requires you to pack out human waste in a blue bag.`,
    choices: () => [
      { label: 'Ask another party for a spare', resolve: () => ({ text: 'Awkward, but they hand you two. Lesson learned.', minutes: 10, delta: { morale: -6 }, tone: 'info' }) },
    ],
  },
  {
    id: 'glare',
    title: 'Glare on the snowfield',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).glare && !isNight(c.start, s.season) && s.weather === 'clear' && !has(s, 'glasses') ? 0.85 : 0),
    text: () =>
      'The sun is blazing off the snow. Snow reflects most of the UV that hits it, and you have no glacier glasses on.',
    choices: (s) => [
      req(has(s, 'goggles'), 'Wear your ski goggles', 'ski goggles', () => ({ text: 'Hot and foggy, but your eyes are covered.', delta: { hydration: -3 }, tone: 'info' })),
      req(has(s, 'firstaid'), 'Make slit glasses from tape and cardboard', 'a first aid & repair kit', () => ({
        text: 'Narrow slits cut the glare. You can see well enough.', minutes: 15, delta: { morale: -2 }, tone: 'good',
      })),
      {
        label: 'Squint and keep going',
        resolve: () => ({
          text: 'By evening your eyes feel full of sand and water nonstop. Snow blindness: a sunburn on your corneas.',
          delta: { morale: -15 },
          mutate: (st) => { st.flags.snowBlind = true; },
          tone: 'bad',
        }),
      },
    ],
  },
  {
    id: 'sunburn',
    title: 'Sunburn',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).glare && !isNight(c.start, s.season) && s.weather === 'clear' && !has(s, 'sun') ? 0.7 : 0),
    text: () => 'No sunscreen. The light bouncing off the snow burns under your chin, inside your nostrils, and on your lips.',
    choices: () => [
      { label: 'Pull up your hood and keep going', resolve: () => ({ text: 'Your face is raw and blistering by Camp Muir.', delta: { morale: -8, hydration: -5 }, mutate: (st) => { st.flags.sunburn = true; }, tone: 'bad' }) },
    ],
  },
  {
    id: 'whiteout_up',
    title: 'Whiteout on the snowfield',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).whiteout ? (s.weather === 'whiteout' ? 1 : s.forecast === 'stable' ? 0.1 : 0.25) : 0),
    text: (s) =>
      isDC(s)
        ? 'Halfway up the Muir Snowfield a cloud swallows you. Visibility drops to thirty feet and every direction is white. Climbers have wandered off this snowfield onto the Nisqually and Cowlitz glaciers.'
        : 'Partway up, a cloud swallows you. Visibility drops to thirty feet and every direction is white. A few degrees off course leads onto crevasses or over cliffs.',
    choices: (s) => [
      req(has(s, 'gps'), 'Follow the preloaded GPS track', 'a GPS', (st) => ({ text: `You follow the line on the screen straight to ${here(st)}.`, minutes: 15, tone: 'good' })),
      req(has(s, 'map'), 'Navigate by map and compass', 'a map & compass', (st) => ({ text: `Slow, careful bearings, checked against your altimeter. You hit ${here(st)}.`, minutes: 40 - 5 * st.skills.nav, delta: { stamina: -4 }, tone: 'good' })),
      {
        label: 'Follow old boot tracks',
        resolve: (_s, rng) =>
          rng() < 0.5 - 0.06 * _s.skills.nav
            ? { text: 'The tracks fade out. You’d drifted toward the cliffs at the edge of the snow and had to backtrack for two hours.', minutes: 120, delta: { warmth: -15, stamina: -15, morale: -15 }, tone: 'bad' }
            : { text: `The tracks hold, and you reach ${here(_s)}.`, minutes: 20, tone: 'info' },
      },
      { label: 'Wait for it to lift', hint: '1 h', resolve: () => ({ text: 'An hour later the cloud thins and you can see where you are.', minutes: 60, delta: { morale: -5 }, tone: 'info' }) },
    ],
  },
  {
    id: 'whiteout_down',
    title: 'Whiteout on the way down',
    chance: (s, c) => (c.dir === 'down' && hz(s, c).whiteout ? (s.weather === 'whiteout' || s.weather === 'storm' ? 1 : s.forecast === 'stable' ? 0.12 : 0.3) : 0),
    text: (s) =>
      isDC(s)
        ? 'Leaving Camp Muir, the cloud comes down on the snowfield. Descending parties drift right onto the Nisqually Glacier or left toward the Cowlitz cliffs. This is where most Rainier navigation accidents happen.'
        : 'On the way down, the cloud comes down on you. Every direction looks the same, and the fall line pulls you off route. Descents in whiteouts are where most Rainier navigation accidents happen.',
    choices: (s) => [
      req(!!s.flags.wandsPlaced, 'Follow your wands', 'wands placed on the way up', () => ({ text: 'Wand to wand, a rope length at a time, all the way down.', minutes: 10, tone: 'good' })),
      req(has(s, 'gps'), 'Follow the GPS track', 'a GPS', () => ({ text: 'You stay right on the track.', minutes: 15, tone: 'good' })),
      req(has(s, 'map'), 'Hold a compass bearing', 'a map & compass', (st) => ({ text: `A careful bearing toward ${here(st)} brings you out of the cloud on route.`, minutes: 30, delta: { stamina: -3 }, tone: 'good' })),
      {
        label: 'Head downhill and hope',
        resolve: (st, rng) => {
          const r = rng();
          if (r < 0.35 - 0.04 * st.skills.nav) {
            return has(st, 'bivy')
              ? { text: 'You end up lost on a glacier as night falls. You crawl into your emergency bivy and walk out at dawn.', minutes: 600, delta: { warmth: -30, morale: -25, stamina: -10 }, tone: 'bad' }
              : { text: 'You’re lost on the glacier as night falls, with no shelter.', ending: 'lost', tone: 'bad' };
          }
          if (r < 0.65) return { text: 'You drift off route and lose an hour finding the trail.', minutes: 90, delta: { warmth: -10, morale: -10 }, tone: 'bad' };
          return { text: `Lucky. You stumble out of the cloud near ${here(st)}.`, minutes: 10, tone: 'info' };
        },
      },
    ],
  },
  {
    id: 'glissade',
    title: 'Glissade chutes',
    chance: (s, c) => (c.dir === 'down' && hz(s, c).glissade && s.weather !== 'whiteout' ? SEASONS[s.season].glissade : 0),
    text: (s) => `Glissade chutes run down the ${isDC(s) ? 'Muir Snowfield' : 'snow below camp'}. Sliding on your butt is fast and fun, and it saves your knees.`,
    choices: (s) => [
      req(has(s, 'axe'), 'Crampons off, glissade with your axe ready', 'an ice axe', () => ({ text: 'Whoosh. You drop a thousand feet in minutes.', minutes: -40, delta: { morale: 10 }, tone: 'good' })),
      {
        label: 'Glissade with crampons on',
        resolve: (_s, rng) =>
          rng() < 0.6
            ? { text: 'A crampon point catches and wrenches your ankle. It’s one of the most common injuries on the snowfield.', minutes: 40, delta: { stamina: -15, morale: -15 }, mutate: (st) => { st.flags.ankle = true; }, tone: 'bad' }
            : { text: 'You get away with it this time.', minutes: -40, delta: { morale: 5 }, tone: 'info' },
      },
      { label: 'Walk down', resolve: () => ({ text: 'Slow and steady down the snowfield.' }) },
    ],
  },

  // ---- upper mountain ----
  {
    id: 'cleaver',
    title: 'Disappointment Cleaver',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).cleaver ? 1 : 0),
    text: () =>
      'The Cleaver is a rib of loose volcanic rock. The route switchbacks up gravel over rock, "kitty litter" climbers call it, with crampons screeching on stone.',
    choices: (s) => [
      {
        label: 'Keep crampons on and step carefully',
        resolve: (st, rng) => {
          let base: Outcome;
          if (has(st, 'crampons_steel')) base = { text: 'Steel points grip the grit fine.', delta: { stamina: -4 }, tone: 'info' };
          else if (has(st, 'crampons_alu')) base = { text: 'The rock is chewing up your aluminum points.', delta: { stamina: -6 }, mutate: (x) => { x.flags.cramponsDull = true; }, tone: 'bad' };
          else base = { text: 'No crampons, so it’s just a scramble.', delta: { stamina: -4 } };
          return rockfall(st, 0.15, rng, base);
        },
      },
      {
        label: 'Take crampons off for the rock',
        hint: '25 min',
        disabled: !crampons(s),
        resolve: (st, rng) => rockfall(st, 0.18, rng, { text: 'Off for the rock, back on at the top. Slower, but sure-footed.', minutes: 25, delta: { stamina: -3 }, tone: 'info' }),
      },
    ],
  },
  {
    id: 'rockfall_gap',
    title: 'Rockfall',
    chance: (s, c) => {
      const rf = hz(s, c).rockfall;
      return rf ? Math.min(0.95, SEASONS[s.season].rockfall * rf[c.dir === 'up' ? 0 : 1]) : 0;
    },
    text: (s) =>
      `“ROCK!” A rock the size of a microwave comes bouncing down ${isDC(s) ? (s.node <= 3 && s.dir === 'up' ? 'Cathedral Gap' : 'the gully') : 'the slope above'} toward your rope team.`,
    choices: () => [
      { label: 'Keep moving fast through the gully', resolve: (s, rng) => rockfall(s, 0.3, rng, { text: 'You hustle through. It misses.', delta: { stamina: -6, morale: -4 }, tone: 'info' }) },
      { label: 'Wait for a gap, then cross one at a time', hint: '15 min', resolve: (s, rng) => rockfall(s, 0.12, rng, { text: 'You wait it out and cross when it’s quiet.', minutes: 15, tone: 'good' }) },
    ],
  },
  {
    id: 'crevasse',
    title: 'Crevasse fall',
    chance: (s, c) =>
      hz(s, c).crevasse
        ? (0.12 + (c.dir === 'down' && minuteOfDay(s.clock) > 660 ? 0.15 : 0) + (s.flags.pushedPastTurnaround ? 0.2 : 0))
          * SEASONS[s.season].crevasse
          // Leaving the boot track means stepping on untested snow bridges.
          + Math.min(0.35, (c.offTrack ?? 0) / 400)
        : 0,
    text: (s) =>
      roped(s)
        ? 'A snow bridge gives way under you. You drop into blue darkness, and then the rope comes tight. Your partner is in self-arrest above, holding your weight.'
        : 'A snow bridge gives way under you, and you aren’t roped in.',
    choices: (s) =>
      roped(s)
        ? [
            req(has(s, 'rescue_kit'), 'Climb out on your prusiks', 'a crevasse rescue kit', (_st, _rng, perf) => (perf === undefined ? {
              text: 'Foot loop, waist loop, slide, stand. Twenty minutes of work and you flop over the lip.', minutes: 40, delta: { stamina: -15, warmth: -8 }, tone: 'good',
            } : prusikOutcome(perf)), 'prusik'),
            req(partnerHas(s, 'rescue_kit'), `${partnerOf(s).name} builds a Z-pulley and hauls`, 'a rescue kit on your partner', (st, _rng, perf) => (perf === undefined ? {
              text: anchorMinutes(st) <= 50
                ? `${st.season === 'september' ? 'Two ice screws in the hard ice' : 'A buried picket'} for the anchor, a 3:1 haul, and you’re out.`
                : st.season === 'september' && has(st, 'picket')
                  ? 'The picket won’t go into the hard ice, so your partner chops a slot and buries it sideways. Slow, but it holds.'
                  : 'With no picket, your partner builds an anchor from an ice axe. Slow, but it holds.',
              minutes: anchorMinutes(st),
              delta: { stamina: -6, warmth: -18 },
              tone: 'good',
            } : zpulleyOutcome(st, perf)), 'zpulley'),
            {
              label: 'Yell for the next rope team',
              resolve: () => ({ text: 'You hang in the cold for an hour and a half until another team arrives with gear to haul you out.', minutes: 100, delta: { warmth: -30, morale: -15 }, tone: 'bad' }),
            },
          ]
        : [
            {
              label: has(s, 'axe') ? 'Swing your ice axe into the lip' : 'Grab for the edge',
              resolve: (st, rng) =>
                rng() < (has(st, 'axe') ? 0.45 : 0.15)
                  ? { text: 'Somehow it holds, and you claw yourself out.', delta: { stamina: -20, morale: -20 }, tone: 'bad' }
                  : { text: 'You fall into the crevasse.', ending: 'crevasse', tone: 'bad' },
            },
          ],
  },
  {
    id: 'ladder',
    title: 'Ladder crossing',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).ladder ? SEASONS[s.season].ladder : 0),
    text: () => 'Late-season crevasses force the route across aluminum ladders lashed together over a gap, with hand lines fixed on both sides.',
    choices: (s) => [
      req(has(s, 'harness'), 'Clip into the hand line and walk the rungs', 'a harness', (_st, _rng, perf) => (perf === undefined
        ? { text: 'Front points between the rungs, eyes on the far side. Done.', minutes: 10, delta: { morale: 5 }, tone: 'good' }
        : ladderOutcome(perf)), 'ladder'),
      { label: 'Crawl across on hands and knees', resolve: () => ({ text: 'Ugly but safe.', minutes: 20, delta: { stamina: -5, morale: -3 }, tone: 'info' }) },
    ],
  },
  {
    id: 'slip',
    title: 'Slip',
    repeatable: true,
    chance: (s, c) => {
      if (!hz(s, c).slip || s.usedEvents.filter((e) => e === 'slip').length >= 2) return 0;
      let p = 0.15 + (c.dir === 'down' ? 0.1 : 0);
      // Afternoon slush balls up under crampons on the way down after a late summit.
      if (s.flags.pushedPastTurnaround && c.dir === 'down') p += 0.15;
      if (s.flags.cramponsDull) p += 0.2;
      if (!crampons(s)) p += 0.3;
      if (!has(s, 'gaiters')) p += 0.08;
      if (SEASONS[s.season].hardIce) p += 0.08;
      return p;
    },
    text: (s) =>
      routeOf(s).legs[Math.max(0, s.dir === 'up' ? s.node - 1 : s.node)]?.terrain === 'ice'
        ? 'Your front points shear out of the brittle ice and you’re off, sliding down the chute.'
        : has(s, 'gaiters')
          ? 'Your boot skids on hard, wind-polished snow and you go down, sliding feet-first down the slope.'
          : 'A crampon point snags your loose pant leg and you pitch forward, sliding headfirst.',
    choices: (s) => [
      req(has(s, 'axe'), 'Self-arrest with your ice axe', 'an ice axe',
        (st, rng, perf) => slide(st, rng, perf === undefined
          ? (st.flags.cramponsDull ? 0.75 : 0.88) - (SEASONS[st.season].hardIce ? 0.1 : 0) + 0.02 * st.skills.arrest - (st.flags.noArrest ? 0.35 : 0)
            - (routeOf(st).legs[Math.max(0, st.dir === 'up' ? st.node - 1 : st.node)]?.terrain === 'ice' ? 0.2 : 0)
          : arrestOdds(st, perf)), 'arrest'),
      { label: 'Dig in your hands and heels', resolve: (st, rng) => slide({ ...st, packed: st.packed.filter((g) => g !== 'axe') }, rng, 0) },
    ],
  },
  {
    id: 'cornice',
    title: 'Cornice',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).cornice ? 1 : 0),
    text: (s) =>
      `The snow runs flat to the rim, then simply ends. ${s.season === 'may' ? 'In spring the wind builds cornices out over the crater, and from up here you can’t see where the rock stops and the overhang begins.' : 'Most of the spring cornice has melted, but the rim edge is still loose and undercut.'}`,
    choices: () => [
      { label: 'Stay well back and look from a safe spot', resolve: () => ({ text: 'You stop well short of the edge. The view is just as good from here.', delta: { morale: 6 }, tone: 'good' }) },
      {
        label: 'Walk out to the edge for the view into the crater',
        resolve: (st, rng) => (rng() < (st.season === 'may' ? 0.12 : 0.03)
          ? { text: 'With a soft crack the snow under you breaks away into the crater.', ending: 'fall', tone: 'bad' }
          : { text: 'Your heart hammers as you peer down at the steaming dome. Then you back away, carefully.', delta: { morale: 8 }, tone: 'info' }),
      },
    ],
  },
  {
    id: 'avalanche',
    title: 'Whumpf',
    chance: (s, c) => {
      const base = SEASONS[s.season].avalanche;
      const mult = hz(s, c).avalanche;
      if (!base || !mult || c.dir !== 'up') return 0;
      let p = base * mult;
      // New snow and wind load slopes; spring sun weakens them by late morning.
      if (s.weather === 'storm' || s.weather === 'coldsnap' || s.forecast === 'incoming') p *= 1.6;
      if (minuteOfDay(s.clock) > 660 && !isNight(s.clock, s.season)) p *= 1.5;
      return Math.min(0.5, p);
    },
    text: () =>
      'The slope settles under your boots with a deep “whumpf,” and a crack shoots out ahead of you. A slab of new snow is sitting on a weak layer, and the route crosses it above a long drop.',
    choices: (s) => [
      req(has(s, 'avy'), 'Dig a pit and test the snow', 'a shovel (avalanche kit)', (st, rng) => (rng() < 0.55
        ? {
            text: 'The column breaks clean under light taps: the slab is ready to go. You turn around.',
            minutes: 40,
            delta: { morale: -6, warmth: -6 },
            turnBack: true,
            mutate: (x) => { x.flags.goodCall = true; },
            tone: 'good',
          }
        : rng() < 0.06
          ? caught(st, rng)
          : { text: 'The weak layer takes hard hits to break. You cross one at a time, well spaced, and it holds.', minutes: 40, delta: { warmth: -6 }, tone: 'good' })),
      {
        label: 'Cross one at a time, fast',
        resolve: (st, rng) => (rng() < 0.22 ? caught(st, rng) : { text: 'One at a time, holding your breath. It holds.', minutes: 10, delta: { morale: -4 }, tone: 'info' }),
      },
      {
        label: 'Turn back',
        resolve: () => ({ text: 'You back off the slope the way you came. The mountain isn’t going anywhere.', turnBack: true, delta: { morale: -6 }, mutate: (x) => { x.flags.goodCall = true; }, tone: 'good' }),
      },
    ],
  },
  {
    id: 'ice_up',
    title: 'Steep ice',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).ice ? 1 : 0),
    text: (s) =>
      `${(routeOf(s).legs[s.node - 1]?.name ?? 'the ice').replace(/^(the )?/i, 'The ')} is hard, grey-blue ice at forty-some degrees. Kicking steps won’t work here. It takes front points and picks, and a fall won’t stop on its own.`,
    choices: (s) => [
      req(has(s, 'tool') && (has(s, 'screws') || partnerHas(s, 'screws')), 'Two tools, front points, and screws for protection', 'a second ice tool and ice screws',
        () => ({ text: 'Pitch by pitch, a screw every rope length. Slow, cold, and solid.', minutes: 45, delta: { stamina: -10, warmth: -6 }, tone: 'good' })),
      req(has(s, 'tool'), 'Two tools and front points, no protection', 'a second ice tool', (_st, rng) => (rng() < 0.1
        ? { text: 'Twenty feet below the top, a front point shears out.', minutes: 20, delta: { stamina: -12 }, next: 'slip', tone: 'bad' }
        : { text: 'Swing, swing, kick, kick. Calves burning, you top out.', minutes: 25, delta: { stamina: -12 }, tone: 'good' })),
      {
        label: 'One axe and kicked steps',
        resolve: (_st, rng) => (rng() < 0.3
          ? { text: 'Your steps are too shallow in the hard ice, and one breaks.', minutes: 25, delta: { stamina: -15 }, next: 'slip', tone: 'bad' }
          : { text: 'Chop, kick, balance. It works, barely, and your legs are shaking at the top.', minutes: 35, delta: { stamina: -15, morale: -6 }, tone: 'info' }),
      },
      {
        label: 'Turn back',
        resolve: () => ({ text: 'Not today. You back off the ice.', turnBack: true, delta: { morale: -8 }, tone: 'info' }),
      },
    ],
  },
  {
    id: 'ice_down',
    title: 'Down the ice',
    chance: (s, c) => (c.dir === 'down' && hz(s, c).ice ? 1 : 0),
    text: () => 'Down-climbing steep ice is harder than going up: you can’t see your feet. Most parties rappel or lower off ice screws or V-threads.',
    choices: (s) => [
      req(has(s, 'screws') || partnerHas(s, 'screws'), 'Rappel off V-threads and screws', 'ice screws', () => ({ text: 'Thread, clip, rappel, repeat. Slow, but nobody falls.', minutes: 40, delta: { warmth: -8 }, tone: 'good' })),
      req(has(s, 'tool'), 'Down-climb facing in with two tools', 'a second ice tool', (_st, rng) => (rng() < 0.15
        ? { text: 'A pick pops out of rotten ice.', minutes: 15, delta: { stamina: -10 }, next: 'slip', tone: 'bad' }
        : { text: 'Facing in, one placement at a time. Your calves are on fire.', minutes: 30, delta: { stamina: -10 }, tone: 'good' })),
      {
        label: 'Face out and plunge-step',
        resolve: (_st, rng) => (rng() < 0.4
          ? { text: 'Your heel skates on the hard ice.', minutes: 10, next: 'slip', tone: 'bad' }
          : { text: 'Somehow, you stay on your feet.', minutes: 20, delta: { morale: -6 }, tone: 'info' }),
      },
    ],
  },
  {
    id: 'icefall',
    title: 'Icefall',
    repeatable: true,
    chance: (s, c) => {
      if (s.usedEvents.filter((e) => e === 'icefall').length >= 1) return 0;
      const p = hz(s, c).icefall ?? 0;
      // Seracs let go more once the sun is on them.
      return p * (minuteOfDay(s.clock) > 600 && !isNight(s.clock, s.season) ? 2 : 1);
    },
    text: () => 'A crack like a rifle shot from the ice cliff above. A serac breaks off and blocks of ice come tumbling down the slope.',
    choices: () => [
      {
        label: 'Run for the side of the slope',
        resolve: (st, rng) => (rng() < 0.07
          ? { text: 'A block clips you as you run.', ending: 'icefall', tone: 'bad' }
          : { text: 'You sprint, gasping, as the ice roars past behind you.', delta: { stamina: -10, morale: -10 }, tone: 'info' }),
      },
      {
        label: 'Get behind the nearest boulder',
        resolve: (st, rng) => (rng() < (has(st, 'helmet') ? 0.05 : 0.12)
          ? { text: 'The blocks bounce over the rock, and one finds you.', ending: 'icefall', tone: 'bad' }
          : { text: 'Ice explodes against the boulder and sprays over you. You’re okay.', delta: { morale: -12 }, tone: 'info' }),
      },
    ],
  },
  {
    id: 'lenticular',
    title: 'Lenticular cloud',
    chance: (s, c) => (c.dir === 'up' && hz(s, c).lenticular && s.forecast !== 'stable' ? 0.45 : 0),
    text: () =>
      'A smooth, lens-shaped cloud is forming over the summit. Lenticular clouds mean strong winds aloft, and on Rainier they often come before a storm.',
    choices: () => [
      {
        label: 'Turn back now',
        resolve: () => ({ text: 'You head down while the weather is still good.', turnBack: true, delta: { morale: -8 }, mutate: (st) => { st.flags.goodCall = true; }, tone: 'good' }),
      },
      {
        label: 'Keep climbing and watch it',
        resolve: () => ({ text: 'The cap thickens. The wind picks up within the hour.', mutate: (st) => { st.forecast = 'incoming'; if (st.weather === 'clear') st.weather = 'windy'; }, tone: 'bad' }),
      },
    ],
  },
  {
    id: 'wind',
    title: 'Wind on the upper mountain',
    chance: (s) => (ft(s) >= 12800 && ['windy', 'coldsnap', 'storm'].includes(s.weather) ? 0.7 : 0),
    text: () => 'Gusts over 40 mph knock you to your knees. With the wind, it feels far below zero, and exposed skin can freeze in minutes.',
    choices: (s) => [
      {
        label: 'Put on everything: parka, mittens, goggles',
        resolve: (st) => {
          const face = has(st, 'goggles') || has(st, 'balaclava');
          const missing = [
            !has(st, 'parka') && 'parka',
            !has(st, 'mitts') && 'mittens',
            !face && 'face protection',
          ].filter(Boolean) as string[];
          const bundle = (x: GameState) => { x.layer = 3; x.hands = 2; };
          if (!missing.length) return { text: 'Fully bundled, you’re warm enough to keep moving.', minutes: 5, mutate: bundle, tone: 'good' };
          return {
            text: `No ${missing.join(' or ')}. ${!face ? 'Your cheeks go white and waxy: frostnip. ' : ''}${!has(st, 'mitts') ? 'Your fingers ache, then go quiet.' : 'The wind cuts through.'}`,
            minutes: 5,
            delta: { warmth: -15, morale: -10 },
            mutate: (x) => {
              bundle(x);
              if (!face) x.flags.frostnip = true;
              if (!has(x, 'mitts')) x.handTemp -= 30;
            },
            tone: 'bad',
          };
        },
      },
      {
        label: 'Hunker down behind your packs',
        hint: '30 min',
        resolve: (_st, rng) => ({
          text: 'You wait out the worst gusts.',
          minutes: 30,
          mutate: (x) => { if (rng() < 0.4) x.weather = x.weather === 'storm' ? 'windy' : 'clear'; },
          tone: 'info',
        }),
      },
      ...(s.dir === 'up'
        ? [{
            label: 'Turn back',
            resolve: (): Outcome => ({ text: 'You turn around and get out of the wind.', turnBack: true, mutate: (x) => { x.flags.goodCall = true; }, tone: 'good' }),
          }]
        : []),
    ],
  },
  {
    id: 'cold_hands',
    title: 'Numb fingers',
    chance: (s) => (s.handTemp < 40 && !s.flags.frostbiteHands ? 0.9 : 0),
    text: (s) =>
      `Your fingers are numb and white around the shaft of your ice axe.${ft(s) >= 10000 && !has(s, 'gloves') && !has(s, 'mitts') ? ' Liner gloves aren’t enough up here.' : ''} Numb hands drop things and can’t tie knots.`,
    choices: (s) => [
      req(has(s, 'mitts'), 'Pull on your mittens', 'mittens', () => ({
        text: 'Mittens on. Slowly, painfully, the feeling comes back.',
        minutes: 3,
        mutate: (x) => { x.hands = 2; x.handTemp += 15; },
        tone: 'good',
      })),
      {
        label: 'Stop and rewarm them in your armpits',
        hint: '15 min',
        resolve: () => ({ text: 'Painful pins and needles as they rewarm.', minutes: 15, delta: { morale: -4 }, mutate: (x) => { x.handTemp += 35; }, tone: 'info' }),
      },
      {
        label: 'Swing your arms and keep going',
        resolve: () => ({ text: 'Windmilling your arms forces some blood back into your fingers.', delta: { stamina: -3 }, mutate: (x) => { x.handTemp += 12; }, tone: 'info' }),
      },
    ],
  },
  {
    id: 'headlamp',
    title: 'Light out',
    chance: (s, c) => (isNight(c.start, s.season) && has(s, 'headlamp') ? 0.12 : 0),
    text: () => 'Your headlamp dims to orange and dies. Cold drains batteries fast.',
    choices: () => [{ label: 'Swap in the spare batteries', resolve: () => ({ text: 'Fresh batteries, bright light.', minutes: 5, tone: 'info' }) }],
  },
  {
    id: 'guide_call',
    title: 'Your guide calls it',
    chance: (s) => (s.partner === 'guide' && s.dir === 'up' && s.node > 0 && s.node < summitOf(s)
      && (s.clock > s.turnaround || s.weather === 'storm' || s.weather === 'whiteout' || s.stats.ams > 60 || s.partnerAms > 60) ? 1 : 0),
    text: (s) => `Your guide stops the team. “${s.clock > s.turnaround ? 'It’s past our turnaround time.' : s.stats.ams > 60 ? 'You’re showing signs of altitude sickness.' : 'This weather isn’t getting better.'} We’re going down.” On a guided climb, that’s final.`,
    choices: () => [{ label: 'Start down', resolve: () => ({ text: 'You turn around with your guide.', turnBack: true, mutate: (x) => { x.flags.goodCall = true; }, tone: 'good' }) }],
  },
  {
    id: 'veteran_call',
    title: 'Ash wants to turn around',
    chance: (s) => (s.partner === 'veteran' && s.dir === 'up' && s.node > routeOf(s).camp && s.node < summitOf(s)
      && (s.clock > s.turnaround || s.weather === 'storm' || s.weather === 'whiteout') ? 1 : 0),
    text: (s) => `Ash stops and turns to you. “${s.clock > s.turnaround ? 'We’re past our turnaround.' : 'This weather is the real thing.'} This is where we go down. The mountain will be here next year.”`,
    choices: () => [
      { label: 'Agree, and turn around', resolve: () => ({ text: 'Ash nods and starts down. “Good call. Those are the hard ones.”', turnBack: true, delta: { morale: -3 }, mutate: (x) => { x.flags.goodCall = true; }, tone: 'good' }) },
      { label: 'Argue for one more hour', resolve: () => ({ text: 'Ash shakes their head and starts coiling the rope. You’re going down either way, and now you’re both annoyed.', turnBack: true, delta: { morale: -12 }, tone: 'bad' }) },
    ],
  },
  {
    id: 'friend_push',
    title: 'Summit fever',
    chance: (s) => (s.partner === 'friend' && s.dir === 'up' && !s.summited && s.node > routeOf(s).camp && s.node < summitOf(s)
      && s.clock > s.turnaround - 30 ? 1 : 0),
    text: (s) => `Jordan points up the slope. “Come on, it’s right there! Forget the turnaround. When are we ever going to be up here again?” It’s ${formatClockShort(s.clock)}.`,
    choices: () => [
      { label: 'Hold the line: we turn around at turnaround', resolve: () => ({ text: 'Jordan groans, then laughs. “Fine. You’re right. Next year.”', turnBack: true, delta: { morale: -6 }, mutate: (x) => { x.flags.goodCall = true; }, tone: 'good' }) },
      { label: 'Keep going together', resolve: () => ({ text: 'You keep climbing. The snow is getting soft.', delta: { morale: 6 }, tone: 'info' }) },
    ],
  },
  {
    id: 'nervous_freeze',
    title: 'Riley freezes',
    chance: (s, c) => (s.partner === 'firstTimer' && c.dir === 'up' && s.node > routeOf(s).camp
      && (hz(s, c).slip || hz(s, c).ice || hz(s, c).rockfall) ? 0.35 : 0),
    text: () => 'Halfway across an exposed traverse, Riley stops and won’t move. “I can’t. I can’t look down.” Their breathing is fast and shallow.',
    choices: () => [
      { label: 'Talk them through it, one step at a time', hint: '20 min', resolve: () => ({ text: '“Look at my boots. Step where I step.” Slowly, Riley gets moving again.', minutes: 20, delta: { morale: -2, warmth: -4 }, tone: 'good' }) },
      { label: 'Short-rope them across', resolve: () => ({ text: 'You shorten the rope and coach them across, taking most of the strain.', minutes: 10, delta: { stamina: -10 }, tone: 'info' }) },
      { label: 'Turn back together', resolve: () => ({ text: 'Riley is quiet on the way down, then: “Thanks. I want to try again.”', turnBack: true, delta: { morale: -4 }, mutate: (x) => { x.flags.goodCall = true; }, tone: 'good' }) },
    ],
  },
  {
    id: 'sunrise',
    title: 'Sunrise',
    chance: (s) => {
      const m = minuteOfDay(s.clock);
      const dawn = SEASONS[s.season].dawn;
      return s.dir === 'up' && s.clock >= DAY && m >= dawn && m <= dawn + 150 && (s.weather === 'clear' || s.weather === 'windy') ? 1 : 0;
    },
    text: () =>
      'The sun comes up over the Cascades. Mount Adams and Mount Hood catch the first light, and Rainier’s shadow stretches west across the clouds.',
    choices: () => [{ label: 'Keep climbing', resolve: () => ({ text: 'Warm light on your face. Your energy comes back.', delta: { morale: 15, warmth: 5 }, tone: 'good' }) }],
  },
  {
    id: 'balling',
    title: 'Balling up',
    chance: (s, c) => (c.dir === 'down' && hz(s, c).balling && minuteOfDay(s.clock) > 600 && s.weather === 'clear' && crampons(s) ? 0.45 : 0),
    text: () => 'The afternoon sun has turned the snow to mush. It balls up under your crampons into slick platforms.',
    choices: (s) => [
      req(has(s, 'axe'), 'Knock it off with your axe every few steps', 'an ice axe', () => ({ text: 'Tap, tap, step. Tedious, but your points keep biting.', minutes: 15, delta: { stamina: -4 }, tone: 'good' })),
      {
        label: 'Ignore it and keep walking',
        resolve: (st, rng) => (rng() < 0.45 ? slide(st, rng, 0.8, true) : { text: 'You get lucky and the snow firms up.', tone: 'info' }),
      },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
