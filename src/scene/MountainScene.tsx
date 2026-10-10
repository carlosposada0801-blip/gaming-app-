import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { Platform } from 'react-native';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import { Climber, type ClimberLook, type Motion } from './Climber';
import { crevasseGeometry, rockGeometry, scatter, seracGeometry, treeGeometry, type Instances } from './features';
import {
  CORE_MESH, FAR, HORIZON, PATCH_HALF, ROUTE, ROUTE_SPACING, SUMMIT_POS, buildPatch, currentPatch, earthDrop, groundColor,
  inside, nodePosition, routeIndexAt, sceneMountain, sceneSeason, setSceneRoute, setSceneSeason, slopeAt, snowCover, surfaceAt, type Grid, type Vec3,
} from './terrain';
import { cloudTexture, detailTextures, grassTexture } from './textures';
import { flowerGeometry, grassGeometry, meadowScatter, swaying, tickWind } from './vegetation';
import { minuteOfDay } from '../game/route';
import { ROUTES, type RouteDef, type RouteId } from '../game/routes';
import { SEASONS, type Season } from '../game/season';
import type { Weather } from '../game/types';

export interface CameraControl {
  yaw: number; // extra orbit angle from drag
  dist: number; // follow distance (m)
  overview: boolean;
}

export interface SceneProps {
  node: number;
  clock: number;
  weather: Weather;
  look: ClimberLook;
  partnerLook: ClimberLook;
  roped: boolean;
  wands: boolean;
  /** 'follow' tracks the climber, 'orbit' slowly circles the mountain (title screen). */
  mode: 'follow' | 'orbit';
  control: React.MutableRefObject<CameraControl>;
  /** Fraction of the screen height to move the view up, for UI covering the bottom. */
  viewShift?: number;
  /** Which way the party is heading, so the camera looks along the next stretch when stopped. */
  facing?: 'up' | 'down';
  /** Live position from the thumbstick, updated every frame without re-rendering. */
  live?: React.MutableRefObject<LiveMove>;
  /** Freeze rendering (the last frame stays on screen), e.g. while a skill mini-game is open. */
  paused?: boolean;
  /** Snowline, meadow color, daylight hours and the other teams' start time follow the season. */
  season?: Season;
  /** Which route to draw, with its camps and other parties. */
  route?: RouteId;
  /** Filled in by the scene: renders a frame and returns it as an image URI (or null). */
  shot?: React.MutableRefObject<(() => Promise<string | null>) | null>;
}

/** Daylight, the summit-day start and the route on screen. */
const sceneDay: { dawn: number; dusk: number; alpine: number; route: RouteDef } = {
  dawn: SEASONS.july.dawn, dusk: SEASONS.july.dusk, alpine: SEASONS.july.alpineStart, route: ROUTES.dc,
};

function useSceneSetup(season: Season, route: RouteId) {
  setSceneRoute(route);
  sceneDay.route = ROUTES[route];
  // Runs during render, before the terrain, patch and meadow are built below.
  if (sceneSeason.key !== season) {
    const info = SEASONS[season];
    setSceneSeason(season, info.sceneSnowShift, season === 'september' ? 0.85 : 0);
  }
  const info = SEASONS[season];
  sceneDay.dawn = info.dawn;
  sceneDay.dusk = info.dusk;
  sceneDay.alpine = info.alpineStart + 1440 * ROUTES[route].bivouacs.length;
}

export interface LiveMove {
  /** Meters along the route. */
  dist: number;
  /** Meters off the boot track (+ = right when facing uphill). */
  lateral: number;
  /** Route meters per real second right now (0 when standing). */
  speed: number;
}

/** Wand models are built about 1 unit tall; real wands stand about 1.7 m. */
const PERSON = 1.7;
/** Rope length between partners on the glacier (m). */
const ROPE_M = 10;
/** How far below each stop you rejoin the party after the time-lapse cut (m). */
const WALK_IN_M = 14;

// ---------- terrain meshes ----------

/** Meters per repeat of the detail textures. */
const TILE_M = 14;

function gridSlope(g: Grid, r: number, c: number) {
  const n = g.n;
  const at = (rr: number, cc: number) => g.h[Math.max(0, Math.min(n - 1, rr)) * n + Math.max(0, Math.min(n - 1, cc))];
  const dx = (at(r, c + 1) - at(r, c - 1)) / (2 * g.step);
  const dz = (at(r + 1, c) - at(r - 1, c)) / (2 * g.step);
  const s = Math.hypot(dx, dz);
  return { deg: (Math.atan(s) * 180) / Math.PI, north: s > 1e-4 ? dz / s : 0 };
}

/** Builds a mesh for a height grid: exact heights, ground colors, world-aligned UVs. */
function terrainGeometry(g: Grid, opts: { lower?: (x: number, z: number) => number } = {}) {
  const geo = new THREE.PlaneGeometry(2 * g.half, 2 * g.half, g.n - 1, g.n - 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(g.cx, 0, g.cz);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const uvs = new Float32Array(pos.count * 2);
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const i = r * g.n + c;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = g.h[i] - (opts.lower ? opts.lower(x, z) : 0);
      pos.setY(i, y);
      const s = gridSlope(g, r, c);
      const [cr, cg, cb] = groundColor(x, g.h[i], z, s.deg, s.north);
      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
      uvs[i * 2] = x / TILE_M;
      uvs[i * 2 + 1] = z / TILE_M;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// The mountain and its surroundings only change with the season's snow, so build them once per
// season and share between screens.
const terrainCache = new Map<string, { coreGeo: THREE.BufferGeometry; farGeo: THREE.BufferGeometry; horizonGeo: THREE.BufferGeometry }>();
function staticTerrain() {
  const key = `${sceneMountain.id}:${sceneSeason.key}`;
  const hit = terrainCache.get(key);
  if (hit) return hit;
  const built = {
    coreGeo: terrainGeometry(CORE_MESH),
    // Each outer ring tucks under the one inside it, and follows the curve of the Earth.
    farGeo: terrainGeometry(FAR, { lower: (x, z) => earthDrop(x, z) + (inside(CORE_MESH, x, z, -400) ? 150 : 0) }),
    horizonGeo: terrainGeometry(HORIZON, { lower: (x, z) => earthDrop(x, z) + (inside(FAR, x, z, -2000) ? 400 : 0) }),
  };
  terrainCache.set(key, built);
  return built;
}

function useGroundMaterial(offset: number) {
  return useMemo(() => {
    const { grain, normal } = detailTextures();
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grain,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.93,
      metalness: 0,
      polygonOffset: offset !== 0,
      polygonOffsetFactor: offset,
      polygonOffsetUnits: offset,
    });
  }, [offset]);
}

