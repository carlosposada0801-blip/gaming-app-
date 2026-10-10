// The four routes. Elevations of camps and landmarks are the commonly published ones; leg times are
// typical for a fit party with packs and are rounded guesses where guidebooks give a range.
// Positions on the terrain come from tools/route/waypoints.ts.
import { DAY, LEGS, NODES, type Leg, type RouteNode } from './route';

export type RouteId = 'dc' | 'emmons' | 'kautz' | 'liberty';

export interface RouteDef {
  id: RouteId;
  name: string;
  /** Difficulty for the picker: 1 standard, 2 standard but longer, 3 steep ice, 4 expert. */
  grade: 1 | 2 | 3 | 4;
  blurb: string;
  /** Where the ranger checks your permit. */
  ranger: string;
  nodes: RouteNode[];
  legs: Leg[];
  /** Index of the high camp where you sleep before summit day. */
  camp: number;
  /** Stops below high camp where the party spends an earlier night (long approaches). */
  bivouacs: number[];
  /** Index of the crater rim stop (register, steam vents), if the route tops out there. */
  crater: number | null;
  /** Default turnaround time (clock on day 2). */
  turnaround: number;
  /** Gear a guide adds for this route. */
  extraGear: string[];
  /** Other rope teams usually on the route on a summer summit day. */
  teams: number;
  /** How you unlock it (shown when locked). */
  unlock: string;
}

const DC: RouteDef = {
  id: 'dc',
  name: 'Disappointment Cleaver',
  grade: 1,
  blurb: 'The standard route from Paradise: the Muir Snowfield, Camp Muir, then the Cleaver. Busy, guided, with ladders and a boot track most summers.',
  ranger: 'the Paradise Climbing Information Center',
  nodes: NODES,
  legs: LEGS,
  camp: 2,
  bivouacs: [],
  crater: 6,
  turnaround: DAY + 600,
  extraGear: [],
  teams: 5,
  unlock: '',
};

const EMMONS: RouteDef = {
  id: 'emmons',
  name: 'Emmons-Winthrop',
  grade: 2,
  blurb: 'The northeast side from White River: up the Inter Glacier to Camp Schurman, then the Emmons, the biggest glacier in the lower 48. Longer and quieter than the Cleaver.',
  ranger: 'the White River Wilderness Information Center',
  nodes: [
    { name: 'White River', ft: 4400, desc: 'The campground at the end of the White River road. The Glacier Basin Trail starts here.' },
    { name: 'Glacier Basin', ft: 5900, desc: 'A meadow camp below the Inter Glacier, with old mining debris in the grass.' },
    { name: 'Camp Curtis', ft: 8700, desc: 'A rocky notch on Steamboat Prow above the Inter Glacier. From here you drop onto the Emmons Glacier.' },
    { name: 'Camp Schurman', ft: 9460, desc: 'High camp on Steamboat Prow, with a ranger hut and a toilet. Tents on the snow beside the Emmons.' },
    { name: 'Top of the Corridor', ft: 11500, desc: 'The smooth ramp up the Emmons, between crevasse fields, is behind you.' },
    { name: 'Upper Emmons', ft: 12800, desc: 'Above the big crevasses. The route weaves to find a way around the bergschrund.' },
    { name: 'Crater Rim', ft: 14200, desc: 'The northeast rim of the summit crater. Columbia Crest is a short walk across.' },
    NODES[NODES.length - 1],
  ],
  legs: [
    { minutes: 150, slopeDeg: 8, terrain: 'trail', name: 'Glacier Basin Trail', roped: false, corridor: 3, hazards: {} },
    { minutes: 240, slopeDeg: 25, terrain: 'snowfield', name: 'Inter Glacier', roped: false, corridor: 25,
      hazards: { glare: true, whiteout: true, glissade: true, avalanche: 0.7 } },
    { minutes: 75, slopeDeg: 15, terrain: 'glacier', name: 'Down to the Emmons Glacier', roped: true, corridor: 8,
      hazards: { rockfall: [0.15, 0.15], crevasse: true } },
    { minutes: 150, slopeDeg: 25, terrain: 'glacier', name: 'The Corridor', roped: true, corridor: 15,
      hazards: { crevasse: true, lenticular: true, balling: true, avalanche: 1 } },
    { minutes: 120, slopeDeg: 32, terrain: 'glacier', name: 'Upper Emmons Glacier', roped: true, corridor: 10,
      hazards: { crevasse: true, slip: true, lenticular: true, balling: true, avalanche: 1 } },
    { minutes: 150, slopeDeg: 30, terrain: 'upper', name: 'Around the bergschrund to the rim', roped: true, corridor: 10,
      hazards: { crevasse: true, slip: true, balling: true, avalanche: 1 } },
    { minutes: 25, slopeDeg: 10, terrain: 'crater', name: 'Across the crater', roped: true, corridor: 15, hazards: {} },
  ],
  camp: 3,
  bivouacs: [],
  crater: 6,
  turnaround: DAY + 630,
  extraGear: [],
  teams: 3,
  unlock: 'Summit by the Disappointment Cleaver.',
};

