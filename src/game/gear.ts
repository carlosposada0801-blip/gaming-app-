// Gear catalog. Weights are typical real-world weights in ounces.
import { SEASONS, type Season } from './season';
// "layer" decides when a clothing item counts toward warmth:
//   0 = always worn, 1 = midlayer setting and up, 2 = shell setting and up, 3 = full kit.

export type GearCategory =
  | 'Footwear'
  | 'Climbing'
  | 'Glacier travel'
  | 'Clothing'
  | 'Hands, head & eyes'
  | 'Navigation'
  | 'Essentials'
  | 'Camp (left at Muir)';

export interface Gear {
  id: string;
  name: string;
  cat: GearCategory;
  oz: number;
  note: string;
  recommended: boolean;
  /** Only one item per group can be packed (boots, crampons). */
  group?: 'boots' | 'crampons';
  warmth?: number;
  layer?: 0 | 1 | 2 | 3;
  /** Left behind at Camp Muir for summit day. */
  camp?: boolean;
  /** Hand wear: worn from this hand setting up (0 liners, 1 gloves, 2 mittens). */
  hand?: 0 | 1 | 2;
  /** How well this keeps your toes warm (boots, gaiters). Game scale, not a lab number. */
  feet?: number;
}

export const PACK_OZ = 72; // 65 L alpine pack itself

