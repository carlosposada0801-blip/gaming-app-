import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Climber, type ClimberLook, type Motion } from './Climber';
import {
  ROUTE, TERRAIN_SEGMENTS, TERRAIN_SIZE, heightAt, nodePosition, terrainColor, type Vec3,
} from './terrain';
import { minuteOfDay } from '../game/route';
import type { Weather } from '../game/types';

export interface CameraControl {
  yaw: number; // extra orbit angle from drag
  dist: number; // follow distance
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
}

// ---------- static world pieces ----------

function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      const [r, gg, b] = terrainColor(x, y, z, slope);
      colors[i * 3] = r;
      colors[i * 3 + 1] = gg;
      colors[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
    </mesh>
  );
}

const TRACK = new THREE.Color('#5b4f45');
const TRACK_HIGHLIGHT = new THREE.Color('#ff6a2b');

/** The boot track: a faint trench in the snow, highlighted orange in route view. */
function RouteLine({ highlight }: { highlight: React.MutableRefObject<number> }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROUTE.pts.map(([x, y, z]) => new THREE.Vector3(x, y + 0.04, z)));
    return new THREE.TubeGeometry(curve, ROUTE.pts.length * 4, 0.05, 5, false);
  }, []);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (!mat.current) return;
    const h = highlight.current;
    mat.current.color.copy(TRACK).lerp(TRACK_HIGHLIGHT, h);
    mat.current.opacity = 0.45 + 0.4 * h;
  });
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial ref={mat} color={TRACK} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

