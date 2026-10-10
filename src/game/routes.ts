// The routes: four on Rainier, and the career trips on Mount Si, St. Helens, Adams and Baker.
// Elevations of camps and landmarks are the commonly published ones; leg times are
// typical for a fit party with packs and are rounded guesses where guidebooks give a range.
// Positions on the terrain come from tools/route/waypoints.ts.
import { DAY, LEGS, NODES, type Leg, type RouteNode } from './route';

export type RouteId = 'dc' | 'emmons' | 'kautz' | 'liberty' | 'si' | 'muir' | 'helens' | 'adams' | 'baker';
export type MountainId = 'rainier' | 'helens' | 'adams' | 'baker' | 'si';

export interface RouteDef {
  id: RouteId;
  mountain: MountainId;
  /** A one-day trip: start early at the trailhead, no night out. */
  dayTrip?: boolean;
  /** Clock when you leave the trailhead (default 9:00 AM). */
  startClock?: number;
  /** Only played in career mode. */
  career?: boolean;
  /** A guide's list for this trip, replacing the Rainier list (career trips). */
  list?: string[];
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
  mountain: 'rainier',
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
  mountain: 'rainier',
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
  mountain: 'rainier',
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
  mountain: 'rainier',
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

// ---------- career trips ----------

/** The summer Rainier list without glacier gear (Adams' South Spur needs no rope). */
const RECOMMENDED_NO_GLACIER = [
  'boots_single', 'crampons_steel', 'gaiters', 'axe', 'helmet', 'poles', 'base', 'fleece', 'shell_jacket', 'shell_pants', 'parka',
  'liners', 'gloves', 'mitts', 'balaclava', 'glasses', 'goggles', 'sun', 'map', 'gps', 'plb', 'headlamp', 'water', 'food', 'firstaid',
  'bivy', 'bluebags', 'bag', 'pad', 'stove',
];

const DAY_HIKE = ['boots_hiking', 'poles', 'base', 'fleece', 'shell_jacket', 'liners', 'glasses', 'sun', 'map', 'headlamp', 'water', 'food', 'firstaid'];

const SI: RouteDef = {
  id: 'si',
  mountain: 'si',
  dayTrip: true,
  startClock: 480,
  career: true,
  list: DAY_HIKE,
  name: 'Mount Si',
  grade: 1,
  blurb: 'The classic training hike above North Bend: about 3,200 ft of switchbacks through forest to Haystack Basin, then a rock scramble. Good for your legs.',
  ranger: 'the trailhead kiosk',
  nodes: [
    { name: 'Mount Si Trailhead', ft: 700, desc: 'A busy trailhead off the Mount Si Road, under big Douglas firs.' },
    { name: 'Snag Flat', ft: 2100, desc: 'A flatter stretch among old fire-killed snags. Halfway, more or less.' },
    { name: 'Haystack Basin', ft: 3900, desc: 'The end of the trail: a rocky basin with a view over the Snoqualmie Valley. The Haystack towers above.' },
    { name: 'The Haystack', ft: 4167, desc: 'The top of the Haystack, after a steep, exposed scramble that many hikers skip.' },
  ],
  legs: [
    { minutes: 60, slopeDeg: 12, terrain: 'trail', name: 'Switchbacks in the forest', roped: false, corridor: 3, crampons: false, hazards: {} },
    { minutes: 100, slopeDeg: 15, terrain: 'trail', name: 'Up to Haystack Basin', roped: false, corridor: 3, crampons: false, hazards: {} },
    { minutes: 40, slopeDeg: 40, terrain: 'ridge', name: 'The Haystack scramble', roped: false, corridor: 3, crampons: false, hazards: { rockfall: [0.05, 0.1] } },
  ],
  camp: 2,
  bivouacs: [],
  crater: null,
  turnaround: 900,
  extraGear: [],
  teams: 0,
  unlock: '',
};

const MUIR_HIKE: RouteDef = {
  id: 'muir',
  mountain: 'rainier',
  dayTrip: true,
  startClock: 420,
  career: true,
  list: [...DAY_HIKE, 'gaiters', 'shell_pants', 'parka', 'gloves', 'balaclava', 'gps', 'bivy'],
  name: 'Camp Muir day hike',
  grade: 1,
  blurb: 'Paradise to Camp Muir and back in a day: 4,800 ft up the Muir Snowfield. Teaches you the altitude and the snowfield, and where whiteouts go wrong.',
  ranger: 'the Paradise Climbing Information Center',
  nodes: NODES.slice(0, 3),
  legs: LEGS.slice(0, 2),
  camp: 2,
  bivouacs: [],
  crater: null,
  // Day hikers usually reach Muir in four to six hours; turn around by mid-afternoon.
  turnaround: 930,
  extraGear: [],
  teams: 0,
  unlock: 'Hike Mount Si.',
};

const HELENS: RouteDef = {
  id: 'helens',
  mountain: 'helens',
  dayTrip: true,
  startClock: 300,
  career: true,
  list: ['boots_single', 'crampons_steel', 'gaiters', 'axe', 'poles', 'base', 'fleece', 'shell_jacket', 'shell_pants', 'parka', 'liners',
    'gloves', 'balaclava', 'glasses', 'goggles', 'sun', 'map', 'gps', 'plb', 'headlamp', 'water', 'food', 'firstaid', 'bivy', 'bluebags'],
  name: 'Mount St. Helens, Monitor Ridge',
  grade: 1,
  blurb: 'The spring snow climb from Climbers Bivouac up Monitor Ridge to the rim of the 1980 crater. A long day with an ice axe, no rope. Stay back from the corniced rim.',
  ranger: 'the Climbers Bivouac trailhead (a climbing permit is required above 4,800 ft)',
  nodes: [
    { name: 'Climbers Bivouac', ft: 3765, desc: 'Trailhead and campground in the forest. The Ptarmigan Trail starts here.' },
    { name: 'Treeline', ft: 4800, desc: 'The forest ends at the Loowit Trail. Above, posts mark the route up Monitor Ridge.' },
    { name: 'Monitor Ridge', ft: 6000, desc: 'A ridge of old lava boulders poking out of the snow.' },
    { name: 'Upper Monitor Ridge', ft: 7300, desc: 'Steeper snow and pumice. The rim is the skyline above you.' },
    { name: 'Crater Rim', ft: 8300, desc: 'The rim of the 1980 crater, 2,000 ft above the lava dome. Rainier, Adams and Hood all around. The edge is a cornice: stay well back.' },
  ],
  legs: [
    { minutes: 90, slopeDeg: 8, terrain: 'trail', name: 'Ptarmigan Trail', roped: false, corridor: 3, crampons: false, hazards: {} },
    { minutes: 120, slopeDeg: 18, terrain: 'snowfield', name: 'Lower Monitor Ridge', roped: false, corridor: 25, crampons: false,
      hazards: { glare: true, whiteout: true, glissade: true, avalanche: 0.5 } },
    { minutes: 150, slopeDeg: 25, terrain: 'snowfield', name: 'Monitor Ridge', roped: false, corridor: 12, crampons: true,
      hazards: { glare: true, glissade: true } },
    { minutes: 90, slopeDeg: 30, terrain: 'snowfield', name: 'Up to the crater rim', roped: false, corridor: 12, crampons: true,
      hazards: { glare: true, slip: true, cornice: true } },
  ],
  camp: 1,
  bivouacs: [],
  crater: null,
  // Most parties are on the rim by early afternoon of a 7-12 hour round trip.
  turnaround: 840,
  extraGear: [],
  teams: 4,
  unlock: 'Pass snow school.',
};

const ADAMS: RouteDef = {
  id: 'adams',
  mountain: 'adams',
  career: true,
  list: RECOMMENDED_NO_GLACIER,
  name: 'Mount Adams, South Spur',
  grade: 1,
  blurb: 'The South Climb from Cold Springs: camp at Lunch Counter, then a long snow slope to Piker\'s Peak, the false summit, and on to 12,276 ft. Non-technical, and huge. Famous glissades on the way down.',
  ranger: 'the Cold Springs trailhead (a Cascade Volcano Pass is required above 7,000 ft)',
  nodes: [
    { name: 'Cold Springs', ft: 5600, desc: 'The trailhead at the end of a rough Forest Service road, in burned forest.' },
    { name: 'Crescent Glacier moraine', ft: 7000, desc: 'Out of the trees onto rock and snow, below the little Crescent Glacier.' },
    { name: 'Lunch Counter', ft: 9000, desc: 'A broad bench of rock and snow where most parties camp. Mount Hood fills the view south.' },
    { name: "Piker's Peak", ft: 11657, desc: 'A false summit. The true top is another 600 ft and most of a mile across the summit plateau.' },
    { name: 'Summit of Mount Adams', ft: 12276, desc: 'The summit plateau, with the ruins of an old lookout cabin in the snow.' },
  ],
  legs: [
    { minutes: 150, slopeDeg: 10, terrain: 'trail', name: 'South Climb trail', roped: false, corridor: 3, crampons: false, hazards: {} },
    { minutes: 180, slopeDeg: 18, terrain: 'snowfield', name: 'Up to Lunch Counter', roped: false, corridor: 25, crampons: false,
      hazards: { glare: true, whiteout: true, avalanche: 0.5 } },
    { minutes: 270, slopeDeg: 30, terrain: 'snowfield', name: "The long slope to Piker's Peak", roped: false, corridor: 20, crampons: true,
      hazards: { glare: true, slip: true, glissade: true, lenticular: true, balling: true, avalanche: 1 } },
    { minutes: 90, slopeDeg: 15, terrain: 'upper', name: 'Across the summit plateau', roped: false, corridor: 20, crampons: true, hazards: { glare: true } },
  ],
  camp: 2,
  bivouacs: [],
  crater: null,
  turnaround: DAY + 660,
  extraGear: [],
  teams: 3,
  unlock: 'Climb Mount St. Helens.',
};

const BAKER: RouteDef = {
  id: 'baker',
  mountain: 'baker',
  career: true,
  name: 'Mount Baker, Easton Glacier',
  grade: 1,
  blurb: 'Your first real glacier: up the Railroad Grade moraine to high camp, then roped up the Easton Glacier past Sherman Crater and the Roman Wall to Grant Peak.',
  ranger: 'the Schriebers Meadow trailhead',
  nodes: [
    { name: 'Schriebers Meadow', ft: 3400, desc: 'A trailhead in old-growth forest on the south side of the mountain.' },
    { name: 'Railroad Grade', ft: 5000, desc: 'A knife-edged moraine left behind by the shrinking Easton Glacier.' },
    { name: 'High Camp', ft: 6500, desc: 'Tents on rock and snow at the top of the Railroad Grade.' },
    { name: 'Easton Glacier', ft: 8000, desc: 'The glacier steepens and the crevasses open. Rope up.' },
    { name: 'Sherman Crater', ft: 9700, desc: 'The saddle beside Sherman Crater. Fumaroles hiss and the air smells of sulfur.' },
    { name: 'Grant Peak', ft: 10781, desc: 'The summit of Mount Baker, a broad dome of ice above the Roman Wall.' },
  ],
  legs: [
    { minutes: 120, slopeDeg: 10, terrain: 'trail', name: 'Through the forest', roped: false, corridor: 3, crampons: false, hazards: {} },
    { minutes: 120, slopeDeg: 15, terrain: 'trail', name: 'The Railroad Grade', roped: false, corridor: 4, crampons: false, hazards: { glare: true } },
    { minutes: 150, slopeDeg: 20, terrain: 'glacier', name: 'Lower Easton Glacier', roped: true, corridor: 10,
      hazards: { crevasse: true, glare: true, lenticular: true } },
    { minutes: 150, slopeDeg: 25, terrain: 'glacier', name: 'Upper Easton Glacier', roped: true, corridor: 10,
      hazards: { crevasse: true, lenticular: true, balling: true, avalanche: 1 } },
    { minutes: 120, slopeDeg: 35, terrain: 'upper', name: 'The Roman Wall', roped: true, corridor: 8,
      hazards: { slip: true, balling: true } },
  ],
  camp: 2,
  bivouacs: [],
  crater: null,
  turnaround: DAY + 600,
  extraGear: [],
  teams: 2,
  unlock: 'Climb Mount Adams.',
};

export const ROUTES: Record<RouteId, RouteDef> = {
  dc: DC, emmons: EMMONS, kautz: KAUTZ, liberty: LIBERTY, si: SI, muir: MUIR_HIKE, helens: HELENS, adams: ADAMS, baker: BAKER,
};
/** The Rainier routes on the Plan screen. */
export const ROUTE_IDS: RouteId[] = ['dc', 'emmons', 'kautz', 'liberty'];
/** Every route, for the simulation. */
export const ALL_ROUTE_IDS = Object.keys(ROUTES) as RouteId[];