export const GEAR: Gear[] = [
  // Footwear
  { id: 'boots_single', name: 'Insulated single boots (B3)', cat: 'Footwear', oz: 66, group: 'boots', warmth: 0.7, layer: 0, feet: 1.6, recommended: true,
    note: 'Stiff soles with toe and heel welts for automatic crampons. The standard summer Rainier boot.' },
  { id: 'boots_double', name: 'Double mountaineering boots', cat: 'Footwear', oz: 92, group: 'boots', warmth: 1.2, layer: 0, feet: 2.6, recommended: false,
    note: 'Removable insulated liner. Warmest and heaviest. Overkill in July, smart in a cold snap or a cold spring.' },
  { id: 'boots_hiking', name: 'Waterproof hiking boots', cat: 'Footwear', oz: 40, group: 'boots', warmth: 0.2, layer: 0, feet: 0.45, recommended: false,
    note: 'Light and comfy, but the soles flex, strap-on crampons loosen, and they soak through in snow. Toes go numb above Muir.' },
  { id: 'crampons_steel', name: 'Steel 12-point crampons', cat: 'Footwear', oz: 36, group: 'crampons', recommended: true,
    note: 'Front points bite on hard morning ice and survive walking on the Cleaver’s rock.' },
  { id: 'crampons_alu', name: 'Aluminum crampons', cat: 'Footwear', oz: 20, group: 'crampons', recommended: false,
    note: 'Light. Fine on soft snow, but rock dulls them fast and they skate on hard ice.' },
  { id: 'gaiters', name: 'Gaiters', cat: 'Footwear', oz: 10, feet: 0.25, recommended: true,
    note: 'Keep snow out of your boots and stop crampon points from snagging your pant legs.' },
  { id: 'snowshoes', name: 'Snowshoes', cat: 'Footwear', oz: 66, camp: true, recommended: false,
    note: 'Float on soft spring snow instead of post-holing to your knees. Left at Camp Muir for summit day.' },

  // Climbing
  { id: 'axe', name: 'Mountaineering ice axe, 65 cm', cat: 'Climbing', oz: 17, recommended: true,
    note: 'Your self-arrest tool. Carried in your uphill hand on every glacier.' },
  { id: 'helmet', name: 'Climbing helmet', cat: 'Climbing', oz: 12, recommended: true,
    note: 'Rockfall at Cathedral Gap and on Disappointment Cleaver is a leading cause of injury.' },
  { id: 'harness', name: 'Alpine harness', cat: 'Climbing', oz: 10, recommended: true,
    note: 'Light, packable, and easy to put on over boots and crampons.' },
  { id: 'poles', name: 'Trekking poles', cat: 'Climbing', oz: 18, recommended: true,
    note: 'Save your legs and knees on the 4,800 ft from Paradise to Muir.' },

  // Glacier travel
  { id: 'rope', name: 'Rope share (30 m, 8.9 mm dry)', cat: 'Glacier travel', oz: 44, recommended: true,
    note: 'Split between the rope team. Without a rope, a crevasse fall is a solo fall.' },
  { id: 'rescue_kit', name: 'Crevasse rescue kit', cat: 'Glacier travel', oz: 14, recommended: true,
    note: 'Three locking carabiners, two prusik loops, a micro pulley, and a cordelette.' },
  { id: 'picket', name: 'Snow picket', cat: 'Glacier travel', oz: 16, recommended: true,
    note: 'Aluminum stake for anchors in snow. Speeds up a Z-pulley rescue.' },
  { id: 'screws', name: 'Ice screws (2)', cat: 'Glacier travel', oz: 10, recommended: false,
    note: 'For anchors in hard glacier ice, where a picket won’t hold. Late-season glaciers are bare ice in places.' },
  { id: 'avy', name: 'Avalanche transceiver, probe & shovel', cat: 'Glacier travel', oz: 70, recommended: false,
    note: 'Standard kit on spring snow. Most summer Cleaver parties leave it home: about 4.4 lb.' },

  // Clothing
  { id: 'base', name: 'Synthetic base layer (top & bottom)', cat: 'Clothing', oz: 12, warmth: 1, layer: 0, recommended: true,
    note: 'Wicks sweat. Always worn.' },
  { id: 'fleece', name: 'Fleece midlayer', cat: 'Clothing', oz: 14, warmth: 1, layer: 1, recommended: true,
    note: 'Breathable warmth for moving on cold mornings.' },
  { id: 'cotton', name: 'Cotton hoodie', cat: 'Clothing', oz: 18, warmth: 0.8, layer: 1, recommended: false,
    note: 'Comfortable at the trailhead. Cotton soaks up sweat and stays cold and wet.' },
  { id: 'shell_jacket', name: 'Waterproof hardshell jacket', cat: 'Clothing', oz: 15, warmth: 1, layer: 2, recommended: true,
    note: 'Blocks wind and wet snow. Wind is what makes the upper mountain cold.' },
  { id: 'shell_pants', name: 'Hardshell pants', cat: 'Clothing', oz: 14, warmth: 0.6, layer: 2, recommended: true,
    note: 'Full side zips so you can pull them on over boots and crampons.' },
  { id: 'parka', name: 'Insulated parka (synthetic)', cat: 'Clothing', oz: 22, warmth: 2.5, layer: 3, recommended: true,
    note: 'The "belay jacket". Throw it on at every break and on the summit.' },

  // Hands, head & eyes
  { id: 'liners', name: 'Liner gloves', cat: 'Hands, head & eyes', oz: 2, warmth: 0.3, hand: 0, recommended: true,
    note: 'Thin gloves for the warm hike to Muir and fiddly rope work.' },
  { id: 'gloves', name: 'Insulated gloves', cat: 'Hands, head & eyes', oz: 7, warmth: 0.6, hand: 1, recommended: true,
    note: 'Your main glove above Camp Muir. Warm enough for most nights, nimble enough for rope work.' },
  { id: 'mitts', name: 'Expedition mittens', cat: 'Hands, head & eyes', oz: 10, warmth: 1.1, hand: 2, recommended: true,
    note: 'Fingers together stay warm. For wind on the upper mountain. Clumsy for knots and prusiks.' },
  { id: 'balaclava', name: 'Balaclava & warm hat', cat: 'Hands, head & eyes', oz: 4, warmth: 0.5, layer: 3, recommended: true,
    note: 'Covers your face when the wind chill drops well below zero.' },
  { id: 'glasses', name: 'Glacier glasses (category 4)', cat: 'Hands, head & eyes', oz: 2, recommended: true,
    note: 'Snow reflects most UV. Without them, snow blindness can set in within hours.' },
  { id: 'goggles', name: 'Ski goggles', cat: 'Hands, head & eyes', oz: 6, recommended: true,
    note: 'For blowing snow and high wind, when glasses aren’t enough.' },
  { id: 'sun', name: 'SPF 50 sunscreen & lip balm', cat: 'Hands, head & eyes', oz: 3, recommended: true,
    note: 'You burn under your chin and in your nostrils from reflected light.' },

  // Navigation
  { id: 'map', name: 'Map & compass', cat: 'Navigation', oz: 4, recommended: true,
    note: 'Works when batteries don’t. Know the bearing from Muir to Pebble Creek.' },
  { id: 'gps', name: 'GPS with the route preloaded', cat: 'Navigation', oz: 3, recommended: true,
    note: 'The fastest way back down the Muir Snowfield in a whiteout.' },
  { id: 'wands', name: 'Wands (bundle of 20)', cat: 'Navigation', oz: 16, recommended: false,
    note: 'Bamboo stakes with flags. Place them on the way up to follow them down.' },
  { id: 'oximeter', name: 'Pulse oximeter', cat: 'Navigation', oz: 2, recommended: false,
    note: 'Clips on a fingertip and reads blood oxygen (SpO₂) and heart rate, for you and your partner. A clue, not a diagnosis.' },
  { id: 'plb', name: 'Personal locator beacon', cat: 'Navigation', oz: 4, recommended: true,
    note: 'Sends your location to rescuers by satellite.' },

  // Essentials
  { id: 'headlamp', name: 'Headlamp & spare batteries', cat: 'Essentials', oz: 5, recommended: true,
    note: 'Summit day starts around midnight. No light, no climb.' },
  { id: 'water', name: 'Water, 3 liters', cat: 'Essentials', oz: 106, recommended: true,
    note: 'Heavy, and still not enough for the whole day without melting snow.' },
  { id: 'food', name: 'Summit food (bars, gels, jerky, cheese)', cat: 'Essentials', oz: 28, recommended: true,
    note: 'About 3,000 calories. Eat a little at every break, even when you’re not hungry.' },
  { id: 'firstaid', name: 'First aid & repair kit', cat: 'Essentials', oz: 10, recommended: true,
    note: 'Blister care, tape, a crampon wrench, spare straps.' },
  { id: 'bivy', name: 'Emergency bivy', cat: 'Essentials', oz: 4, recommended: true,
    note: 'Lets you survive an unplanned night out.' },
  { id: 'bluebags', name: 'Blue bags', cat: 'Essentials', oz: 2, recommended: true,
    note: 'Human waste bags. The park requires you to pack waste out above the toilets.' },

  // Camp
  { id: 'bag', name: 'Sleeping bag (0°F)', cat: 'Camp (left at Muir)', oz: 40, camp: true, recommended: true,
    note: 'For a few hours of sleep in the public shelter at Camp Muir.' },
  { id: 'pad', name: 'Sleeping pad', cat: 'Camp (left at Muir)', oz: 16, camp: true, recommended: true,
    note: 'The shelter floor is cold stone.' },
  { id: 'stove', name: 'Stove, fuel & pot', cat: 'Camp (left at Muir)', oz: 18, camp: true, recommended: true,
    note: 'Melt snow to refill your water at Muir.' },
];