/**
 * The core mesh (57 m triangles) can bulge a meter or two above the detail patch, which follows
 * the same terrain more closely; near the climber those big facets would cover the patch and even
 * the climber. Inside the patch, the core is not drawn. x, z: patch center; w: half size (0 = off).
 */
const patchClip = { value: new THREE.Vector3(0, 0, 0) };

function clipToPatch(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPatch = patchClip;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPatch;\nvarying vec2 vGroundXZ;')
      .replace(
        '#include <clipping_planes_fragment>',
        'if (uPatch.z > 0.0 && abs(vGroundXZ.x - uPatch.x) < uPatch.z && abs(vGroundXZ.y - uPatch.y) < uPatch.z) discard;\n#include <clipping_planes_fragment>',
      );
  };
  mat.customProgramCacheKey = () => 'clip-to-patch';
  return mat;
}

function StaticTerrain({ season, patch }: { season: string; patch: Grid | null }) {
  const { coreGeo: core, farGeo: far, horizonGeo: horizon } = useMemo(staticTerrain, [season, sceneMountain.id]);
  const coreBase = useGroundMaterial(3);
  const coreMat = useMemo(() => clipToPatch(coreBase), [coreBase]);
  useEffect(() => {
    // Leave a margin of a couple of grid steps so the seam at the patch edge stays covered.
    patchClip.value.set(patch?.cx ?? 0, patch?.cz ?? 0, patch ? patch.half - 2 * patch.step : 0);
  }, [patch]);
  const farMat = useGroundMaterial(6);
  const horizonMat = useGroundMaterial(10);
  return (
    <>
      <mesh geometry={horizon} material={horizonMat} />
      <mesh geometry={far} material={farMat} />
      <mesh geometry={core} material={coreMat} receiveShadow />
    </>
  );
}

/** Fair-weather cumulus drifting high over the Cascades. */
function SkyClouds({ amount }: { amount: React.MutableRefObject<number> }) {
  const mat = useMemo(() => {
    const t = cloudTexture(0.56, 0.14);
    t.repeat.set(3, 3);
    return new THREE.MeshBasicMaterial({ color: '#f3f5f8', map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }, []);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    mat.opacity = amount.current;
    if (mat.map) mat.map.offset.set(st.clock.elapsedTime * 0.0012, st.clock.elapsedTime * 0.0004);
    if (mesh.current) mesh.current.visible = amount.current > 0.02;
  });
  return (
    <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]} position={[0, 7200, 0]} material={mat}>
      <planeGeometry args={[160000, 160000, 1, 1]} />
    </mesh>
  );
}

/** A sea of cloud filling the lowlands on clear mornings, with the Cascade volcanoes poking through. */
function CloudSea({ amount }: { amount: React.MutableRefObject<number> }) {
  const mat = useMemo(() => {
    const t = cloudTexture();
    t.repeat.set(5, 5);
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, transparent: true, depthWrite: false, roughness: 1 });
  }, []);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    mat.opacity = amount.current;
    if (mesh.current) mesh.current.visible = amount.current > 0.02;
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1500, 0]} material={mat}>
      <planeGeometry args={[120000, 120000, 1, 1]} />
    </mesh>
  );
}

function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, inst: Instances) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, inst.matrices.length));
  mesh.count = inst.matrices.length;
  inst.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  inst.colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

const ROCK_GEO = rockGeometry();
const SERAC_GEO = seracGeometry();
const CREVASSE_GEO = crevasseGeometry();
const TREE_GEO = treeGeometry();
const GRASS_GEO = grassGeometry();
const FLOWER_GEO = flowerGeometry();

/** High-detail ground, boulders, seracs and crevasses around the climber. */
function DetailPatch({ patch }: { patch: Grid }) {
  const mat = useGroundMaterial(0);
  const geo = useMemo(() => terrainGeometry(patch), [patch]);
  const objects = useMemo(() => {
    const { rocks, seracs, crevasses, trees } = scatter(patch);
    const treeMesh = makeInstanced(TREE_GEO, swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 0.02), trees);
    const { grass, flowers } = meadowScatter(patch);
    const grassMesh = makeInstanced(
      GRASS_GEO,
      swaying(new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, roughness: 0.95 }), 0.07),
      grass,
    );
    grassMesh.receiveShadow = true;
    const flowerMesh = makeInstanced(FLOWER_GEO, swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 0.07), flowers);
    treeMesh.castShadow = true;
    treeMesh.receiveShadow = true;
    const rockMesh = makeInstanced(ROCK_GEO, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    const seracMesh = makeInstanced(
      SERAC_GEO,
      new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05, emissive: new THREE.Color('#0b2a40'), emissiveIntensity: 0.25 }),
      seracs,
    );
    seracMesh.castShadow = true;
    seracMesh.receiveShadow = true;
    const crevMesh = makeInstanced(
      CREVASSE_GEO,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      crevasses,
    );
    crevMesh.receiveShadow = true;
    return [rockMesh, seracMesh, crevMesh, treeMesh, grassMesh, flowerMesh];
  }, [patch]);
  useEffect(() => () => {
    geo.dispose();
    objects.forEach((o) => (o.material as THREE.Material).dispose());
  }, [geo, objects]);
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      {objects.map((o) => <primitive key={o.uuid} object={o} />)}
    </>
  );
}

