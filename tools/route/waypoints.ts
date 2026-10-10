/// <reference types="node" />
// Places the Emmons-Winthrop, Kautz Glacier and Liberty Ridge routes, and the career routes on
// Mount Si, St. Helens, Adams and Baker, on the real terrain and writes
// src/scene/data/routeWaypoints.ts. The Disappointment Cleaver keeps the waypoints made by
// tools/dem/route.py (src/scene/data/rainierDem.ts).
//
// Each waypoint starts from an approximate latitude/longitude read off maps and trip reports, then
// is nudged within `radius` meters to the spot whose terrain height best matches the published
// elevation. Positions are approximate (often a few hundred meters); the elevations are what the
// game relies on. Shaping points (target null) only steer the line and keep the terrain height.
//   npx tsx tools/route/waypoints.ts
import { writeFileSync } from 'node:fs';
import { CORE_MESH, meshHeight, setSceneMountain, type MountainId } from '../../src/scene/terrain';
import { WAYPOINTS as DC } from '../../src/scene/data/rainierDem';

const M_PER_DEG_LAT = 111320;
const FT = 0.3048;
/** Local frame origin of each mountain's elevation data (see tools/dem). */
const ORIGIN: Record<MountainId, [number, number]> = {
  rainier: [46.825, -121.75],
  helens: [46.172, -122.19],
  adams: [46.168, -121.494],
  baker: [48.742, -121.815],
  si: [47.489, -121.73],
};
let origin = ORIGIN.rainier;
const toXZ = (lat: number, lon: number) => [
  (lon - origin[1]) * M_PER_DEG_LAT * Math.cos((origin[0] * Math.PI) / 180),
  (origin[0] - lat) * M_PER_DEG_LAT,
];
const h = (x: number, z: number) => meshHeight(CORE_MESH, x, z);

/** targetFt 'top' = the local high point within the radius (summits). */
type W = [name: string, lat: number, lon: number, targetFt: number | null | 'top', radius?: number];

const CREST = DC[DC.length - 1];

// [name, lat, lon, published elevation (ft) or null for a shaping point, snap radius (m)]
const ROUTES: Record<string, W[]> = {
  emmons: [
    ['White River', 46.9025, -121.6432, 4400],
    ['Glacier Basin', 46.8938, -121.6760, 5900, 1200],
    ['Inter Glacier', 46.8855, -121.6985, null],
    ['Camp Curtis', 46.8790, -121.7095, 8700, 700],
    ['Camp Schurman', 46.8685, -121.7215, 9460, 700],
    ['Emmons Flats', 46.8655, -121.7280, 9900],
    ['Top of the Corridor', 46.8620, -121.7380, 11500],
    ['Upper Emmons', 46.8585, -121.7470, 12800],
    ['Crater Rim', 46.8540, -121.7555, 14200, 300],
  ],
  kautz: [
    ['Paradise', 0, 0, null],
    ['Glacier Vista', 46.7985, -121.7375, 6300],
    ['Nisqually Glacier', 46.8050, -121.7470, 6100],
    ['Wilson Glacier', 46.8150, -121.7560, 7600],
    ['Wapowety Cleaver', 46.8270, -121.7600, 9500],
    ['Camp Hazard', 46.8380, -121.7625, 11300, 400],
    ['Top of the Ice Chute', 46.8430, -121.7645, 12300, 600],
    ['Crater Rim', 46.8505, -121.7595, 14150, 300],
  ],
  liberty: [
    ['White River', 46.9025, -121.6432, 4400],
    ['Glacier Basin', 46.8938, -121.6760, 5900, 1200],
    ['St. Elmo Pass', 46.8945, -121.7030, 7400, 900],
    ['Winthrop Glacier', 46.8950, -121.7250, null],
    ['Curtis Ridge', 46.8960, -121.7480, null],
    ['Base of Liberty Ridge', 46.8890, -121.7650, 8000, 500],
    ['Thumb Rock', 46.8765, -121.7720, 10760, 400],
    ['Black Pyramid', 46.8700, -121.7740, 12000],
    ['Liberty Cap', 46.8622, -121.7740, 'top', 250],
  ],
  // Career routes. These end at their own summits, not Columbia Crest.
  si: [
    ['Mount Si Trailhead', 47.4880, -121.7230, 700, 1000],
    ['Snag Flat', 47.5010, -121.7260, 2100, 600],
    ['Haystack Basin', 47.5155, -121.7315, 3900, 400],
    ['The Haystack', 47.5177, -121.7287, 'top', 200],
  ],
  helens: [
    ['Climbers Bivouac', 46.1465, -122.1838, 3765, 800],
    ['Treeline', 46.1575, -122.1855, 4800, 500],
    ['Monitor Ridge', 46.1680, -122.1880, 6000, 500],
    ['Upper Monitor Ridge', 46.1790, -122.1905, 7300, 500],
    ['Crater Rim', 46.1880, -122.1920, 'top', 400],
  ],
  adams: [
    ['Cold Springs', 46.1340, -121.4950, 5600, 1000],
    ['Crescent Glacier moraine', 46.1470, -121.4950, 7000, 600],
    ['Lunch Counter', 46.1690, -121.4930, 9000, 600],
    ["Piker's Peak", 46.1880, -121.4920, 11657, 500],
    ['Summit of Mount Adams', 46.2024, -121.4909, 'top', 400],
  ],
  baker: [
    ['Schriebers Meadow', 48.7050, -121.8130, 3400, 1200],
    ['Railroad Grade', 48.7230, -121.8150, 5000, 700],
    ['High Camp', 48.7380, -121.8170, 6500, 700],
    ['Easton Glacier', 48.7530, -121.8150, 8000, 600],
    ['Sherman Crater', 48.7690, -121.8120, 9700, 500],
    ['Grant Peak', 48.7768, -121.8144, 'top', 400],
  ],
};
const MOUNTAIN: Record<string, MountainId> = { emmons: 'rainier', kautz: 'rainier', liberty: 'rainier', si: 'si', helens: 'helens', adams: 'adams', baker: 'baker' };

