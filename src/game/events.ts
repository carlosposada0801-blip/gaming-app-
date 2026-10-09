import { FORECAST_TEXT, crampons, has, roped } from './helpers';
import { DAY, MUIR, NODES, SUMMIT, isNight, minuteOfDay } from './route';
import type { Choice, EventDef, GameState, Outcome, Rng } from './types';

const ft = (s: GameState) => NODES[s.node].ft;

/** Rockfall roll shared by Cathedral Gap and the Cleaver. */
function rockfall(s: GameState, p: number, rng: Rng, base: Outcome): Outcome {
  if (s.flags.pushedPastTurnaround) p += 0.1;
  if (rng() >= p) return base;
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
  if (roped(s) && rng() < 0.8) {
    return {
      text: 'You can’t stop yourself, but your partner hears the shout and drops into self-arrest. The rope comes tight.',
      delta: { stamina: -12, morale: -12, warmth: -5 },
      tone: 'bad',
    };
  }
  if (soft && rng() < 0.5) {
    return { text: 'You slide 200 feet and stop in a soft runout. Bruised and scared.', delta: { stamina: -18, morale: -18 }, tone: 'bad' };
  }
  return { text: 'You can’t stop the slide.', ending: 'fall', tone: 'bad' };
}

const req = (cond: boolean, label: string, need: string, resolve: Choice['resolve']): Choice => ({
  label,
  hint: cond ? undefined : `Needs ${need}`,
  disabled: !cond,
  resolve,
});

