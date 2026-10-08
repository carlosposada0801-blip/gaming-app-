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

  const torsoW = look.bulky ? 0.38 : 0.32;
  const torsoD = look.bulky ? 0.26 : 0.2;
  const packH = 0.34 * look.pack;

  return (
    <group ref={body}>
      {/* Legs with boots */}
      {[
        { ref: legL, x: -0.08 },
        { ref: legR, x: 0.08 },
      ].map(({ ref, x }) => (
        <group key={x} ref={ref} position={[x, 0.5, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[0.11, 0.44, 0.12]} />
            <meshStandardMaterial color={PANTS} flatShading />
          </mesh>
          <mesh position={[0, -0.46, 0.03]}>
            <boxGeometry args={[0.12, 0.09, 0.22]} />
            <meshStandardMaterial color={BOOT} flatShading />
          </mesh>
          {look.crampons && (
            <group position={[0, -0.5, 0.03]}>
              <Crampon x={0} />
            </group>
          )}
        </group>
      ))}

      {/* Harness */}
      {look.harness && (
        <mesh position={[0, 0.52, 0]}>
          <boxGeometry args={[torsoW + 0.02, 0.05, torsoD + 0.02]} />
          <meshStandardMaterial color="#d8d02c" flatShading />
        </mesh>
      )}

      {/* Torso */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[torsoW, 0.36, torsoD]} />
        <meshStandardMaterial color={look.jacket} flatShading />
      </mesh>

      {/* Pack */}
      <group position={[0, 0.66 + packH / 2 - 0.12, -torsoD / 2 - 0.09]}>
        <mesh>
          <boxGeometry args={[0.28, packH, 0.18]} />
          <meshStandardMaterial color={PACK} flatShading />
        </mesh>
        {look.rope && (
          <mesh position={[0, packH / 2 + 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.1, 0.03, 6, 14]} />
            <meshStandardMaterial color={ROPE} flatShading />
          </mesh>
        )}
      </group>

      {/* Head */}
      <mesh position={[0, 0.96, 0]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
      {look.helmet ? (
        <mesh position={[0, 0.99, 0]}>
          <sphereGeometry args={[0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={HELMET} flatShading />
        </mesh>
      ) : (
        <mesh position={[0, 1.0, 0]}>
          <sphereGeometry args={[0.108, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#1d2633" flatShading />
        </mesh>
      )}
      {look.glasses && (
        <mesh position={[0, 0.965, 0.088]}>
          <boxGeometry args={[0.15, 0.035, 0.03]} />
          <meshStandardMaterial color="#0b0f14" metalness={0.5} roughness={0.2} />
        </mesh>
      )}
      {look.headlamp && (
        <mesh position={[0, 1.04, 0.1]}>
          <boxGeometry args={[0.05, 0.035, 0.03]} />
          <meshStandardMaterial color="#fff6c8" emissive="#fff2a8" emissiveIntensity={1.5} />
        </mesh>
      )}

      {/* Arms */}
      <group ref={armL} position={[-(torsoW / 2 + 0.05), 0.85, 0]}>
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.08, 0.34, 0.09]} />
          <meshStandardMaterial color={look.jacket} flatShading />
        </mesh>
        {look.poles && !look.axe && (
          <mesh position={[0, -0.45, 0.08]} rotation={[0.25, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.9, 5]} />
            <meshStandardMaterial color="#9aa3ad" metalness={0.5} />
          </mesh>
        )}
      </group>
      <group ref={armR} position={[torsoW / 2 + 0.05, 0.85, 0]}>
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.08, 0.34, 0.09]} />
          <meshStandardMaterial color={look.jacket} flatShading />
        </mesh>
        {look.axe ? (
          <group position={[0, -0.36, 0.05]}>
            <mesh position={[0, -0.18, 0.06]} rotation={[0.35, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.6, 6]} />
              <meshStandardMaterial color="#1f6fb2" />
            </mesh>
            <mesh position={[0, 0.09, -0.03]}>
              <boxGeometry args={[0.03, 0.03, 0.26]} />
              <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        ) : (
          look.poles && (
            <mesh position={[0, -0.45, 0.08]} rotation={[0.25, 0, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.9, 5]} />
              <meshStandardMaterial color="#9aa3ad" metalness={0.5} />
            </mesh>
          )
        )}
      </group>
    </group>
  );
}