export const GEAR_BY_ID: Record<string, Gear> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export const CATEGORIES: GearCategory[] = [
  'Footwear', 'Climbing', 'Glacier travel', 'Clothing', 'Hands, head & eyes', 'Navigation', 'Essentials', 'Camp (left at Muir)',
];

/** The summer (July) guide's list. */
export const RECOMMENDED = GEAR.filter((g) => g.recommended).map((g) => g.id);

/** A guide's list for the season: the summer list plus seasonal extras. */
export function recommendedFor(season: Season): string[] {
  return [...RECOMMENDED, ...SEASONS[season].extraGear];
}

export function packWeightLb(ids: string[], leftCampGear = false): number {
  const oz = ids.reduce((sum, id) => {
    const g = GEAR_BY_ID[id];
    if (!g) return sum;
    if (leftCampGear && g.camp) return sum;
    // Worn boots and base layer don't ride in the pack, but they still weigh on your legs.
    return sum + g.oz;
  }, PACK_OZ);
  return Math.round((oz / 16) * 10) / 10;
}

/** Toggle an item, keeping one-per-group items exclusive. */
export function toggleGear(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  const g = GEAR_BY_ID[id];
  const cleared = g?.group ? ids.filter((x) => GEAR_BY_ID[x]?.group !== g.group) : ids;
  return [...cleared, id];
}