export const EVENTS: EventDef[] = [
  // ---- forced story beats ----
  {
    id: 'ranger',
    title: 'Ranger check',
    chance: () => 0, // set as the opening event
    text: (s) =>
      `A climbing ranger at the Paradise Climbing Information Center checks your permit and reads the forecast: “${FORECAST_TEXT[s.forecast]}” Then: “Got blue bags?”`,
    choices: (s) =>
      has(s, 'bluebags')
        ? [{ label: 'Show your blue bags and hit the trail', resolve: () => ({ text: 'The ranger nods. You start up the Skyline Trail.', delta: { morale: 3 }, tone: 'good' }) }]
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
    title: 'Columbia Crest',
    chance: (s) => (s.dir === 'up' && s.node === SUMMIT ? 1 : 0),
    text: () =>
      'Columbia Crest, 14,411 feet. The highest point in Washington. Mount Adams, Mount Hood, and Mount St. Helens line up to the south. You’re only halfway: most accidents happen on the way down.',
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
    chance: (s) => (s.dir === 'up' && s.node === 6 ? 1 : 0),
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
    chance: (s) => (s.dir === 'up' && s.node >= 3 && s.partnerAms > 55 && !s.flags.partnerDown ? 1 : 0),
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
    chance: (s) => (s.flags.skippedBlueBags && s.node === MUIR && s.dir === 'up' ? 1 : 0),
    text: () =>
      'Nature calls at Camp Muir, and the snow around camp is everyone’s drinking water. Above the toilets, the park requires you to pack out human waste in a blue bag.',
    choices: () => [
      { label: 'Ask another party for a spare', resolve: () => ({ text: 'Awkward, but they hand you two. Lesson learned.', minutes: 10, delta: { morale: -6 }, tone: 'info' }) },
    ],
  },
  {
    id: 'glare',
    title: 'Glare on the snowfield',
    chance: (s, c) => (c.dir === 'up' && c.leg <= 1 && !isNight(c.start) && s.weather === 'clear' && !has(s, 'glasses') ? 0.85 : 0),
    text: () =>
      'The sun is blazing off the Muir Snowfield. Snow reflects most of the UV that hits it, and you have no glacier glasses on.',
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
    chance: (s, c) => (c.dir === 'up' && c.leg <= 1 && !isNight(c.start) && s.weather === 'clear' && !has(s, 'sun') ? 0.7 : 0),
    text: () => 'No sunscreen. The light bouncing off the snow burns under your chin, inside your nostrils, and on your lips.',
    choices: () => [
      { label: 'Pull up your hood and keep going', resolve: () => ({ text: 'Your face is raw and blistering by Camp Muir.', delta: { morale: -8, hydration: -5 }, mutate: (st) => { st.flags.sunburn = true; }, tone: 'bad' }) },
    ],
  },
  {
    id: 'whiteout_up',
    title: 'Whiteout on the snowfield',
    chance: (s, c) => (c.dir === 'up' && c.leg === 1 ? (s.weather === 'whiteout' ? 1 : s.forecast === 'stable' ? 0.1 : 0.25) : 0),
    text: () =>
      'Halfway up the Muir Snowfield a cloud swallows you. Visibility drops to thirty feet and every direction is white. Climbers have wandered off this snowfield onto the Nisqually and Cowlitz glaciers.',
    choices: (s) => [
      req(has(s, 'gps'), 'Follow the preloaded GPS track', 'a GPS', () => ({ text: 'You follow the line on the screen straight to Camp Muir.', minutes: 15, tone: 'good' })),
      req(has(s, 'map'), 'Navigate by map and compass', 'a map & compass', () => ({ text: 'Slow, careful bearings, checked against your altimeter. You hit Muir.', minutes: 40, delta: { stamina: -4 }, tone: 'good' })),
      {
        label: 'Follow old boot tracks',
        resolve: (_s, rng) =>
          rng() < 0.5
            ? { text: 'The tracks fade out. You’d drifted east toward the Cowlitz Glacier cliffs and had to backtrack for two hours.', minutes: 120, delta: { warmth: -15, stamina: -15, morale: -15 }, tone: 'bad' }
            : { text: 'The tracks hold, and you reach Muir.', minutes: 20, tone: 'info' },
      },
      { label: 'Wait for it to lift', hint: '1 h', resolve: () => ({ text: 'An hour later the cloud thins and you can see the huts.', minutes: 60, delta: { morale: -5 }, tone: 'info' }) },
    ],
  },
  {
    id: 'whiteout_down',
    title: 'Whiteout on the way down',
    chance: (s, c) => (c.dir === 'down' && c.leg === 1 ? (s.weather === 'whiteout' || s.weather === 'storm' ? 1 : s.forecast === 'stable' ? 0.12 : 0.3) : 0),
    text: () =>
      'Leaving Camp Muir, the cloud comes down on the snowfield. Descending parties drift right onto the Nisqually Glacier or left toward the Cowlitz cliffs. This is where most Rainier navigation accidents happen.',
    choices: (s) => [
      req(!!s.flags.wandsPlaced, 'Follow your wands', 'wands placed on the way up', () => ({ text: 'Wand to wand, a rope length at a time, all the way down.', minutes: 10, tone: 'good' })),
      req(has(s, 'gps'), 'Follow the GPS track', 'a GPS', () => ({ text: 'You stay right on the track.', minutes: 15, tone: 'good' })),
      req(has(s, 'map'), 'Hold a compass bearing', 'a map & compass', () => ({ text: 'A careful bearing toward Pebble Creek brings you out of the cloud on route.', minutes: 30, delta: { stamina: -3 }, tone: 'good' })),
      {
        label: 'Head downhill and hope',
        resolve: (st, rng) => {
          const r = rng();
          if (r < 0.35) {
            return has(st, 'bivy')
              ? { text: 'You end up on the Nisqually Glacier as night falls. You crawl into your emergency bivy and walk out at dawn.', minutes: 600, delta: { warmth: -30, morale: -25, stamina: -10 }, tone: 'bad' }
              : { text: 'You’re lost on the glacier as night falls, with no shelter.', ending: 'lost', tone: 'bad' };
          }
          if (r < 0.65) return { text: 'You drift off route and lose an hour finding the trail.', minutes: 90, delta: { warmth: -10, morale: -10 }, tone: 'bad' };
          return { text: 'Lucky. You stumble out of the cloud near Pebble Creek.', minutes: 10, tone: 'info' };
        },
      },
    ],
  },
  {
    id: 'glissade',
    title: 'Glissade chutes',
    chance: (s, c) => (c.dir === 'down' && c.leg === 1 && s.weather !== 'whiteout' ? 0.75 : 0),
    text: () => 'Glissade chutes run down the Muir Snowfield. Sliding on your butt is fast and fun, and it saves your knees.',
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
    chance: (_s, c) => (c.dir === 'up' && c.leg === 3 ? 1 : 0),
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
    chance: (s, c) => (c.leg === 2 ? (c.dir === 'up' ? 0.5 : 0.65) : c.leg === 3 && c.dir === 'down' ? 0.6 : 0),
    text: (s) =>
      `“ROCK!” A rock the size of a microwave comes bouncing down ${s.node <= 3 && s.dir === 'up' ? 'Cathedral Gap' : 'the gully'} toward your rope team.`,
    choices: () => [
      { label: 'Keep moving fast through the gully', resolve: (s, rng) => rockfall(s, 0.3, rng, { text: 'You hustle through. It misses.', delta: { stamina: -6, morale: -4 }, tone: 'info' }) },
      { label: 'Wait for a gap, then cross one at a time', hint: '15 min', resolve: (s, rng) => rockfall(s, 0.12, rng, { text: 'You wait it out and cross when it’s quiet.', minutes: 15, tone: 'good' }) },
    ],
  },
  {
    id: 'crevasse',
    title: 'Crevasse fall',
    chance: (s, c) =>
      [2, 4, 5].includes(c.leg)
        ? 0.12 + (c.dir === 'down' && minuteOfDay(s.clock) > 660 ? 0.15 : 0) + (s.flags.pushedPastTurnaround ? 0.08 : 0)
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
            req(has(s, 'rescue_kit'), 'Climb out on your prusiks', 'a crevasse rescue kit', () => ({
              text: 'Foot loop, waist loop, slide, stand. Twenty minutes of work and you flop over the lip.', minutes: 40, delta: { stamina: -15, warmth: -8 }, tone: 'good',
            })),
            req(has(s, 'rescue_kit'), 'Your partner builds a Z-pulley and hauls', 'a crevasse rescue kit', (st) => ({
              text: has(st, 'picket')
                ? 'A buried picket for the anchor, a 3:1 haul, and you’re out.'
                : 'With no picket, your partner builds an anchor from an ice axe. Slow, but it holds.',
              minutes: has(st, 'picket') ? 50 : 75,
              delta: { stamina: -6, warmth: -18 },
              tone: 'good',
            })),
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
    chance: (_s, c) => (c.dir === 'up' && c.leg === 4 ? 0.35 : 0),
    text: () => 'Late-season crevasses force the route across aluminum ladders lashed together over a gap, with hand lines fixed on both sides.',
    choices: (s) => [
      req(has(s, 'harness'), 'Clip into the hand line and walk the rungs', 'a harness', () => ({ text: 'Front points between the rungs, eyes on the far side. Done.', minutes: 10, delta: { morale: 5 }, tone: 'good' })),
      { label: 'Crawl across on hands and knees', resolve: () => ({ text: 'Ugly but safe.', minutes: 20, delta: { stamina: -5, morale: -3 }, tone: 'info' }) },
    ],
  },
  {
    id: 'slip',
    title: 'Slip',
    repeatable: true,
    chance: (s, c) => {
      if (![4, 5].includes(c.leg) || s.usedEvents.filter((e) => e === 'slip').length >= 2) return 0;
      let p = 0.15 + (c.dir === 'down' ? 0.1 : 0);
      if (s.flags.cramponsDull) p += 0.2;
      if (!crampons(s)) p += 0.3;
      if (!has(s, 'gaiters')) p += 0.08;
      return p;
    },
    text: (s) =>
      has(s, 'gaiters')
        ? 'Your boot skids on hard, wind-polished snow and you go down, sliding feet-first down the slope.'
        : 'A crampon point snags your loose pant leg and you pitch forward, sliding headfirst.',
    choices: (s) => [
      req(has(s, 'axe'), 'Self-arrest with your ice axe', 'an ice axe', (st, rng) => slide(st, rng, st.flags.cramponsDull ? 0.75 : 0.88)),
      { label: 'Dig in your hands and heels', resolve: (st, rng) => slide({ ...st, packed: st.packed.filter((g) => g !== 'axe') }, rng, 0) },
    ],
  },
  {
    id: 'lenticular',
    title: 'Lenticular cloud',
    chance: (s, c) => (c.dir === 'up' && [2, 3, 4].includes(c.leg) && s.forecast !== 'stable' ? 0.45 : 0),
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
    chance: (s) => (s.node >= 5 && ['windy', 'coldsnap', 'storm'].includes(s.weather) ? 0.7 : 0),
    text: () => 'Gusts over 40 mph knock you to your knees. With the wind, it feels far below zero, and exposed skin can freeze in minutes.',
    choices: (s) => [
      {
        label: 'Put on everything: parka, mittens, goggles',
        resolve: (st) => {
          const missing = [
            !has(st, 'parka') && 'parka',
            !has(st, 'mitts') && 'mittens',
            !has(st, 'goggles') && !has(st, 'balaclava') && 'face protection',
          ].filter(Boolean) as string[];
          if (!missing.length) return { text: 'Fully bundled, you’re warm enough to keep moving.', minutes: 5, mutate: (x) => { x.layer = 3; }, tone: 'good' };
          return {
            text: `No ${missing.join(' or ')}. Your fingers and cheeks go white and waxy: frostnip.`,
            minutes: 5,
            delta: { warmth: -15, morale: -10 },
            mutate: (x) => { x.layer = 3; x.flags.frostnip = true; },
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
    chance: (s) => (isNight(s.clock) && ft(s) >= 10000 && !has(s, 'gloves') && !has(s, 'mitts') ? 0.8 : 0),
    text: () => 'In the dark, your fingers go numb and white around the shaft of your ice axe. Liner gloves aren’t enough up here.',
    choices: () => [
      { label: 'Shove your hands in your armpits', hint: '10 min', resolve: () => ({ text: 'Painful pins and needles as they rewarm. Frostnip.', minutes: 10, delta: { warmth: -6, morale: -10 }, mutate: (x) => { x.flags.frostnip = true; }, tone: 'bad' }) },
    ],
  },
  {
    id: 'headlamp',
    title: 'Light out',
    chance: (s, c) => (isNight(c.start) && has(s, 'headlamp') ? 0.12 : 0),
    text: () => 'Your headlamp dims to orange and dies. Cold drains batteries fast.',
    choices: () => [{ label: 'Swap in the spare batteries', resolve: () => ({ text: 'Fresh batteries, bright light.', minutes: 5, tone: 'info' }) }],
  },
  {
    id: 'sunrise',
    title: 'Sunrise',
    chance: (s) => {
      const m = minuteOfDay(s.clock);
      return s.dir === 'up' && s.clock >= DAY && m >= 330 && m <= 480 && (s.weather === 'clear' || s.weather === 'windy') ? 1 : 0;
    },
    text: () =>
      'The sun comes up over the Cascades. Mount Adams and Mount Hood catch the first light, and Rainier’s shadow stretches west across the clouds.',
    choices: () => [{ label: 'Keep climbing', resolve: () => ({ text: 'Warm light on your face. Your energy comes back.', delta: { morale: 15, warmth: 5 }, tone: 'good' }) }],
  },
  {
    id: 'balling',
    title: 'Balling up',
    chance: (s, c) => (c.dir === 'down' && c.leg >= 2 && c.leg <= 5 && minuteOfDay(s.clock) > 600 && s.weather === 'clear' && crampons(s) ? 0.45 : 0),
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