// ---------- route, wands, camps ----------


function RouteTrack({ highlight }: { highlight: React.MutableRefObject<number> }) {
  // The trail: packed brown dirt through the meadows, a trampled boot track on snow.
  const track = useMemo(() => {
    const sub = 3;
    const positions: number[] = [];
    const colors: number[] = [];
    const DIRT = [0.24, 0.18, 0.12];
    const BOOT = [0.42, 0.44, 0.5];
    const index: number[] = [];
    const pts = ROUTE.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, , az] = pts[i];
      const [bx, , bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const ay = surfaceAt(ax, az);
      const s = slopeAt(ax, az);
      const snow = snowCover(ax, ay, az, s.deg, s.north);
      const W = 0.32 + (1 - snow) * 0.45;
      const sx = (-(bz - az) / len) * W;
      const sz = ((bx - ax) / len) * W;
      const c = DIRT.map((d, k) => d + (BOOT[k] - d) * snow);
      for (let k = 0; k < sub; k++) {
        const t = k / sub;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        positions.push(x + sx, surfaceAt(x + sx, z + sz) + 0.04, z + sz, x - sx, surfaceAt(x - sx, z - sz) + 0.04, z - sz);
        colors.push(...c, ...c);
      }
    }
    for (let j = 0; j < positions.length / 6 - 1; j++) {
      const a = j * 2;
      index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }, []);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(ROUTE.pts.map(([x, y, z]) => new THREE.Vector3(x, y + 4, z)));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ff6a2b', transparent: true, opacity: 0, depthTest: false }));
    l.renderOrder = 10;
    l.frustumCulled = false;
    return l;
  }, []);
  useFrame(() => {
    const m = line.material as THREE.LineBasicMaterial;
    m.opacity = highlight.current;
    line.visible = highlight.current > 0.02;
  });
  return (
    <>
      <mesh geometry={track} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={1}
          transparent
          opacity={0.7}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <primitive object={line} />
    </>
  );
}

function Wand({ p }: { p: Vec3 }) {
  return (
    <group position={p} scale={PERSON}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.9, 5]} />
        <meshStandardMaterial color="#c9a46a" />
      </mesh>
      <mesh position={[0.07, 0.83, 0]}>
        <boxGeometry args={[0.14, 0.09, 0.01]} />
        <meshStandardMaterial color="#ff4f1f" emissive="#a02a0a" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

const onGround = (x: number, z: number, dy = 0): Vec3 => [x, surfaceAt(x, z) + dy, z];