function snap(x: number, z: number, target: number, radius: number) {
  let best = Infinity;
  let bx = x;
  let bz = z;
  for (let dx = -radius; dx <= radius; dx += 10) {
    for (let dz = -radius; dz <= radius; dz += 10) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const score = Math.abs(h(x + dx, z + dz) - target) + d * 0.01;
      if (score < best) [best, bx, bz] = [score, x + dx, z + dz];
    }
  }
  return [bx, bz];
}

/** The local high point within `radius` (Liberty Cap). */
function top(x: number, z: number, radius: number) {
  let best = -Infinity;
  let bx = x;
  let bz = z;
  for (let dx = -radius; dx <= radius; dx += 5) {
    for (let dz = -radius; dz <= radius; dz += 5) {
      const e = h(x + dx, z + dz);
      if (e > best) [best, bx, bz] = [e, x + dx, z + dz];
    }
  }
  return [bx, bz];
}

const out: Record<string, { name: string; x: number; z: number; dem: number }[]> = {};
for (const [id, list] of Object.entries(ROUTES)) {
  const mountain = MOUNTAIN[id];
  setSceneMountain(mountain);
  origin = ORIGIN[mountain];
  out[id] = list.map(([name, lat, lon, ft, radius]) => {
    if (name === 'Paradise') return { name, x: DC[0].x, z: DC[0].z, dem: DC[0].dem };
    let [x, z] = toXZ(lat, lon);
    if (ft === 'top') [x, z] = top(x, z, radius ?? 250);
    else if (ft !== null) [x, z] = snap(x, z, ft * FT, radius ?? 250);
    const dem = Math.round(h(x, z) * 10) / 10;
    console.log(`${id.padEnd(8)} ${name.padEnd(26)} DEM ${Math.round(dem / FT).toString().padStart(6)} ft${ft ? `  published ${ft}` : ''}`);
    return { name, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, dem };
  });
  if (mountain === 'rainier') out[id].push({ name: CREST.name, x: CREST.x, z: CREST.z, dem: CREST.dem });
}

writeFileSync(
  'src/scene/data/routeWaypoints.ts',
  `// GENERATED by tools/route/waypoints.ts. Do not edit by hand. Positions approximate; see the tool.
export const ROUTE_WAYPOINTS: Record<string, { name: string; x: number; z: number; dem: number }[]> = ${JSON.stringify(out, null, 1)};
`,
);