function Wand({ p }: { p: Vec3 }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.9, 4]} />
        <meshStandardMaterial color="#c9a46a" />
      </mesh>
      <mesh position={[0.07, 0.83, 0]}>
        <boxGeometry args={[0.14, 0.09, 0.01]} />
        <meshStandardMaterial color="#ff4f1f" emissive="#a02a0a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function RouteMarkers({ wands }: { wands: boolean }) {
  const camps = useMemo(() => [1, 2, 3, 4, 5, 6].map((i) => nodePosition(i)), []);
  const wandPts = useMemo(() => {
    const out: Vec3[] = [];
    for (let i = ROUTE.nodeIndex[1] + 1; i < ROUTE.nodeIndex[2]; i += 2) {
      const [x, , z] = ROUTE.pts[i];
      out.push([x + 0.7, heightAt(x + 0.7, z), z]);
    }
    return out;
  }, []);
  const muir = nodePosition(2);
  return (
    <group>
      {camps.map((p, i) => <Wand key={i} p={[p[0] - 0.8, p[1], p[2]]} />)}
      {wands && wandPts.map((p, i) => <Wand key={`w${i}`} p={p} />)}
      {/* Camp Muir: the stone huts and a couple of tents */}
      {[[-2.2, 0.4], [-1.2, 1.8]].map(([dx, dz], i) => {
        const y = heightAt(muir[0] + dx, muir[2] + dz);
        return (
          <group key={`hut${i}`} position={[muir[0] + dx, y, muir[2] + dz]}>
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[1.6, 0.8, 1.0]} />
              <meshStandardMaterial color="#6b655d" roughness={1} />
            </mesh>
            <mesh position={[0, 0.84, 0]}>
              <boxGeometry args={[1.7, 0.08, 1.1]} />
              <meshStandardMaterial color="#3d4248" roughness={0.8} />
            </mesh>
          </group>
        );
      })}
      {[[1.8, 0.6, '#e8b923'], [2.6, -0.6, '#d9472b']].map(([dx, dz, c], i) => (
        <mesh
          key={`tent${i}`}
          position={[muir[0] + (dx as number), heightAt(muir[0] + (dx as number), muir[2] + (dz as number)), muir[2] + (dz as number)]}
          rotation={[0, 0.6, 0]}
          scale={[0.42, 0.3, 0.32]}
        >
          <sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={c as string} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Crevasses() {
  const slabs = useMemo(() => {
    const out: { p: Vec3; rot: number; len: number }[] = [];
    const legs = [2, 4, 5];
    let seed = 3;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (const leg of legs) {
      for (let i = ROUTE.nodeIndex[leg] + 2; i < ROUTE.nodeIndex[leg + 1]; i += 3) {
        const a = ROUTE.pts[i];
        const b = ROUTE.pts[i + 1] ?? a;
        const dir = Math.atan2(b[2] - a[2], b[0] - a[0]);
        const side = rnd() < 0.5 ? -1 : 1;
        const off = 2 + rnd() * 5;
        const x = a[0] + Math.cos(dir + Math.PI / 2) * off * side;
        const z = a[2] + Math.sin(dir + Math.PI / 2) * off * side;
        out.push({ p: [x, heightAt(x, z) + 0.02, z], rot: -dir + (rnd() - 0.5) * 0.6, len: 2 + rnd() * 3 });
      }
    }
    return out;
  }, []);
  return (
    <group>
      {slabs.map((c, i) => (
        <group key={i} position={c.p} rotation={[0, c.rot, 0]}>
          <mesh>
            <boxGeometry args={[0.5, 0.05, c.len + 0.3]} />
            <meshStandardMaterial color="#b9dcef" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.28, 0.05, c.len]} />
            <meshBasicMaterial color="#0b1c2c" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DistantVolcanoes() {
  // Adams, St. Helens, and Hood to the south (toward +z).
  const peaks: { p: Vec3; r: number; h: number }[] = [
    { p: [170, 0, 300], r: 70, h: 42 },
    { p: [-160, 0, 290], r: 55, h: 24 },
    { p: [40, 0, 460], r: 70, h: 40 },
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <circleGeometry args={[1400, 32]} />
        <meshStandardMaterial color="#14241a" roughness={1} />
      </mesh>
      {peaks.map((k, i) => (
        <group key={i} position={k.p}>
          <mesh position={[0, k.h / 2, 0]}>
            <coneGeometry args={[k.r, k.h, 40]} />
            <meshStandardMaterial color="#3a4440" roughness={1} />
          </mesh>
          <mesh position={[0, k.h * 0.8, 0]}>
            <coneGeometry args={[k.r * 0.4, k.h * 0.4, 40]} />
            <meshStandardMaterial color="#e6edf2" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Stars({ night }: { night: React.MutableRefObject<number> }) {
  const geometry = useMemo(() => {
    const n = 500;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.45 * Math.PI;
      arr[i * 3] = Math.cos(u) * Math.cos(v) * 900;
      arr[i * 3 + 1] = Math.sin(v) * 900 + 40;
      arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * 900;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  const mat = useRef<THREE.PointsMaterial>(null);
  useFrame(() => { if (mat.current) mat.current.opacity = night.current; });
  return (
    <points geometry={geometry}>
      <pointsMaterial ref={mat} color="#ffffff" size={2.2} sizeAttenuation={false} transparent opacity={0} fog={false} />
    </points>
  );
}

function Snowfall({ intensity, center }: { intensity: React.MutableRefObject<number>; center: React.MutableRefObject<THREE.Vector3> }) {
  const n = 700;
  const { geometry, speeds } = useMemo(() => {
    const arr = new Float32Array(n * 3);
    const sp = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 16;
      arr[i * 3 + 1] = Math.random() * 10;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 16;
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
    pts.current.position.copy(center.current).add(new THREE.Vector3(0, -3, 0));
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      let y = pos.getY(i) - speeds[i] * dt;
      let x = pos.getX(i) + dt * 3.5; // wind drift
      if (y < 0) y += 10;
      if (x > 8) x -= 16;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={pts} geometry={geometry}>
      <pointsMaterial ref={mat} color="#ffffff" size={0.07} transparent opacity={0} />
    </points>
  );
}

// ---------- sky dome and sun ----------

const SKY_SEG = { w: 32, h: 16 };

/** A gradient sky: deep color overhead, hazy and pale toward the horizon. */
function SkyDome({ zenith, horizon }: { zenith: THREE.Color; horizon: THREE.Color }) {
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(2400, SKY_SEG.w, SKY_SEG.h);
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
      const y = pos.getY(i) / 2400;
      const t = y <= 0 ? 0 : Math.pow(y, 0.45);
      tmp.copy(horizon).lerp(zenith, t);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  });
  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={-1}>
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
      <mesh ref={glow} renderOrder={-1}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#fff1d6" transparent fog={false} depthWrite={false} />
      </mesh>
      <mesh ref={mesh} renderOrder={-1}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#fffaf0" transparent fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}

// ---------- lighting and sky ----------

const SKY_NIGHT = new THREE.Color('#0a1424');
const SKY_DAY = new THREE.Color('#8cc0e6');
const SKY_DAWN = new THREE.Color('#e9946b');
const SKY_WHITEOUT = new THREE.Color('#dde3e8');
const SKY_STORM = new THREE.Color('#5d6670');

function daylight(clock: number) {
  const m = minuteOfDay(clock);
  const t = (m - 330) / (1260 - 330);
  if (t <= 0 || t >= 1) return { day: 0, dawn: 0 };
  const day = Math.min(1, Math.sin(Math.PI * t) * 1.6);
  const dawn = t < 0.15 ? 1 - t / 0.15 : t > 0.85 ? (t - 0.85) / 0.15 : 0;
  return { day, dawn };
}

function fogFor(weather: Weather): [number, number] {
  switch (weather) {
    case 'whiteout': return [2, 22];
    case 'storm': return [3, 35];
    case 'windy': return [50, 380];
    case 'coldsnap': return [70, 500];
    default: return [80, 600];
  }
}

// ---------- the live world ----------

function World(props: SceneProps) {
  const { scene, camera } = useThree();
  const motion = useRef<Motion>({ walking: false, phase: 0 });
  const partnerMotion = useRef<Motion>({ walking: false, phase: 1.5 });
  const climber = useRef<THREE.Group>(null);
  const partner = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const lamp = useRef<THREE.SpotLight>(null);
  const lampTarget = useRef<THREE.Object3D>(new THREE.Object3D());
  const pos = useRef(ROUTE.nodeIndex[props.node]);
  const heading = useRef(0);
  const camTarget = useRef(new THREE.Vector3());
  const night = useRef(0);
  const snow = useRef(0);
  const orbit = useRef(0);
  const rope = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    return g;
  }, []);
  const ropeObj = useMemo(() => new THREE.Line(rope, new THREE.LineBasicMaterial({ color: '#2f9fd8' })), [rope]);
  const sky = useMemo(() => new THREE.Color(SKY_DAY), []);
  const zenith = useMemo(() => new THREE.Color(SKY_DAY), []);
  const horizon = useMemo(() => new THREE.Color(SKY_DAY), []);
  const fog = useMemo(() => new THREE.Fog(SKY_DAY, 120, 900), []);
  const sunDir = useRef(new THREE.Vector3(0, 1, 0));
  const sunStrength = useRef(0);
  const routeHighlight = useRef(0);
  const { size } = useThree();

  useEffect(() => {
    scene.background = sky;
    scene.fog = fog;
    scene.add(lampTarget.current);
  }, [scene, sky, fog]);

  const latest = useRef(props);
  latest.current = props;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const p = latest.current;
    const target = ROUTE.nodeIndex[p.node];

    // --- move along the route ---
    const diff = target - pos.current;
    const walking = Math.abs(diff) > 0.01;
    if (walking) {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), dt * 4.5);
      pos.current += step;
    } else {
      pos.current = target;
    }
    motion.current.walking = walking;
    partnerMotion.current.walking = walking;

    const at = (f: number) => {
      const clamped = Math.max(0, Math.min(ROUTE.pts.length - 1, f));
      const i = Math.floor(clamped);
      const j = Math.min(ROUTE.pts.length - 1, i + 1);
      const t = clamped - i;
      const a = ROUTE.pts[i];
      const b = ROUTE.pts[j];
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      return new THREE.Vector3(x, Math.max(heightAt(x, z), a[1] + (b[1] - a[1]) * t), z);
    };
    const here = at(pos.current);
    const facingDir = walking ? Math.sign(diff) : 1;
    const ahead = at(pos.current + 0.3 * facingDir);
    if (walking || heading.current === 0) {
      const h = Math.atan2(ahead.x - here.x, ahead.z - here.z);
      if (Number.isFinite(h)) heading.current = h;
    }
    if (climber.current) {
      climber.current.position.copy(here);
      climber.current.rotation.y = heading.current;
    }

    // Partner trails a rope length behind.
    const behind = pos.current - 0.55 * (walking ? Math.sign(diff) : p.node === 0 ? -1 : 1);
    const ph = at(behind);
    const showPartner = p.mode === 'follow';
    if (partner.current) {
      partner.current.visible = showPartner;
      partner.current.position.copy(ph);
      partner.current.lookAt(here.x, ph.y, here.z);
    }
    const ropeOn = showPartner && p.roped && pos.current >= ROUTE.nodeIndex[2] - 0.5;
    ropeObj.visible = ropeOn;
    if (ropeOn) {
      const arr = rope.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < 10; k++) {
        const t = k / 9;
        const x = here.x + (ph.x - here.x) * t;
        const z = here.z + (ph.z - here.z) * t;
        const y = here.y + 0.52 + (ph.y - here.y) * t - Math.sin(Math.PI * t) * 0.25;
        arr.setXYZ(k, x, Math.max(y, heightAt(x, z) + 0.03), z);
      }
      arr.needsUpdate = true;
    }

    // --- sky, light, fog ---
    const { day, dawn } = daylight(p.clock);
    const nightTarget = 1 - day;
    night.current += (nightTarget - night.current) * Math.min(1, dt * 1.5);
    const want = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DAWN, dawn * 0.55);
    if (p.weather === 'whiteout') want.lerp(SKY_WHITEOUT, 0.85 * Math.max(0.3, day));
    if (p.weather === 'storm') want.lerp(SKY_STORM, 0.8 * Math.max(0.3, day));
    sky.lerp(want, Math.min(1, dt * 1.5));
    // Deeper blue overhead, pale haze at the horizon; fog matches the haze so distance fades into it.
    zenith.copy(sky).multiplyScalar(0.62).lerp(SKY_NIGHT, night.current * 0.5);
    horizon.copy(sky).lerp(new THREE.Color('#ffffff'), 0.32 * day).lerp(SKY_NIGHT, night.current * 0.35);
    fog.color.copy(horizon);
    scene.background = horizon;
    const [near, far] = p.mode === 'orbit' ? [70, 650] : fogFor(p.weather);
    fog.near += (near - fog.near) * Math.min(1, dt * 1.5);
    fog.far += (far - fog.far) * Math.min(1, dt * 1.5);

    if (sun.current) {
      const m = minuteOfDay(p.clock);
      const ang = ((m - 330) / (1260 - 330)) * Math.PI;
      sun.current.position.set(Math.cos(ang) * -200 + here.x, Math.max(20, Math.sin(ang) * 220), 120 + here.z);
      sun.current.target.position.copy(here);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity += (0.2 + day * 2.4 - sun.current.intensity) * Math.min(1, dt * 2);
      sun.current.color.set(dawn > 0.1 ? '#ffc29a' : '#fff6e8');
      sunDir.current.copy(sun.current.position).sub(here).normalize();
      const clouded = p.weather === 'whiteout' || p.weather === 'storm' ? 0 : p.weather === 'windy' ? 0.7 : 1;
      sunStrength.current = Math.min(1, day * 1.5) * clouded;
    }
    routeHighlight.current += ((p.mode === 'follow' && p.control.current.overview ? 1 : 0) - routeHighlight.current) * Math.min(1, dt * 4);

    // Shift the picture up when UI covers the bottom of the screen.
    const shift = p.viewShift ?? 0;
    const cam = camera as THREE.PerspectiveCamera;
    if (shift > 0) cam.setViewOffset(size.width, size.height, 0, size.height * shift, size.width, size.height);
    else if (cam.view) cam.clearViewOffset();
    if (hemi.current) {
      hemi.current.intensity += (0.35 + day * 0.9 - hemi.current.intensity) * Math.min(1, dt * 2);
    }
    if (lamp.current) {
      const on = p.look.headlamp && day < 0.35 && p.mode === 'follow';
      lamp.current.intensity += ((on ? 25 : 0) - lamp.current.intensity) * Math.min(1, dt * 4);
      const fwd = new THREE.Vector3(Math.sin(heading.current), -0.35, Math.cos(heading.current));
      lamp.current.position.set(here.x, here.y + 1.05, here.z);
      lampTarget.current.position.copy(here).add(fwd.multiplyScalar(6));
      lamp.current.target = lampTarget.current;
    }

    snow.current += ((p.weather === 'storm' || p.weather === 'whiteout' ? 0.9 : 0) - snow.current) * Math.min(1, dt);

    // --- camera ---
    const c = p.control.current;
    let camPos: THREE.Vector3;
    let look: THREE.Vector3;
    if (p.mode === 'orbit') {
      orbit.current += dt * 0.05;
      camPos = new THREE.Vector3(Math.sin(orbit.current) * 150, 70, Math.cos(orbit.current) * 150);
      look = new THREE.Vector3(0, 22, 0);
    } else if (c.overview) {
      const yaw = c.yaw + 0.25;
      camPos = new THREE.Vector3(Math.sin(yaw) * 125, 85, Math.cos(yaw) * 125);
      look = new THREE.Vector3(here.x * 0.3, 24, here.z * 0.3);
    } else {
      const yaw = heading.current + Math.PI + c.yaw;
      const d = c.dist;
      camPos = new THREE.Vector3(here.x + Math.sin(yaw) * d, here.y + 0.9 + d * 0.35, here.z + Math.cos(yaw) * d);
      const ground = heightAt(camPos.x, camPos.z) + 0.8;
      if (camPos.y < ground) camPos.y = ground;
      look = here.clone().add(new THREE.Vector3(0, 0.7, 0));
    }
    camera.position.lerp(camPos, Math.min(1, dt * 2.5));
    camTarget.current.lerp(look, Math.min(1, dt * 4));
    camera.lookAt(camTarget.current);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe3ff', '#3a4436', 1]} />
      <directionalLight ref={sun} position={[-100, 150, 120]} intensity={2} />
      <spotLight ref={lamp} angle={0.45} penumbra={0.5} distance={18} decay={1} intensity={0} color="#fff3cf" />
      <Terrain />
      <SkyDome zenith={zenith} horizon={horizon} />
      <SunDisc dir={sunDir} strength={sunStrength} />
      <RouteLine highlight={routeHighlight} />
      <RouteMarkers wands={props.wands} />
      <Crevasses />
      <DistantVolcanoes />
      <Stars night={night} />
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
  return (
    <Canvas camera={{ position: [0, 80, 160], fov: 55, near: 0.1, far: 3000 }}>
      <World {...props} />
    </Canvas>
  );
}