function RouteMarkers({ wands, patchId }: { wands: boolean; patchId: number }) {
  const R = sceneDay.route;
  // Positions depend on the detail patch, so recompute when it changes.
  const { nodeWands, fieldWands, camp, paradise } = useMemo(() => {
    const nodeWands = R.nodes.map((_, i) => i).filter((i) => i > 0 && i < R.nodes.length - 1 && i !== R.camp).map((i) => {
      const [x, , z] = nodePosition(i);
      return onGround(x + 3, z + 2);
    });
    // Your wands go in on the big snowfield below camp.
    const fieldWands: Vec3[] = [];
    const leg = R.legs.findIndex((l) => l.hazards.whiteout);
    if (leg >= 0) {
      for (let i = ROUTE.nodeIndex[leg] + 6; i < ROUTE.nodeIndex[leg + 1]; i += 7) {
        const [x, , z] = ROUTE.pts[i];
        fieldWands.push(onGround(x + 1.5, z));
      }
    }
    return { nodeWands, fieldWands, camp: R.camp, paradise: R.nodes[0].name === 'Paradise' ? nodePosition(0) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchId, R]);
  return (
    <group>
      {nodeWands.map((p, i) => <Wand key={i} p={p} />)}
      {wands && fieldWands.map((p, i) => <Wand key={`w${i}`} p={p} />)}
      <HighCamp node={camp} patchId={patchId} route={R} />
      {R.bivouacs.map((b) => <HighCamp key={b} node={b} patchId={patchId} route={R} small />)}
      {paradise && <ParadiseInn at={paradise} />}
    </group>
  );
}

/**
 * High camp. Camp Muir: the stone public shelter, the guide hut, a toilet, and tents on the snow.
 * Camp Schurman: the ranger hut and tents. Elsewhere, a few tents (a single one at a bivouac).
 */
function HighCamp({ node, patchId, route, small }: { node: number; patchId: number; route: RouteDef; small?: boolean }) {
  const items = useMemo(() => {
    const at = nodePosition(node);
    // Lay the camp out beside the track: huts on the ridge to one side, tents on the snow to the other.
    const i0 = ROUTE.nodeIndex[node];
    const a = ROUTE.pts[i0 - 2];
    const b = ROUTE.pts[i0 + 2];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const fx = (b[0] - a[0]) / len;
    const fz = (b[2] - a[2]) / len;
    const side = (along: number, across: number) => onGround(at[0] + fx * along - fz * across, at[2] + fz * along + fx * across);
    const rot = Math.atan2(fx, fz);
    const huts: { p: Vec3; size: Vec3; rot: number; color: string }[] = route.id === 'dc' ? [
      { p: side(-6, -20), size: [11, 3.4, 5.5], rot, color: '#6b645b' },
      { p: side(12, -26), size: [8, 3, 5], rot, color: '#5f5953' },
      { p: side(-22, -16), size: [3, 2.6, 3], rot, color: '#7a6f62' },
    ] : route.id === 'emmons' && !small ? [
      { p: side(4, -18), size: [4, 2.8, 4], rot, color: '#6b645b' },
    ] : [];
    const tents: { p: Vec3; rot: number; color: string }[] = [];
    const all = ['#e8b923', '#d9472b', '#2f7d4f', '#e8b923', '#c8322b', '#3a6fb0'];
    const colors = small ? all.slice(0, 1) : route.id === 'dc' ? all : route.id === 'emmons' ? all.slice(0, 4) : all.slice(0, 2);
    for (let i = 0; i < colors.length; i++) {
      tents.push({ p: side(-10 + (i % 3) * 8, 18 + Math.floor(i / 3) * 8), rot: rot + i * 0.7, color: colors[i] });
    }
    return { huts, tents };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, patchId, route, small]);
  return (
    <group>
      {items.huts.map((h, i) => (
        <group key={`h${i}`} position={h.p} rotation={[0, h.rot, 0]}>
          <mesh position={[0, h.size[1] / 2 - 0.3, 0]} castShadow receiveShadow>
            <boxGeometry args={h.size} />
            <meshStandardMaterial color={h.color} roughness={1} />
          </mesh>
          <mesh position={[0, h.size[1] - 0.2, 0]} castShadow>
            <boxGeometry args={[h.size[0] + 0.4, 0.25, h.size[2] + 0.4]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.7} metalness={0.2} />
          </mesh>
        </group>
      ))}
      {items.tents.map((t, i) => (
        <mesh key={`t${i}`} position={t.p} rotation={[0, t.rot, 0]} scale={[1.4, 1.1, 1.0]} castShadow receiveShadow>
          <sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={t.color} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Paradise: the lodge's steep green roof at the trailhead. */
function ParadiseInn({ at }: { at: Vec3 }) {
  const p = useMemo(() => onGround(at[0] - 60, at[2] + 40), [at]);
  return (
    <group position={p} rotation={[0, 0.2, 0]}>
      <mesh position={[0, 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[60, 8, 18]} />
        <meshStandardMaterial color="#6e5a44" roughness={1} />
      </mesh>
      <mesh position={[0, 11, 0]} rotation={[0, 0, 0]} scale={[1, 0.55, 1]}>
        <cylinderGeometry args={[0.01, 12, 12, 4, 1, false, Math.PI / 4]} />
        <meshStandardMaterial color="#3d5a3f" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ---------- other rope teams ----------

/**
 * Parties leaving Camp Muir on summit day, minutes relative to our 12:30 AM alpine start.
 * On a busy July night teams leave between about 11 PM and 2 AM; this spread is representative.
 */
const TEAM_STARTS = [-55, -30, 25, 50, 80];
const TEAM_SIZE = 3;
const TEAM_GAP_M = 9;

/** Where a team is (meters along the route) at a given clock, or null when off the route. */
function teamDist(clock: number, start: number) {
  const { camp, legs } = sceneDay.route;
  const summit = legs.length;
  const nodeD = (k: number) => ROUTE.cum[ROUTE.nodeIndex[k]];
  let t = clock - (sceneDay.alpine + start);
  if (t < -40) return null; // still in the hut or tent
  if (t < 0) return nodeD(camp) + 15; // gearing up outside
  // Up at standard pace, 20 minutes on top, down at half the time.
  for (let k = camp; k < summit; k++) {
    const m = legs[k].minutes;
    if (t < m) return nodeD(k) + (nodeD(k + 1) - nodeD(k)) * (t / m);
    t -= m;
  }
  if (t < 20) return nodeD(summit);
  t -= 20;
  for (let k = summit; k > camp; k--) {
    const m = legs[k - 1].minutes * 0.5;
    if (t < m) return nodeD(k) - (nodeD(k) - nodeD(k - 1)) * (t / m);
    t -= m;
  }
  return null; // back in camp
}

function glowTexture() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, 1 - d);
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 244;
      data[i + 2] = 214;
      data[i + 3] = Math.round(Math.pow(a, 2.2) * 255);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Other parties on the route: small figures by day, a string of headlamps by night. */
function OtherTeams({ teams, clock, night, player }: {
  teams: number[];
  clock: number;
  night: React.MutableRefObject<number>;
  player: React.MutableRefObject<THREE.Vector3>;
}) {
  const count = teams.length * TEAM_SIZE;
  const { bodies, lamps } = useMemo(() => {
    // Distant figures: a slim silhouette is all you see of another party.
    const geo = new THREE.CapsuleGeometry(0.19, 1.3, 4, 8);
    geo.translate(0, 0.86, 0);
    const bodies = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    const palette = ['#8e2a24', '#24456e', '#9a6c1a', '#2d4f3d', '#3a3f4a'];
    for (let i = 0; i < count; i++) bodies.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    bodies.frustumCulled = false;
    const tex = glowTexture();
    const lamps = Array.from({ length: count }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: '#fff3d6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        sizeAttenuation: false, fog: false,
      }));
      s.scale.setScalar(0.022);
      return s;
    });
    return { bodies, lamps };
  }, [count]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const latest = useRef(clock);
  latest.current = clock;

  useFrame(() => {
    const lit = night.current > 0.35;
    let k = 0;
    teams.forEach((start) => {
      const lead = teamDist(latest.current, start);
      for (let j = 0; j < TEAM_SIZE; j++, k++) {
        const lamp = lamps[k];
        if (lead === null) {
          m.makeScale(0, 0, 0);
          bodies.setMatrixAt(k, m);
          lamp.visible = false;
          continue;
        }
        const d = lead - j * TEAM_GAP_M;
        const f = Math.max(0, routeIndexAt(d));
        const i = Math.floor(f);
        const a = ROUTE.pts[i];
        const b = ROUTE.pts[Math.min(ROUTE.pts.length - 1, i + 1)];
        const t = f - i;
        const x = a[0] + (b[0] - a[0]) * t + (j - 1) * 0.4;
        const z = a[2] + (b[2] - a[2]) * t;
        const y = surfaceAt(x, z);
        // Don't stand inside the player's own party.
        const tooClose = Math.hypot(x - player.current.x, z - player.current.z) < 22;
        m.makeTranslation(x, y, z);
        if (tooClose) m.makeScale(0, 0, 0);
        bodies.setMatrixAt(k, m);
        lamp.visible = lit && !tooClose;
        lamp.position.set(x, y + 1.75, z);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={bodies} />
      {lamps.map((l, i) => <primitive key={i} object={l} />)}
    </>
  );
}

// ---------- night sky ----------

function Stars({ night }: { night: React.MutableRefObject<number> }) {
  const geometry = useMemo(() => {
    const n = 600;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = (0.05 + Math.random() * 0.45) * Math.PI;
      arr[i * 3] = Math.cos(u) * Math.cos(v) * 100000;
      arr[i * 3 + 1] = Math.sin(v) * 100000;
      arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * 100000;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  const pts = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (mat.current) mat.current.opacity = night.current;
    if (pts.current) pts.current.position.copy(camera.position);
  });
  return (
    <points ref={pts} geometry={geometry} frustumCulled={false}>
      <pointsMaterial ref={mat} color="#ffffff" size={2} sizeAttenuation={false} transparent opacity={0} fog={false} />
    </points>
  );
}

function Snowfall({ intensity, center }: { intensity: React.MutableRefObject<number>; center: React.MutableRefObject<THREE.Vector3> }) {
  const n = 900;
  const { geometry, speeds } = useMemo(() => {
    const arr = new Float32Array(n * 3);
    const sp = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 24;
      arr[i * 3 + 1] = Math.random() * 14;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 24;
      sp[i] = 1.5 + Math.random() * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return { geometry: g, speeds: sp };
  }, []);
  const pts = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  useFrame((_, dt) => {
    if (!pts.current || !mat.current) return;
    mat.current.opacity = intensity.current;
    pts.current.visible = intensity.current > 0.02;
    if (!pts.current.visible) return;
    pts.current.position.copy(center.current).add(new THREE.Vector3(0, -4, 0));
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      let y = pos.getY(i) - speeds[i] * dt;
      let x = pos.getX(i) + dt * 5; // wind drift
      if (y < 0) y += 14;
      if (x > 12) x -= 24;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={pts} geometry={geometry} frustumCulled={false}>
      <pointsMaterial ref={mat} color="#ffffff" size={0.06} transparent opacity={0} />
    </points>
  );
}

// ---------- sky dome and sun ----------

const DOME_R = 2400;

/** A gradient sky: deep color overhead, hazy and pale toward the horizon. */
function SkyDome({ zenith, horizon }: { zenith: THREE.Color; horizon: THREE.Color }) {
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(DOME_R, 32, 16);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, []);
  const mesh = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.copy(camera.position);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / DOME_R;
      const t = y <= 0 ? 0 : Math.pow(y, 0.45);
      tmp.copy(horizon).lerp(zenith, t);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  });
  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={-1} frustumCulled={false}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

function SunDisc({ dir, strength }: { dir: React.MutableRefObject<THREE.Vector3>; strength: React.MutableRefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  useFrame(() => {
    const s = strength.current;
    for (const [ref, size] of [[mesh, 40], [glow, 160]] as const) {
      if (!ref.current) continue;
      ref.current.visible = s > 0.02;
      ref.current.position.copy(camera.position).addScaledVector(dir.current, 2000);
      ref.current.lookAt(camera.position);
      ref.current.scale.setScalar(size);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = (ref === glow ? 0.18 : 1) * s;
    }
  });
  return (
    <>
      <mesh ref={glow} renderOrder={-1} frustumCulled={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#fff1d6" transparent fog={false} depthWrite={false} />
      </mesh>
      <mesh ref={mesh} renderOrder={-1} frustumCulled={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#fffaf0" transparent fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}

// ---------- lighting and weather ----------

const SKY_NIGHT = new THREE.Color('#0a1424');
const SKY_DAY = new THREE.Color('#7fb3e0');
const SKY_DAWN = new THREE.Color('#e9946b');
const SKY_WHITEOUT = new THREE.Color('#dde3e8');
const SKY_STORM = new THREE.Color('#5d6670');
const WHITE = new THREE.Color('#ffffff');

function daylight(clock: number) {
  const m = minuteOfDay(clock);
  const t = (m - sceneDay.dawn) / (sceneDay.dusk - sceneDay.dawn);
  if (t <= 0 || t >= 1) return { day: 0, dawn: 0 };
  const day = Math.min(1, Math.sin(Math.PI * t) * 1.6);
  const dawn = t < 0.15 ? 1 - t / 0.15 : t > 0.85 ? (t - 0.85) / 0.15 : 0;
  return { day, dawn };
}

/**
 * Exponential haze density. Clear July air: ridges 50 km away turn blue, Mount Hood at 160 km is
 * a pale shape. In a whiteout you see a rope length.
 */
function fogFor(weather: Weather) {
  switch (weather) {
    case 'whiteout': return 0.03;
    case 'storm': return 0.012;
    case 'windy': return 0.000022;
    case 'coldsnap': return 0.000014;
    default: return 0.0000095;
  }
}

// ---------- the live world ----------

function World(props: SceneProps) {
  const season = props.season ?? 'july';
  const routeId = props.route ?? 'dc';
  useSceneSetup(season, routeId);
  const { scene, camera, size, gl } = useThree();
  const shotRef = props.shot;
  useEffect(() => {
    if (!shotRef) return;
    // Render a fresh frame and read it straight back, before the buffer is presented and cleared.
    shotRef.current = async () => {
      try {
        gl.render(scene, camera);
        if (Platform.OS === 'web') {
          const canvas = (gl.getContext() as WebGLRenderingContext).canvas as HTMLCanvasElement;
          return canvas.toDataURL('image/jpeg', 0.72);
        }
        const snap = await GLView.takeSnapshotAsync(gl.getContext() as never, { format: 'jpeg', compress: 0.72 });
        return typeof snap.uri === 'string' ? snap.uri : null;
      } catch (e) {
        console.warn('Summit photo failed', e);
        return null;
      }
    };
    return () => { shotRef.current = null; };
  }, [shotRef, gl, scene, camera]);
  const motion = useRef<Motion>({ walking: false, phase: 0 });
  const partnerMotion = useRef<Motion>({ walking: false, phase: 1.5 });
  const climber = useRef<THREE.Group>(null);
  const partner = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const lamp = useRef<THREE.SpotLight>(null);
  const lampTarget = useRef<THREE.Object3D>(new THREE.Object3D());
  const pos = useRef(ROUTE.nodeIndex[props.node]);
  const speed = useRef(0.15);
  const snapCamera = useRef(true);
  const lateral = useRef(0);
  const moveSign = useRef(1);
  const playerPos = useRef(new THREE.Vector3());
  const lastTarget = useRef(ROUTE.nodeIndex[props.node]);
  const heading = useRef(0);
  const camTarget = useRef(new THREE.Vector3(...nodePosition(props.node)));
  const night = useRef(0);
  const snow = useRef(0);
  const orbit = useRef(0);
  const sunDir = useRef(new THREE.Vector3(0, 1, 0));
  const sunStrength = useRef(0);
  const routeHighlight = useRef(0);

  const sky = useMemo(() => new THREE.Color(SKY_DAY), []);
  const zenith = useMemo(() => new THREE.Color(SKY_DAY), []);
  const horizon = useMemo(() => new THREE.Color(SKY_DAY), []);
  const fog = useMemo(() => new THREE.FogExp2(SKY_DAY.getHex(), 0.00001), []);
  const clouds = useRef(0);
  const cumulus = useRef(0);

  const follow = props.mode === 'follow';
  const [patch, setPatch] = useState<Grid | null>(() => {
    if (!follow) return null;
    const [x, , z] = nodePosition(props.node);
    return buildPatch(x, z);
  });

  const rope = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    return g;
  }, []);
  const ropeObj = useMemo(() => new THREE.Line(rope, new THREE.LineBasicMaterial({ color: '#2f9fd8' })), [rope]);

  useEffect(() => {
    scene.background = sky;
    scene.fog = fog;
    scene.add(lampTarget.current);
  }, [scene, sky, fog]);

  const latest = useRef(props);
  latest.current = props;

  const at = (f: number) => {
    const clamped = Math.max(0, Math.min(ROUTE.pts.length - 1, f));
    const i = Math.floor(clamped);
    const j = Math.min(ROUTE.pts.length - 1, i + 1);
    const t = clamped - i;
    const a = ROUTE.pts[i];
    const b = ROUTE.pts[j];
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    return new THREE.Vector3(x, surfaceAt(x, z), z);
  };

  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    tickWind(st.clock.elapsedTime);
    const p = latest.current;
    const live = follow ? p.live?.current : undefined;
    const target = live ? routeIndexAt(live.dist) : ROUTE.nodeIndex[p.node];

    if (live) {
      // Thumbstick: follow the live position closely; jump if it moved far (e.g. a new climb).
      const gap = target - pos.current;
      pos.current = Math.abs(gap) > 60 ? target : pos.current + gap * Math.min(1, dt * 12);
      if (Math.abs(gap) > 60) snapCamera.current = true;
      lastTarget.current = target;
      lateral.current += (live.lateral - lateral.current) * Math.min(1, dt * 6);
    }
    // --- move along the route (title screen / no thumbstick) ---
    // A leg takes hours, so the screen cuts ahead (the climb screen fades) and you rejoin the
    // party a short way below the next stop, walking in at a real uphill pace.
    if (!live && target !== lastTarget.current) {
      const dir = Math.sign(target - pos.current) || 1;
      const walkIn = WALK_IN_M / ROUTE_SPACING;
      if (Math.abs(target - pos.current) > walkIn * 1.5) {
        pos.current = target - dir * walkIn;
        snapCamera.current = true;
      }
      speed.current = (p.facing === 'down' ? 1.4 : 0.9) / ROUTE_SPACING;
      lastTarget.current = target;
      if (follow) {
        const [tx, , tz] = ROUTE.pts[target];
        setPatch(buildPatch(tx, tz));
      }
    }
    const diff = target - pos.current;
    const walking = live ? live.speed > 0.15 : Math.abs(diff) > 0.01;
    if (!live) pos.current = walking ? pos.current + Math.sign(diff) * Math.min(Math.abs(diff), dt * speed.current) : target;
    motion.current.walking = walking;
    partnerMotion.current.walking = walking;
    motion.current.speed = live ? live.speed : 1.3;
    partnerMotion.current.speed = motion.current.speed;
    if (live && walking) moveSign.current = Math.sign(diff) || moveSign.current;

    const onTrack = at(pos.current);
    const here = onTrack.clone();
    if (live && Math.abs(lateral.current) > 0.01) {
      // Step sideways off the track, perpendicular to the route (right of uphill is +).
      const fwd = at(pos.current + 1).sub(onTrack).setY(0).normalize();
      here.x += -fwd.z * lateral.current;
      here.z += fwd.x * lateral.current;
      here.y = surfaceAt(here.x, here.z);
    }
    // Walking: face the way you move. Stopped: turn to face the next stretch of the route.
    const facingDir = walking ? (live ? moveSign.current : Math.sign(diff)) : p.facing === 'down' && p.node > 0 ? -1 : 1;
    const ahead = at(pos.current + (12 / ROUTE_SPACING) * facingDir);
    const wantHeading = Math.atan2(ahead.x - here.x, ahead.z - here.z);
    if (Number.isFinite(wantHeading)) {
      let d = wantHeading - heading.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading.current += d * Math.min(1, dt * (walking ? 10 : 2));
    }
    playerPos.current.copy(here);
    if (climber.current) {
      climber.current.position.copy(here);
      climber.current.rotation.y = heading.current;
    }

    // Keep the detail patch under the climber. Walking, rebuild a little ahead of the edge.
    if (follow && (live || !walking)) {
      const cur = currentPatch();
      const reach = live ? PATCH_HALF * 0.42 : PATCH_HALF * 0.6;
      if (!cur || Math.hypot(here.x - cur.cx, here.z - cur.cz) > reach) {
        const lead = at(pos.current + (220 / ROUTE_SPACING) * (live ? moveSign.current : 0));
        setPatch(buildPatch((here.x + lead.x) / 2, (here.z + lead.z) / 2));
      }
    }

    // Partner trails a rope length behind.
    const back = (ROPE_M / ROUTE_SPACING) * (walking ? (live ? moveSign.current : Math.sign(diff)) : p.node === 0 ? -1 : 1);
    const ph = at(pos.current - back);
    if (partner.current) {
      partner.current.visible = follow;
      partner.current.position.copy(ph);
      partner.current.lookAt(here.x, ph.y, here.z);
    }
    const ropeOn = follow && p.roped && pos.current >= ROUTE.nodeIndex[2] + 20;
    ropeObj.visible = ropeOn;
    if (ropeOn) {
      const arr = rope.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < 16; k++) {
        const t = k / 15;
        const x = here.x + (ph.x - here.x) * t;
        const z = here.z + (ph.z - here.z) * t;
        const y = here.y + 0.9 + (ph.y - here.y) * t - Math.sin(Math.PI * t) * 0.7;
        arr.setXYZ(k, x, Math.max(y, surfaceAt(x, z) + 0.05), z);
      }
      arr.needsUpdate = true;
    }

    // --- sky, light, fog ---
    const { day, dawn } = daylight(p.clock);
    night.current += (1 - day - night.current) * Math.min(1, dt * 1.5);
    const want = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DAWN, dawn * 0.55);
    if (p.weather === 'whiteout') want.lerp(SKY_WHITEOUT, 0.85 * Math.max(0.3, day));
    if (p.weather === 'storm') want.lerp(SKY_STORM, 0.8 * Math.max(0.3, day));
    sky.lerp(want, Math.min(1, dt * 1.5));
    // Thinner air above you: the sky overhead deepens toward navy as you climb.
    const thin = Math.max(0, Math.min(1, ((follow ? here.y : 3500) - 1600) / 2800));
    zenith.copy(sky).multiplyScalar(0.6 - 0.22 * thin).lerp(SKY_NIGHT, night.current * 0.5);
    horizon.copy(sky).lerp(WHITE, 0.35 * day).lerp(SKY_NIGHT, night.current * 0.35);
    fog.color.copy(horizon);
    scene.background = horizon;
    const density = follow ? fogFor(p.weather) : 0.0000075;
    fog.density += (density - fog.density) * Math.min(1, dt * 1.5);
    // Morning cloud sea below the mountain when the weather is settled.
    const mod = minuteOfDay(p.clock) / 60;
    const settled = p.weather === 'clear' || p.weather === 'coldsnap' ? 1 : p.weather === 'windy' ? 0.5 : 0;
    const morning = mod > 5 && mod < 13 ? 1 - Math.max(0, mod - 10) / 3 : 0.35;
    clouds.current += (settled * morning * 0.95 * Math.max(0.25, day) - clouds.current) * Math.min(1, dt);
    // Afternoon cumulus build over the range; none in a whiteout (you're inside the cloud).
    const build = p.weather === 'clear' ? 0.55 + 0.3 * Math.max(0, Math.min(1, (mod - 10) / 5)) : p.weather === 'windy' ? 0.8 : 0;
    cumulus.current += (build * Math.max(0.15, day) - cumulus.current) * Math.min(1, dt);

    if (sun.current) {
      const m = minuteOfDay(p.clock);
      const ang = ((m - sceneDay.dawn) / (sceneDay.dusk - sceneDay.dawn)) * Math.PI;
      // Summer sun: rises in the northeast, high in the south at noon, sets in the northwest.
      sunDir.current.set(Math.cos(ang) * 0.8, Math.max(0.05, Math.sin(ang) * 0.9), 0.35 + Math.sin(ang) * 0.4).normalize();
      const focus = follow ? here : new THREE.Vector3(...SUMMIT_POS);
      sun.current.position.copy(focus).addScaledVector(sunDir.current, 400);
      sun.current.target.position.copy(focus);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity += (0.15 + day * 2.6 - sun.current.intensity) * Math.min(1, dt * 2);
      sun.current.color.set(dawn > 0.1 ? '#ffbe94' : '#fff4e2');
      const clouded = p.weather === 'whiteout' || p.weather === 'storm' ? 0 : p.weather === 'windy' ? 0.7 : 1;
      sunStrength.current = Math.min(1, day * 1.5) * clouded;
    }
    if (hemi.current) {
      // Starlight on snow is faint but blue and real; never let the night go black.
      hemi.current.intensity += (0.55 + day * 0.65 - hemi.current.intensity) * Math.min(1, dt * 2);
      hemi.current.color.set(day > 0.2 ? '#cfe3ff' : '#6f88b8');
    }
    if (lamp.current) {
      const on = p.look.headlamp && day < 0.35 && follow;
      lamp.current.intensity += ((on ? 450 : 0) - lamp.current.intensity) * Math.min(1, dt * 4);
      const fwd = new THREE.Vector3(Math.sin(heading.current), -0.35, Math.cos(heading.current));
      lamp.current.position.set(here.x, here.y + 1.75, here.z);
      lampTarget.current.position.copy(here).add(fwd.multiplyScalar(10));
      lamp.current.target = lampTarget.current;
    }
    routeHighlight.current += ((follow && p.control.current.overview ? 1 : 0) - routeHighlight.current) * Math.min(1, dt * 4);
    snow.current += ((p.weather === 'storm' || p.weather === 'whiteout' ? 0.9 : 0) - snow.current) * Math.min(1, dt);

    // --- camera ---
    const c = p.control.current;
    let camPos: THREE.Vector3;
    let look: THREE.Vector3;
    if (!follow) {
      // Title: a slow helicopter orbit around the summit.
      orbit.current += dt * 0.025;
      camPos = new THREE.Vector3(SUMMIT_POS[0] + Math.sin(orbit.current) * 15000, 3500, SUMMIT_POS[2] + Math.cos(orbit.current) * 15000);
      look = new THREE.Vector3(SUMMIT_POS[0], 2700, SUMMIT_POS[2]);
    } else if (c.overview) {
      const yaw = c.yaw + 0.35;
      // The overview frames the climber and the top of this route.
      const top = ROUTE.pts[ROUTE.pts.length - 1];
      const mid = new THREE.Vector3((here.x + top[0]) / 2, 0, (here.z + top[2]) / 2);
      camPos = new THREE.Vector3(mid.x + Math.sin(yaw) * 6500, 4300, mid.z + Math.cos(yaw) * 6500);
      look = new THREE.Vector3(mid.x, (here.y + top[1]) / 2 - 300, mid.z);
    } else {
      // Over the shoulder at head height, looking along the route, tilted with the slope ahead
      // so the mountain fills the frame above the climber.
      const yaw = heading.current + Math.PI + c.yaw;
      const d = c.dist;
      camPos = new THREE.Vector3(here.x + Math.sin(yaw) * d, here.y + 1.9 + d * 0.06, here.z + Math.cos(yaw) * d);
      const ground = surfaceAt(camPos.x, camPos.z) + 1.2;
      if (camPos.y < ground) camPos.y = ground;
      // Keep a clear line of sight to the climber's chest over any bump in between.
      const eyeY = here.y + 1.3;
      for (let k = 1; k <= 6; k++) {
        const t = k / 7;
        const gx = here.x + (camPos.x - here.x) * t;
        const gz = here.z + (camPos.z - here.z) * t;
        const need = eyeY + (surfaceAt(gx, gz) + 0.5 - eyeY) / t;
        if (camPos.y < need) camPos.y = need;
      }
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const far = at(pos.current + (60 / ROUTE_SPACING) * facingDir);
      const rise = Math.max(-0.3, Math.min(0.6, (far.y - here.y) / 60));
      look = here.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(fwd, 25);
      look.y += 25 * (0.07 + rise * 0.5);
      // Below a steep stretch the view tilts up the slope; never so far that the climber drops
      // behind the controls and panel at the bottom of the screen (~12° below center at most).
      const chest = here.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(camPos);
      const toLook = look.clone().sub(camPos);
      const flat = (v: THREE.Vector3) => Math.hypot(v.x, v.z) || 1e-3;
      const pitchClimber = Math.atan2(chest.y, flat(chest));
      const pitchLook = Math.atan2(toLook.y, flat(toLook));
      if (pitchLook - pitchClimber > 0.21) look.y = camPos.y + flat(toLook) * Math.tan(pitchClimber + 0.21);
    }
    if (snapCamera.current) {
      camera.position.copy(camPos);
      camTarget.current.copy(look);
      snapCamera.current = false;
    } else {
      camera.position.lerp(camPos, Math.min(1, dt * (follow ? 4 : 1)));
      camTarget.current.lerp(look, Math.min(1, dt * 5));
    }
    // Never let the camera slip under the snow.
    const floor = surfaceAt(camera.position.x, camera.position.z) + 0.8;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(camTarget.current);

    const shift = p.viewShift ?? 0;
    const cam = camera as THREE.PerspectiveCamera;
    if (shift > 0) cam.setViewOffset(size.width, size.height, 0, size.height * shift, size.width, size.height);
    else if (cam.view) cam.clearViewOffset();
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe3ff', '#3a4436', 1]} />
      <directionalLight
        ref={sun}
        intensity={2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={900}
        shadow-bias={-0.0005}
      />
      <spotLight ref={lamp} angle={0.62} penumbra={0.95} distance={45} decay={2} intensity={0} color="#fff3cf" />
      <SkyDome zenith={zenith} horizon={horizon} />
      <SunDisc dir={sunDir} strength={sunStrength} />
      <Stars night={night} />
      <StaticTerrain season={season} patch={patch} />
      {patch && <DetailPatch patch={patch} />}
      <RouteTrack highlight={routeHighlight} />
      <RouteMarkers wands={props.wands} patchId={patch ? patch.cx * 1e5 + patch.cz : 0} />
      {follow && sceneDay.route.teams > 0 && (
        <OtherTeams key={routeId} teams={TEAM_STARTS.slice(0, sceneDay.route.teams)} clock={props.clock} night={night} player={playerPos} />
      )}
      <CloudSea amount={clouds} />
      <SkyClouds amount={cumulus} />
      <Snowfall intensity={snow} center={camTarget} />
      <group ref={climber}>
        <Climber look={props.look} motion={motion} />
      </group>
      <group ref={partner}>
        <Climber look={props.partnerLook} motion={partnerMotion} />
      </group>
      <primitive object={ropeObj} />
    </>
  );
}

export function MountainScene(props: SceneProps) {
  const start = nodePosition(props.node);
  return (
    <Canvas
      frameloop={props.paused ? 'never' : 'always'}
      shadows
      camera={{ position: [start[0], start[1] + 4, start[2] + 8], fov: 62, near: 0.5, far: 400000 }}
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.05; }}
    >
      <World {...props} />
    </Canvas>
  );
}
