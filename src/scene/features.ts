// Boulders, seracs and crevasses scattered over the detail patch, placed by the real terrain:
// rocks on bare and steep ground, seracs and crevasses on glaciers, never on the boot track.
import * as THREE from 'three';
import {
  distToRoute, fbm, glacierness, slopeAt, snowCover, surfaceAt, type Grid,
} from './terrain';

export interface Instances {
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** Surface normal from the patch heights. */
function normalAt(x: number, z: number) {
  const d = 4;
  const hx = surfaceAt(x + d, z) - surfaceAt(x - d, z);
  const hz = surfaceAt(x, z + d) - surfaceAt(x, z - d);
  return new THREE.Vector3(-hx, 2 * d, -hz).normalize();
}

export function scatter(patch: Grid) {
  const rand = rng(Math.round(patch.cx * 7 + patch.cz * 13));
  const rocks: Instances = { matrices: [], colors: [] };
  const seracs: Instances = { matrices: [], colors: [] };
  const crevasses: Instances = { matrices: [], colors: [] };
  const span = patch.half - 40;
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  for (let i = 0; i < 3200; i++) {
    const x = patch.cx + (rand() * 2 - 1) * span;
    const z = patch.cz + (rand() * 2 - 1) * span;
    const track = distToRoute(x, z);
    if (track < 7) continue;
    const y = surfaceAt(x, z);
    const s = slopeAt(x, z);
    const cover = snowCover(x, y, z, s.deg, s.north);
    const glacier = glacierness(x, y, z) * cover;

    // Boulders and talus: common on bare ground, rare erratics on snow.
    if (rocks.matrices.length < 520 && y > 1650 && (cover < 0.45 ? rand() < 0.75 : rand() < 0.02)) {
      const size = 0.35 + Math.pow(rand(), 3) * (cover < 0.45 ? 6 : 2.5);
      q.setFromEuler(new THREE.Euler(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6));
      m.compose(
        new THREE.Vector3(x, y - size * 0.3, z),
        q,
        new THREE.Vector3(size * (0.8 + rand() * 0.6), size * (0.5 + rand() * 0.5), size * (0.8 + rand() * 0.6)),
      );
      rocks.matrices.push(m.clone());
      const v = 0.08 + rand() * 0.1;
      const red = fbm(x * 0.002 + 40, z * 0.002 - 13) > 0.6 ? 0.05 : 0;
      rocks.colors.push(new THREE.Color(v + red, v * 0.95, v * 0.92));
      continue;
    }

    // Seracs: broken ice towers where glaciers steepen.
    if (seracs.matrices.length < 170 && glacier > 0.35 && s.deg > 17 && s.deg < 42 && y > 2700 && track > 30 && rand() < 0.65) {
      const w = 4 + rand() * 9;
      const hgt = 3 + rand() * 9;
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3));
      m.compose(new THREE.Vector3(x, y + hgt * 0.3, z), q, new THREE.Vector3(w, hgt, w * (0.5 + rand() * 0.6)));
      seracs.matrices.push(m.clone());
      const b = rand();
      seracs.colors.push(new THREE.Color(0.62 + b * 0.25, 0.76 + b * 0.16, 0.88 + b * 0.08));
      continue;
    }

    // Crevasses: open slots lying across the slope, in groups along the contour.
    if (crevasses.matrices.length < 160 && glacier > 0.25 && s.deg > 7 && s.deg < 36 && y > 2350 && track > 12 && rand() < 0.5) {
      const nrm = normalAt(x, z);
      // Along the contour = horizontal, perpendicular to the downhill direction.
      const along = new THREE.Vector3(-s.dz, 0, s.dx);
      if (along.lengthSq() < 1e-6) along.set(1, 0, 0);
      along.projectOnPlane(nrm).normalize();
      const across = new THREE.Vector3().crossVectors(along, nrm).normalize();
      const len = 10 + rand() * 38;
      const width = 1.2 + rand() * 3.2;
      const count = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < count && crevasses.matrices.length < 160; k++) {
        const off = (k - (count - 1) / 2) * (6 + rand() * 6);
        const px = x + across.x * off + along.x * (rand() - 0.5) * 8;
        const pz = z + across.z * off + along.z * (rand() - 0.5) * 8;
        if (distToRoute(px, pz) < 12) continue;
        const basis = new THREE.Matrix4().makeBasis(along, nrm, across);
        q.setFromRotationMatrix(basis);
        m.compose(new THREE.Vector3(px, surfaceAt(px, pz) + 0.06, pz), q, new THREE.Vector3(len * (0.7 + rand() * 0.5), 1, width));
        crevasses.matrices.push(m.clone());
        crevasses.colors.push(new THREE.Color(1, 1, 1));
      }
    }
  }
  return { rocks, seracs, crevasses };
}

// ---------- shared geometries ----------

function displace(geo: THREE.BufferGeometry, amount: number, freq: number, flattenBottom: boolean) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * freq + v.y * 0.7 + 5, v.z * freq - v.y * 0.9 + 9, 3) - 0.5;
    v.multiplyScalar(1 + n * amount);
    if (flattenBottom && v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A lumpy, faceted boulder. */
export function rockGeometry() {
  return displace(new THREE.IcosahedronGeometry(1, 2), 0.7, 1.6, true);
}

/** A blocky ice tower with uneven faces. */
export function seracGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 5, 4);
  return displace(g, 0.35, 2.2, false);
}

/**
 * A crevasse seen from above: a lens-shaped slot, deep blue-black in the middle, glowing
 * blue at the walls and a white lip. Unit length along x, unit width along z, lies in y = 0.
 */
export function crevasseGeometry() {
  const seg = 16;
  const rows = [-0.5, -0.32, -0.12, 0, 0.12, 0.32, 0.5];
  const cols = [
    [0.93, 0.95, 0.98], // lip
    [0.36, 0.6, 0.78], // blue wall
    [0.05, 0.13, 0.22],
    [0.01, 0.03, 0.06], // depth
    [0.05, 0.13, 0.22],
    [0.3, 0.55, 0.74],
    [0.93, 0.95, 0.98],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const taper = Math.pow(Math.sin(Math.PI * t), 0.6);
    for (let r = 0; r < rows.length; r++) {
      positions.push(t - 0.5, 0, rows[r] * taper);
      colors.push(...cols[r]);
    }
  }
  const index: number[] = [];
  const R = rows.length;
  for (let i = 0; i < seg; i++) {
    for (let r = 0; r < R - 1; r++) {
      const a = i * R + r;
      const b = (i + 1) * R + r;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export { UP };