const KAUTZ: RouteDef = {
  id: 'kautz',
  name: 'Kautz Glacier',
  grade: 3,
  blurb: 'From Paradise across the Nisqually Glacier to Camp Hazard, then the Kautz Ice Chute: steep ice for a few hundred feet. Bring a second tool and screws.',
  ranger: 'the Paradise Climbing Information Center',
  nodes: [
    NODES[0],
    { name: 'Glacier Vista', ft: 6300, desc: 'A viewpoint above the Nisqually Glacier. You leave the trail here and drop onto the ice.' },
    { name: 'Wilson Glacier', ft: 7600, desc: 'Across the Nisqually and up the Fan, a gully known for rockfall in the afternoon.' },
    { name: 'Wapowety Cleaver', ft: 9500, desc: 'A rock rib with tent platforms. The Kautz Ice Cliff hangs high above.' },
    { name: 'Camp Hazard', ft: 11300, desc: 'High camp below the Kautz Ice Cliff. It earns its name: ice breaks off the cliff above. Many parties camp lower.' },
    { name: 'Top of the Ice Chute', ft: 12300, desc: 'The Kautz Ice Chute is behind you: a couple of steep pitches of hard ice.' },
    { name: 'Crater Rim', ft: 14150, desc: 'The south rim of the summit crater.' },
    NODES[NODES.length - 1],
  ],
  legs: [
    { minutes: 60, slopeDeg: 12, terrain: 'trail', name: 'Skyline Trail to Glacier Vista', roped: false, corridor: 3, hazards: { glare: true } },
    { minutes: 150, slopeDeg: 25, terrain: 'glacier', name: 'Nisqually Glacier and the Fan', roped: true, corridor: 10,
      hazards: { glare: true, crevasse: true, rockfall: [0.3, 0.3] } },
    { minutes: 150, slopeDeg: 25, terrain: 'snowfield', name: 'Wilson Glacier to the Wapowety Cleaver', roped: false, corridor: 20,
      hazards: { glare: true, whiteout: true, glissade: true, avalanche: 0.7 } },
    { minutes: 120, slopeDeg: 28, terrain: 'snowfield', name: 'The Turtle', roped: false, corridor: 12,
      hazards: { glare: true, avalanche: 1, icefall: 0.05 } },
    { minutes: 150, slopeDeg: 40, terrain: 'ice', name: 'Kautz Ice Chute', roped: true, corridor: 4,
      hazards: { ice: true, slip: true, icefall: 0.12, lenticular: true } },
    { minutes: 240, slopeDeg: 30, terrain: 'upper', name: 'Upper Kautz Glacier', roped: true, corridor: 10,
      hazards: { crevasse: true, slip: true, balling: true, lenticular: true, avalanche: 1 } },
    { minutes: 25, slopeDeg: 10, terrain: 'crater', name: 'Across the crater', roped: true, corridor: 15, hazards: {} },
  ],
  camp: 4,
  bivouacs: [],
  crater: 6,
  // Be up and out of the chute before the sun loosens the ice cliff: an earlier turnaround. A guess.
  turnaround: DAY + 570,
  extraGear: ['tool', 'screws'],
  teams: 1,
  unlock: 'Summit by the Emmons-Winthrop.',
};

