import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import type { Group } from 'three';

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

const SKIN = '#c98e6b';
const PANTS = '#2b3442';
const BOOT = '#5a2e1a';
const STEEL = '#b8c0c8';
const HELMET = '#f26b1d';
const PACK = '#33465c';
const ROPE = '#2f9fd8';

function Crampon({ x }: { x: number }) {
  const spikes = [-0.07, 0.0, 0.07];
  return (
    <group position={[x, -0.01, 0]}>
      {spikes.map((z) => (
        <mesh key={z} position={[0, -0.02, z]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.015, 0.05, 4]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, -0.01, 0.11]} rotation={[Math.PI / 2.4, 0, 0]}>
        <coneGeometry args={[0.012, 0.05, 4]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Climber({ look, motion }: { look: ClimberLook; motion: React.MutableRefObject<Motion> }) {
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const body = useRef<Group>(null);

  useFrame((_, dt) => {
    const m = motion.current;
    if (m.walking) m.phase += dt * 6;
    const swing = m.walking ? Math.sin(m.phase) * 0.55 : 0;
    const ease = (ref: React.RefObject<Group | null>, target: number) => {
      if (ref.current) ref.current.rotation.x += (target - ref.current.rotation.x) * Math.min(1, dt * 10);
    };
    ease(legL, swing);
    ease(legR, -swing);
    ease(armL, -swing * 0.8);
    ease(armR, look.axe ? swing * 0.4 - 0.3 : swing * 0.8);
    if (body.current) {
      body.current.position.y = m.walking ? Math.abs(Math.cos(m.phase)) * 0.03 : 0;
      body.current.rotation.x = m.walking ? 0.12 : 0.04; // lean into the slope
    }
  });

  const torsoW = look.bulky ? 0.17 : 0.145; // capsule radius
  const packH = 0.3 * look.pack;
  const fabric = { roughness: 0.85, metalness: 0 } as const;

  return (
    <group ref={body}>
      {/* Legs: thigh and shin as one capsule, stiff mountaineering boots */}
      {[
        { ref: legL, x: -0.075 },
        { ref: legR, x: 0.075 },
      ].map(({ ref, x }) => (
        <group key={x} ref={ref} position={[x, 0.52, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.058, 0.34, 6, 12]} />
            <meshStandardMaterial color={PANTS} {...fabric} />
          </mesh>
          <mesh position={[0, -0.47, 0.035]}>
            <capsuleGeometry args={[0.055, 0.12, 6, 12]} />
            <meshStandardMaterial color={BOOT} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.47, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.052, 0.12, 6, 12]} />
            <meshStandardMaterial color={BOOT} roughness={0.7} />
          </mesh>
          {look.crampons && (
            <group position={[0, -0.51, 0.035]}>
              <Crampon x={0} />
            </group>
          )}
        </group>
      ))}

      {/* Harness */}
      {look.harness && (
        <mesh position={[0, 0.53, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[torsoW * 0.92, 0.018, 8, 24]} />
          <meshStandardMaterial color="#c9c23a" roughness={0.6} />
        </mesh>
      )}

      {/* Torso: jacket over the hips, slightly wider at the shoulders */}
      <mesh position={[0, 0.72, 0]} scale={[1, 1, 0.78]}>
        <capsuleGeometry args={[torsoW, 0.24, 8, 16]} />
        <meshStandardMaterial color={look.jacket} {...fabric} />
      </mesh>

      {/* Pack with a lid and hip belt */}
      <group position={[0, 0.66 + packH / 2 - 0.1, -torsoW - 0.07]}>
        <mesh scale={[1, 1, 0.62]}>
          <capsuleGeometry args={[0.13, packH - 0.12, 6, 14]} />
          <meshStandardMaterial color={PACK} {...fabric} />
        </mesh>
        <mesh position={[0, packH / 2 - 0.02, 0.01]} scale={[1, 0.45, 0.75]}>
          <sphereGeometry args={[0.13, 14, 10]} />
          <meshStandardMaterial color="#26384c" {...fabric} />
        </mesh>
        {look.rope && (
          <mesh position={[0, packH / 2 + 0.05, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.1, 0.028, 8, 20]} />
            <meshStandardMaterial color={ROPE} roughness={0.7} />
          </mesh>
        )}
      </group>

      {/* Neck and head */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.06, 12]} />
        <meshStandardMaterial color={look.jacket} {...fabric} />
      </mesh>
      <mesh position={[0, 0.98, 0.005]}>
        <sphereGeometry args={[0.092, 20, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.75} />
      </mesh>
      {look.helmet ? (
        <mesh position={[0, 1.0, 0]}>
          <sphereGeometry args={[0.108, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={HELMET} roughness={0.45} />
        </mesh>
      ) : (
        <mesh position={[0, 1.0, 0]}>
          <sphereGeometry args={[0.098, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#1d2633" {...fabric} />
        </mesh>
      )}
      {look.glasses && (
        <mesh position={[0, 0.985, 0.075]} rotation={[0, 0, 0]} scale={[1, 0.38, 0.5]}>
          <sphereGeometry args={[0.07, 16, 8, -Math.PI / 2.4, Math.PI / 1.2]} />
          <meshStandardMaterial color="#0b0f14" metalness={0.6} roughness={0.15} />
        </mesh>
      )}
      {look.headlamp && (
        <mesh position={[0, 1.035, 0.098]}>
          <boxGeometry args={[0.045, 0.03, 0.025]} />
          <meshStandardMaterial color="#fff6c8" emissive="#fff2a8" emissiveIntensity={1.5} />
        </mesh>
      )}

      {/* Arms with gloves */}
      <group ref={armL} position={[-(torsoW + 0.045), 0.86, 0]}>
        <mesh position={[0, -0.17, 0]}>
          <capsuleGeometry args={[0.045, 0.26, 6, 12]} />
          <meshStandardMaterial color={look.jacket} {...fabric} />
        </mesh>
        <mesh position={[0, -0.35, 0]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#1b1f26" roughness={0.8} />
        </mesh>
        {look.poles && !look.axe && (
          <mesh position={[0, -0.45, 0.08]} rotation={[0.25, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.9, 6]} />
            <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.35} />
          </mesh>
        )}
      </group>
      <group ref={armR} position={[torsoW + 0.045, 0.86, 0]}>
        <mesh position={[0, -0.17, 0]}>
          <capsuleGeometry args={[0.045, 0.26, 6, 12]} />
          <meshStandardMaterial color={look.jacket} {...fabric} />
        </mesh>
        <mesh position={[0, -0.35, 0]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#1b1f26" roughness={0.8} />
        </mesh>
        {look.axe ? (
          <group position={[0, -0.36, 0.05]}>
            <mesh position={[0, -0.18, 0.06]} rotation={[0.35, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.6, 8]} />
              <meshStandardMaterial color="#1f6fb2" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.09, -0.03]}>
              <boxGeometry args={[0.025, 0.03, 0.26]} />
              <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        ) : (
          look.poles && (
            <mesh position={[0, -0.45, 0.08]} rotation={[0.25, 0, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.9, 6]} />
              <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.35} />
            </mesh>
          )
        )}
      </group>
    </group>
  );
}
