// A mountaineer on a real human skeleton driven by motion-capture walk and idle clips
// (src/scene/data/climberRig.ts). Clothing and gear are built around the bones, so the body has
// true proportions and moves like a person: hips swing, knees bend, arms counter-swing.
// Face covered the way climbers dress up high: helmet, glacier glasses, buff.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { RIG_BONES, RIG_CLIPS, RIG_ROOT } from './data/climberRig';

export interface ClimberLook {
  jacket: string;
  bulky: boolean;
  helmet: boolean;
  glasses: boolean;
  headlamp: boolean;
  axe: boolean;
  poles: boolean;
  crampons: boolean;
  harness: boolean;
  rope: boolean;
  /** Pack size multiplier from pack weight. */
  pack: number;
}

export interface Motion {
  walking: boolean;
  phase: number;
}

const PANTS = '#262d38';
const BOOT = '#8a2f17';
const BOOT_DARK = '#191b1f';
const GLOVE = '#16181c';
const HELMET = '#f26b1d';
const PACK = '#2d4055';
const PACK_DARK = '#1c2836';
const BUFF = '#3b4350';
const ROPE = '#2f9fd8';
const STEEL = '#b8c0c8';

const UP = new THREE.Vector3(0, 1, 0);

type Bones = Record<string, THREE.Bone>;

function buildSkeleton() {
  const root = new THREE.Group();
  root.quaternion.fromArray(RIG_ROOT.r);
  root.scale.setScalar(RIG_ROOT.s);
  const bones: Bones = {};
  const list: THREE.Bone[] = [];
  for (const b of RIG_BONES) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    (b.parent >= 0 ? list[b.parent] : root).add(bone);
    list.push(bone);
    bones[b.name] = bone;
  }
  return { root, bones };
}

function clip(name: 'Walk' | 'Idle') {
  const c = RIG_CLIPS[name];
  const tracks = c.tracks.map((t) =>
    t.path === 'quaternion'
      ? new THREE.QuaternionKeyframeTrack(`${t.bone}.quaternion`, t.times, t.values)
      : new THREE.VectorKeyframeTrack(`${t.bone}.position`, t.times, t.values),
  );
  return new THREE.AnimationClip(name, c.duration, tracks);
}
const WALK = clip('Walk');
const IDLE = clip('Idle');

/** Direction `world` (in the character's rest pose, facing +Z) expressed in `bone`'s local frame. */
function localDir(bone: THREE.Object3D, world: THREE.Vector3) {
  const q = new THREE.Quaternion();
  bone.getWorldQuaternion(q);
  return world.clone().applyQuaternion(q.invert()).normalize();
}

/** Offset of `child` from `bone`, in `bone`'s local units (cm). */
const toChild = (bones: Bones, child: string) => bones[child].position.clone();

function material(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
}

function shadowed<T extends THREE.Object3D>(o: T) {
  o.traverse((c) => { c.castShadow = true; c.receiveShadow = true; });
  return o;
}

/** A tapered, round-ended limb from the bone origin along `dir` (cm). */
function limb(len: number, r0: number, r1: number, mat: THREE.Material, dir: THREE.Vector3, squash = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 18, 1, true), mat);
  body.position.y = len / 2;
  const capA = new THREE.Mesh(new THREE.SphereGeometry(r0, 18, 12), mat);
  const capB = new THREE.Mesh(new THREE.SphereGeometry(r1, 18, 12), mat);
  capB.position.y = len;
  g.add(body, capA, capB);
  g.scale.set(1, 1, squash);
  g.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  return shadowed(g);
}

/** An ellipsoid centered at `at` (cm), radii in cm, oriented so its local axes match `basis` if given. */
function blob(at: THREE.Vector3, radii: [number, number, number], mat: THREE.Material, seg = 24) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), mat);
  m.position.copy(at);
  m.scale.set(...radii);
  return shadowed(m);
}