const LIBERTY: RouteDef = {
  id: 'liberty',
  name: 'Liberty Ridge',
  grade: 4,
  blurb: 'Expert. The north face ridge between the Willis Wall and the Liberty Wall: rockfall, steep ice, and few ways off once you are on it. Real parties usually descend another route; here you reverse it.',
  ranger: 'the White River Wilderness Information Center',
  nodes: [
    EMMONS.nodes[0],
    EMMONS.nodes[1],
    { name: 'St. Elmo Pass', ft: 7400, desc: 'A notch between the Inter and Winthrop glaciers. The north side of the mountain opens up.' },
    { name: 'Base of Liberty Ridge', ft: 8000, desc: 'On the Carbon Glacier at the toe of the ridge, after Curtis Ridge and a long glacier crossing.' },
    { name: 'Thumb Rock', ft: 10760, desc: 'A tiny, exposed camp on the crest of the ridge, carved into the snow beside a rock tower.' },
    { name: 'Black Pyramid', ft: 12000, desc: 'A dark rock buttress. Above it the ridge steepens into the ice of the Liberty Wall.' },
    { name: 'Liberty Cap', ft: 14112, desc: 'The northern summit of Mount Rainier. Columbia Crest is across the summit plateau.' },
    NODES[NODES.length - 1],
  ],
  legs: [
    EMMONS.legs[0],
    { minutes: 150, slopeDeg: 22, terrain: 'snowfield', name: 'Inter Glacier to St. Elmo Pass', roped: false, corridor: 20,
      hazards: { glare: true, whiteout: true, glissade: true, avalanche: 0.7 } },
    { minutes: 300, slopeDeg: 20, terrain: 'glacier', name: 'Winthrop Glacier, Curtis Ridge and the Carbon Glacier', roped: true, corridor: 12,
      hazards: { crevasse: true, rockfall: [0.2, 0.2], whiteout: true } },
    { minutes: 330, slopeDeg: 40, terrain: 'ridge', name: 'The lower ridge', roped: true, corridor: 4,
      hazards: { slip: true, rockfall: [0.35, 0.4], avalanche: 1.2 } },
    { minutes: 180, slopeDeg: 45, terrain: 'ice', name: 'Black Pyramid', roped: true, corridor: 4,
      hazards: { ice: true, slip: true, rockfall: [0.25, 0.3] } },
    { minutes: 330, slopeDeg: 45, terrain: 'ice', name: 'Liberty Wall', roped: true, corridor: 6,
      hazards: { ice: true, slip: true, crevasse: true, lenticular: true, avalanche: 1 } },
    { minutes: 60, slopeDeg: 10, terrain: 'upper', name: 'Across the summit plateau', roped: true, corridor: 20, hazards: { crevasse: true } },
  ],
  camp: 4,
  // Most parties take two days to reach Thumb Rock, with a night on the Carbon Glacier.
  bivouacs: [3],
  crater: null,
  // A long summit day from Thumb Rock (day 3); a later turnaround is common. A guess.
  turnaround: 2 * DAY + 780,
  extraGear: ['tool', 'screws'],
  teams: 0,
  unlock: 'Summit by the Kautz, with self-arrest at level 2.',
};

export const ROUTES: Record<RouteId, RouteDef> = { dc: DC, emmons: EMMONS, kautz: KAUTZ, liberty: LIBERTY };
export const ROUTE_IDS: RouteId[] = ['dc', 'emmons', 'kautz', 'liberty'];