function dress(bones: Bones, look: ClimberLook) {
  const parts: THREE.Object3D[] = [];
  const add = (bone: string, o: THREE.Object3D) => { bones[bone].add(o); parts.push(o); };

  const jacket = material(look.jacket, { roughness: look.bulky ? 0.62 : 0.55 });
  const jacketSeam = material(new THREE.Color(look.jacket).multiplyScalar(0.72).getStyle(), { roughness: 0.6 });
  const pants = material(PANTS, { roughness: 0.7 });
  const boot = material(BOOT, { roughness: 0.55 });
  const bootDark = material(BOOT_DARK, { roughness: 0.9 });
  const glove = material(GLOVE, { roughness: 0.85 });
  const buff = material(BUFF, { roughness: 0.95 });
  const puff = look.bulky ? 1.18 : 1;

  // Directions in each bone's frame, from the rest pose (character faces +Z).
  const back = (b: string) => localDir(bones[b], new THREE.Vector3(0, 0, -1));
  const fwd = (b: string) => localDir(bones[b], new THREE.Vector3(0, 0, 1));
  const down = (b: string) => localDir(bones[b], new THREE.Vector3(0, -1, 0));

  // --- torso: hips, three spine segments, collar ---
  add('Hips', blob(new THREE.Vector3(0, 4, 0), [17 * puff, 13, 12.5 * puff], pants));
  add('Hips', blob(new THREE.Vector3(0, 9, 0), [16.5 * puff, 8, 12.5 * puff], jacket)); // jacket hem
  for (const [b, len, w, d] of [['Spine', 11, 16, 12], ['Spine1', 12.6, 17.5, 12.5], ['Spine2', 14, 19, 13]] as const) {
    const shape = blob(new THREE.Vector3(0, len * 0.55, 0), [w * puff, len * 0.78, d * puff], jacket, 28);
    add(b, shape);
    if (look.bulky) {
      // Down baffles: stitched horizontal channels.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 28), jacketSeam);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(w * puff * 0.99, d * puff * 0.99, 1);
      ring.position.y = len * 0.2;
      add(b, shadowed(ring));
    }
  }
  add('Spine2', blob(new THREE.Vector3(0, 13.5, 0), [12.5 * puff, 6, 10 * puff], jacket)); // shoulders / yoke
  add('Neck', blob(new THREE.Vector3(0, 3, 0), [7.2, 6, 7.2], jacket)); // collar
  // Zipper down the front
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 36, 0.6), material('#2a2d33'));
  zip.position.copy(fwd('Spine1').multiplyScalar(12.6 * puff)).add(new THREE.Vector3(0, 4, 0));
  add('Spine1', shadowed(zip));

  // --- head: buff over the face, helmet, glasses, headlamp ---
  add('Head', blob(new THREE.Vector3(0, 9, 0.5), [9, 11, 9.5], material('#c98e6b', { roughness: 0.7 })));
  const buffMesh = blob(new THREE.Vector3(0, 4.5, 0.4), [9.4, 7.5, 10], buff);
  add('Head', buffMesh);
  if (look.helmet) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(12, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), material(HELMET, { roughness: 0.35 }));
    helmet.position.set(0, 12.5, 0.5);
    add('Head', shadowed(helmet));
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 1.2), material('#202226'));
      strap.position.set(sx * 9.3, 8, 0);
      add('Head', strap);
    }
  } else {
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(10.2, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), material('#2c3440', { roughness: 1 }));
    beanie.position.set(0, 11.5, 0.5);
    add('Head', shadowed(beanie));
  }
  if (look.glasses) {
    const f = fwd('Head');
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 8, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.38, Math.PI * 0.16),
      material('#0b0f14', { metalness: 0.9, roughness: 0.08 }),
    );
    lens.position.set(0, 10.5, 0.5);
    lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.x, 0, f.z).normalize());
    lens.scale.setScalar(1.02);
    add('Head', lens);
  }
  if (look.headlamp) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 2.4), material('#fff6c8', { emissive: '#fff2a8', emissiveIntensity: 1.6 }));
    lamp.position.copy(fwd('Head').multiplyScalar(11.5)).add(new THREE.Vector3(0, 15, 0));
    add('Head', lamp);
  }

  // --- arms: shoulder pads, sleeves, gloves ---
  for (const s of ['Left', 'Right']) {
    add(`${s}Arm`, limb(toChild(bones, `${s}ForeArm`).length(), 6.4 * puff, 5.6 * puff, jacket, toChild(bones, `${s}ForeArm`)));
    add(`${s}ForeArm`, limb(toChild(bones, `${s}Hand`).length(), 5.4 * puff, 4.6 * puff, jacket, toChild(bones, `${s}Hand`)));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(4.8 * puff, 1.1, 8, 18), jacketSeam);
    const hd = toChild(bones, `${s}Hand`);
    cuff.position.copy(hd).multiplyScalar(0.92);
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hd.clone().normalize());
    add(`${s}ForeArm`, shadowed(cuff));
    const tip = toChild(bones, `${s}HandMiddle1`);
    add(`${s}Hand`, blob(tip.clone().multiplyScalar(0.75), [5.2, 7.2, 4], glove));
  }

  // --- legs: hardshell pants, gaiters, stiff boots ---
  for (const s of ['Left', 'Right']) {
    add(`${s}UpLeg`, limb(toChild(bones, `${s}Leg`).length(), 8.6, 6.6, pants, toChild(bones, `${s}Leg`)));
    add(`${s}Leg`, limb(toChild(bones, `${s}Foot`).length() * 0.82, 6.4, 5.4, pants, toChild(bones, `${s}Foot`)));
    // Gaiter and boot cuff around the ankle
    const ankle = toChild(bones, `${s}Foot`);
    add(`${s}Leg`, blob(ankle.clone().multiplyScalar(0.9), [6.4, 7.5, 6.8], bootDark));
    const toe = toChild(bones, `${s}ToeBase`);
    const toeEnd = toChild(bones, `${s}Toe_End`);
    add(`${s}Foot`, limb(toe.length() * 1.02, 5.6, 5.2, boot, toe, 0.9));
    add(`${s}ToeBase`, limb(toeEnd.length() * 1.1, 5.1, 4.6, boot, toeEnd, 0.85));
    // Lugged sole
    const sd = down(`${s}Foot`);
    const sole = limb(toe.length() * 1.15, 5.9, 5.6, bootDark, toe, 0.55);
    sole.position.addScaledVector(sd, 3.8).addScaledVector(toe.clone().normalize(), -3);
    add(`${s}Foot`, sole);
    if (look.crampons) {
      const steel = material(STEEL, { metalness: 0.85, roughness: 0.3 });
      for (let k = 0; k < 5; k++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 5), steel);
        const along = toe.clone().multiplyScalar(-0.15 + k * 0.3);
        spike.position.copy(along.addScaledVector(sd, 6.8));
        spike.quaternion.setFromUnitVectors(UP, sd);
        add(`${s}Foot`, shadowed(spike));
      }
      const front = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.5, 5), steel);
      front.position.copy(toeEnd.clone().multiplyScalar(0.9)).addScaledVector(sd, 2);
      front.quaternion.setFromUnitVectors(UP, toeEnd.clone().normalize());
      add(`${s}ToeBase`, shadowed(front));
    }
  }

  // --- harness ---
  if (look.harness) {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 8, 32), material('#c9c23a', { roughness: 0.5 }));
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(17.4 * puff, 13 * puff, 18);
    belt.position.y = 6;
    add('Hips', shadowed(belt));
    for (const s of ['Left', 'Right']) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(9.2, 1.1, 8, 24), material('#c9c23a', { roughness: 0.5 }));
      loop.rotation.x = Math.PI / 2;
      loop.position.y = 4;
      add(`${s}UpLeg`, shadowed(loop));
    }
  }

  // --- pack: body, lid, shoulder straps, rope coil ---
  const pb = back('Spine2');
  const packH = 52 * look.pack;
  const packAt = pb.clone().multiplyScalar(13 * puff + 11).add(new THREE.Vector3(0, -8, 0));
  add('Spine2', blob(packAt, [15, packH / 2, 11], material(PACK, { roughness: 0.75 }), 28));
  add('Spine2', blob(packAt.clone().add(new THREE.Vector3(0, packH / 2 - 2, 0)).addScaledVector(pb, 1.5), [14, 5.5, 10.5], material(PACK_DARK, { roughness: 0.75 })));
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(10, 1.3, 6, 20, Math.PI), material(PACK_DARK));
    strap.position.set(sx * 8, 10, 0);
    strap.rotation.y = Math.atan2(pb.x, pb.z) + Math.PI / 2;
    add('Spine2', shadowed(strap));
  }
  if (look.rope) {
    // Butterfly-coiled rope strapped under the lid.
    const coil = new THREE.Mesh(new THREE.TorusGeometry(9, 2.6, 10, 28), material(ROPE, { roughness: 0.7 }));
    coil.position.copy(packAt).add(new THREE.Vector3(0, packH / 2 + 3, 0)).addScaledVector(pb, 2);
    coil.rotation.x = Math.PI / 2;
    coil.scale.set(1.25, 0.8, 0.7);
    add('Spine2', shadowed(coil));
  }

  // --- tools in hand ---
  if (look.axe) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 65, 10), material('#1f6fb2', { roughness: 0.4, metalness: 0.3 }));
    shaft.position.y = 32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 28), material(STEEL, { metalness: 0.85, roughness: 0.3 }));
    head.position.y = -1;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5, 6), material(STEEL, { metalness: 0.85, roughness: 0.3 }));
    spike.position.y = 66;
    g.add(shaft, head, spike);
    g.quaternion.setFromUnitVectors(UP, toChild(bones, 'RightHandMiddle1').normalize());
    g.position.copy(toChild(bones, 'RightHandMiddle1').multiplyScalar(0.6));
    add('RightHand', shadowed(g));
  }
  if (look.poles) {
    for (const s of look.axe ? ['Left'] : ['Left', 'Right']) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 115, 8), material('#9aa3ad', { metalness: 0.7, roughness: 0.35 }));
      pole.position.y = 55;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 10), material('#111317'));
      grip.position.y = 2;
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.6, 12), material('#111317'));
      basket.position.y = 104;
      g.add(pole, grip, basket);
      const dir = toChild(bones, `${s}HandMiddle1`).normalize().addScaledVector(fwd(`${s}Hand`), 0.35).normalize();
      g.quaternion.setFromUnitVectors(UP, dir);
      g.position.copy(toChild(bones, `${s}HandMiddle1`).multiplyScalar(0.6));
      add(`${s}Hand`, shadowed(g));
    }
  }
  return parts;
}

export function Climber({ look, motion }: { look: ClimberLook; motion: React.MutableRefObject<Motion> }) {
  const rig = useMemo(() => {
    const { root, bones } = buildSkeleton();
    root.updateMatrixWorld(true);
    const mixer = new THREE.AnimationMixer(root);
    const walk = mixer.clipAction(WALK);
    const idle = mixer.clipAction(IDLE);
    walk.play();
    idle.play();
    walk.setEffectiveWeight(0);
    idle.setEffectiveWeight(1);
    // Two climbers shouldn't step in lockstep.
    mixer.setTime(Math.random() * 2);
    return { root, bones, mixer, walk, idle, blend: 0 };
  }, []);

  // Rebuild clothing and gear when the outfit changes (layers, helmet, crampons...).
  const key = JSON.stringify(look);
  useEffect(() => {
    // Measure directions in the rest pose.
    rig.mixer.stopAllAction();
    for (const b of RIG_BONES) {
      rig.bones[b.name].position.fromArray(b.t);
      rig.bones[b.name].quaternion.fromArray(b.r);
    }
    rig.root.updateMatrixWorld(true);
    // Measure in a neutral frame: the root may be rotated by the scene's heading.
    const parent = rig.root.parent;
    const saved = rig.root.quaternion.clone();
    if (parent) parent.remove(rig.root);
    rig.root.quaternion.fromArray(RIG_ROOT.r);
    rig.root.updateMatrixWorld(true);
    const parts = dress(rig.bones, look);
    rig.root.quaternion.copy(saved);
    if (parent) parent.add(rig.root);
    rig.walk.play();
    rig.idle.play();
    return () => parts.forEach((p) => p.removeFromParent());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useFrame((_, dt) => {
    const target = motion.current.walking ? 1 : 0;
    rig.blend += (target - rig.blend) * Math.min(1, dt * 5);
    rig.walk.setEffectiveWeight(rig.blend);
    rig.idle.setEffectiveWeight(1 - rig.blend);
    rig.mixer.update(Math.min(dt, 0.1));
  });

  return <primitive object={rig.root} />;
}
