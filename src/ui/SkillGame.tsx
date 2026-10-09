// Phase 2 skills: short hands-on mini-games. Each reports a performance from 0 (botched) to
// 1 (textbook) through `onDone`; the event's rules in src/game/skills.ts turn that into an outcome.
// "Let the dice decide" reports undefined, which uses the event's classic odds.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Accelerometer } from 'expo-sensors';
import type { SkillId } from '../game/types';
import { C, NUM } from './theme';

const buzz = (s: Haptics.ImpactFeedbackStyle) => { Haptics.impactAsync(s).catch(() => {}); };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function SkillGame({
  skill,
  title,
  slopeDeg,
  anchor,
  note,
  onDone,
}: {
  skill: SkillId;
  title: string;
  slopeDeg: number;
  /** First rigging step of the Z-pulley, e.g. "Bury a picket as the anchor". */
  anchor: string;
  /** Why this will be harder than it looks (numb fingers, mittens). */
  note?: string;
  onDone: (perf: number | undefined) => void;
}) {
  const [result, setResult] = useState<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finished = useRef(false);
  // Stable and once-only: a game may report from a timer and a tap in the same moment.
  const finish = useCallback((perf: number) => {
    if (finished.current) return;
    finished.current = true;
    setResult(perf);
    buzz(perf > 0.6 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => onDoneRef.current(perf), 1100);
  }, []);
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <Text style={styles.kicker}>SKILL</Text>
        <Text style={styles.title}>{title}</Text>
        {note && result === null ? <Text style={styles.note}>{note}</Text> : null}
        {result === null ? (
          <>
            {skill === 'arrest' && <SelfArrest slopeDeg={slopeDeg} onDone={finish} />}
            {skill === 'prusik' && <Prusik onDone={finish} />}
            {skill === 'zpulley' && <ZPulley anchor={anchor} onDone={finish} />}
            {skill === 'ladder' && <Ladder onDone={finish} />}
            <Pressable
              onPress={() => {
                if (finished.current) return;
                finished.current = true;
                onDone(undefined);
              }}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.skip}>Let the dice decide</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.result}>
            <Text style={[styles.grade, { color: result > 0.75 ? C.good : result > 0.4 ? C.warn : C.bad }]}>
              {result > 0.75 ? 'Textbook' : result > 0.4 ? 'Scrappy' : 'Botched'}
            </Text>
            <Text style={[styles.score, NUM]}>{Math.round(result * 100)}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------- self-arrest ----------

/**
 * Real technique: roll toward the axe head, drive the pick in by your shoulder, chest on the shaft,
 * toes (or knees, wearing crampons) in. Reaction time matters most; steeper slopes give less of it.
 */
function SelfArrest({ slopeDeg, onDone }: { slopeDeg: number; onDone: (p: number) => void }) {
  const side = useMemo(() => (Math.random() < 0.5 ? -1 : 1), []);
  const [phase, setPhase] = useState<'swipe' | 'hold'>('swipe');
  const [held, setHeld] = useState(0);
  const start = useRef(Date.now());
  const reaction = useRef(0);
  const holding = useRef<number | null>(null);
  const maxRt = Math.max(0.9, 2.2 - (slopeDeg - 20) * 0.04);

  // The reaction clock starts on the first frame the prompt is on screen, so a busy frame
  // doesn't eat your reaction time. No swipe well past the window: you're still sliding.
  useEffect(() => {
    if (phase !== 'swipe') return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      start.current = Date.now();
      buzz(Haptics.ImpactFeedbackStyle.Heavy);
      id = setTimeout(() => onDone(0), maxRt * 1000 + 2000);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (id) clearTimeout(id);
    };
  }, [phase, maxRt, onDone]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (_, g) => {
      if (phase !== 'swipe' || Math.abs(g.dx) < 50) return;
      const rt = (Date.now() - start.current) / 1000;
      const right = Math.sign(g.dx) === side;
      // Full credit for a typical trained reaction (~0.6 s), none past the window.
      reaction.current = clamp01(1 - (rt - 0.6) / (maxRt - 0.6)) * (right ? 1 : 0.3);
      buzz(Haptics.ImpactFeedbackStyle.Medium);
      setPhase('hold');
    },
  }), [phase, side, maxRt]);

  useEffect(() => {
    if (phase !== 'hold') return;
    const id = setInterval(() => {
      if (holding.current !== null) setHeld(Math.min(2, (Date.now() - holding.current) / 1000));
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'hold' && held >= 2) onDone(0.55 * reaction.current + 0.45);
  }, [held, phase, onDone]);

  if (phase === 'swipe') {
    return (
      <View style={styles.area} {...pan.panHandlers}>
        <Text style={styles.alert}>SLIP!</Text>
        <Text style={styles.instr}>Swipe {side < 0 ? 'left' : 'right'}: roll toward your axe head</Text>
        <Text style={styles.arrow}>{side < 0 ? '←' : '→'}</Text>
        <Text style={styles.small}>{slopeDeg}° slope · react fast</Text>
      </View>
    );
  }
  return (
    <View style={styles.area}>
      <Text style={styles.instr}>Pick in, chest on the shaft, toes in. Hold!</Text>
      <Pressable
        onPressIn={() => { holding.current = Date.now(); }}
        onPressOut={() => {
          if (holding.current !== null && held < 2) onDone(0.55 * reaction.current + 0.45 * (held / 2));
          holding.current = null;
        }}
        style={[styles.holdBtn, holding.current !== null && { backgroundColor: C.accent }]}
        accessibilityRole="button"
        accessibilityLabel="Press and hold to keep the arrest"
      >
        <Text style={styles.holdText}>HOLD</Text>
      </Pressable>
      <Bar value={held / 2} />
    </View>
  );
}

// ---------- prusik ----------

const PRUSIK_TAPS = 12;

/** Slide the waist prusik up, stand in the foot loop, repeat. A steady rhythm is fast and warm. */
function Prusik({ onDone }: { onDone: (p: number) => void }) {
  const [taps, setTaps] = useState(0);
  const [fumbles, setFumbles] = useState(0);
  const last = useRef(Date.now());
  const counts = useRef({ taps: 0, fumbles: 0 });
  counts.current = { taps, fumbles };
  const expect = taps % 2 === 0 ? 'slide' : 'stand';

  // 16 seconds from the start to climb out; whatever you managed by then counts.
  useEffect(() => {
    const id = setTimeout(() => {
      const c = counts.current;
      onDone(clamp01((c.taps / PRUSIK_TAPS) * (1 - c.fumbles * 0.08)));
    }, 16000);
    return () => clearTimeout(id);
  }, [onDone]);

  const press = (which: 'slide' | 'stand') => {
    const now = Date.now();
    const gap = (now - last.current) / 1000;
    last.current = now;
    if (which !== expect || (taps > 0 && (gap < 0.3 || gap > 1.8))) {
      setFumbles((f) => f + 1);
      buzz(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    }
    buzz(Haptics.ImpactFeedbackStyle.Light);
    const n = taps + 1;
    setTaps(n);
    if (n >= PRUSIK_TAPS) onDone(clamp01(1 - fumbles * 0.08));
  };
  return (
    <View style={styles.area}>
      <Text style={styles.instr}>Alternate: slide the waist prusik, then stand in the foot loop.</Text>
      <View style={styles.row}>
        {(['slide', 'stand'] as const).map((w) => (
          <Pressable
            key={w}
            onPressIn={() => press(w)}
            style={[styles.bigBtn, expect === w && { borderColor: C.accent }]}
            accessibilityRole="button"
          >
            <Text style={styles.bigBtnText}>{w.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Bar value={taps / PRUSIK_TAPS} />
      <Text style={[styles.small, NUM]}>Fumbles: {fumbles}</Text>
    </View>
  );
}

// ---------- Z-pulley ----------

/**
 * A simplified 3:1 Z-pulley as taught in glacier courses. Real systems vary in detail
 * (anchor type, where the progress capture sits); this is the common order.
 */
function ZPulley({ anchor, onDone }: { anchor: string; onDone: (p: number) => void }) {
  const steps = useMemo(() => [
    anchor,
    'Run the rope through a pulley at the anchor, with a prusik to catch it',
    'Clip a traveling prusik onto the loaded rope',
    'Haul, then slide the traveling prusik back down',
  ], [anchor]);
  const order = useMemo(() => [...steps.keys()].sort(() => Math.random() - 0.5), [steps]);
  const [done, setDone] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hauls, setHauls] = useState<number[]>([]);
  const [meter, setMeter] = useState(0);
  const t0 = useRef(Date.now());

  useEffect(() => {
    if (done < steps.length) return;
    const id = setInterval(() => setMeter((Math.sin(((Date.now() - t0.current) / 1000) * 3.2) + 1) / 2), 30);
    return () => clearInterval(id);
  }, [done, steps.length]);

  const pick = (i: number) => {
    if (i === done) {
      setDone(done + 1);
      buzz(Haptics.ImpactFeedbackStyle.Light);
    } else {
      setMistakes((m) => m + 1);
      buzz(Haptics.ImpactFeedbackStyle.Heavy);
    }
  };
  const haul = () => {
    const hit = 1 - Math.min(1, Math.abs(meter - 0.85) / 0.35); // pull at the top of the swing
    const next = [...hauls, hit];
    setHauls(next);
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    if (next.length >= 4) {
      const orderScore = clamp01(1 - mistakes * 0.2);
      onDone(0.5 * orderScore + 0.5 * (next.reduce((a, b) => a + b, 0) / next.length));
    }
  };

  if (done < steps.length) {
    return (
      <View style={styles.area}>
        <Text style={styles.instr}>Help rig the system. Tap the steps in order ({done + 1} of {steps.length}).</Text>
        {order.map((i) => (
          <Pressable
            key={i}
            disabled={i < done}
            onPress={() => pick(i)}
            style={[styles.stepCard, i < done && { opacity: 0.35, borderColor: C.good }]}
            accessibilityRole="button"
          >
            <Text style={styles.stepText}>{steps[i]}</Text>
          </Pressable>
        ))}
        <Text style={[styles.small, NUM]}>Mistakes: {mistakes}</Text>
      </View>
    );
  }
  return (
    <View style={styles.area}>
      <Text style={styles.instr}>Haul together. Pull when the swing peaks ({hauls.length} of 4).</Text>
      <View style={styles.meterTrack}>
        <View style={styles.meterZone} />
        <View style={[styles.meterDot, { left: `${meter * 100}%` }]} />
      </View>
      <Pressable onPressIn={haul} style={styles.holdBtn} accessibilityRole="button">
        <Text style={styles.holdText}>HAUL</Text>
      </Pressable>
    </View>
  );
}

// ---------- ladder ----------

const RUNGS = 8;
const LADDER_R = 90;

/** Keep the balance dot centered: tilt the phone (or drag), while gusts push you around. */
function Ladder({ onDone }: { onDone: (p: number) => void }) {
  const [dot, setDot] = useState({ x: 0, y: 0 });
  const [rungs, setRungs] = useState(0);
  const [wobbles, setWobbles] = useState(0);
  const tilt = useRef({ x: 0, y: 0 });
  const drag = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const progress = useRef(0);
  const state = useRef({ rungs: 0, wobbles: 0, done: false });

  // Tilt if the phone has a working accelerometer; dragging always works as well.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(50);
        sub = Accelerometer.addListener((a) => { tilt.current = { x: a.x, y: -a.y }; });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    const start = Date.now();
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      const t = (now - start) / 1000;
      const p = pos.current;
      // Wind gusts and your own wobble push you off balance and build momentum; tilting or
      // dragging pushes back. Doing nothing should end in a lurch onto the hand line.
      const gust = Math.sin(t * 0.8) * 120 + Math.sin(t * 2.3 + 1) * 50;
      p.vx += (gust + (Math.random() - 0.5) * 220 - (tilt.current.x * 320 + drag.current.x * 3.5)) * dt;
      p.vy += (Math.cos(t * 0.6) * 70 + (Math.random() - 0.5) * 180 - (tilt.current.y * 320 + drag.current.y * 3.5)) * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const r = Math.hypot(p.x, p.y);
      const st = state.current;
      if (r > LADDER_R) {
        st.wobbles += 1;
        setWobbles(st.wobbles);
        buzz(Haptics.ImpactFeedbackStyle.Heavy);
        p.x = p.y = p.vx = p.vy = 0;
      } else if (r < LADDER_R * 0.5) {
        progress.current += dt / 0.9;
        if (progress.current >= 1) {
          progress.current = 0;
          st.rungs += 1;
          setRungs(st.rungs);
          buzz(Haptics.ImpactFeedbackStyle.Light);
        }
      }
      setDot({ x: p.x, y: p.y });
      if (!st.done && (st.rungs >= RUNGS || t > 20)) {
        st.done = true;
        onDone(clamp01((st.rungs / RUNGS) * (1 - st.wobbles * 0.2)));
      }
    }, 33);
    return () => clearInterval(id);
  }, [onDone]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => { drag.current = { x: g.dx, y: g.dy }; },
    onPanResponderRelease: () => { drag.current = { x: 0, y: 0 }; },
  }), []);

  return (
    <View style={styles.area} {...pan.panHandlers}>
      <Text style={styles.instr}>Tilt your phone (or drag) to keep the dot in the green.</Text>
      <View style={styles.balance}>
        <View style={styles.balanceZone} />
        <View style={[styles.balanceDot, { transform: [{ translateX: dot.x }, { translateY: dot.y }] }]} />
      </View>
      <Bar value={rungs / RUNGS} />
      <Text style={[styles.small, NUM]}>Rungs {rungs}/{RUNGS} · wobbles {wobbles}</Text>
    </View>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.round(clamp01(value) * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,9,14,0.72)', justifyContent: 'center', padding: 18 },
  card: { backgroundColor: C.panel, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: C.line },
  kicker: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: C.text, fontSize: 22, fontWeight: '800' },
  note: { color: C.warn, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  area: { gap: 12, alignItems: 'center', paddingVertical: 8, minHeight: 260, justifyContent: 'center' },
  alert: { color: C.bad, fontSize: 40, fontWeight: '900', letterSpacing: 2 },
  instr: { color: C.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  arrow: { color: C.accent, fontSize: 72, fontWeight: '900' },
  small: { color: C.muted, fontSize: 12 },
  holdBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: C.raised, borderWidth: 3, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  holdText: { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 12 },
  bigBtn: { width: 130, height: 110, borderRadius: 16, backgroundColor: C.raised, borderWidth: 3, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  bigBtnText: { color: C.text, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  stepCard: { alignSelf: 'stretch', backgroundColor: C.raised, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12 },
  stepText: { color: C.text, fontSize: 14, fontWeight: '600' },
  meterTrack: { alignSelf: 'stretch', height: 22, borderRadius: 11, backgroundColor: C.raised, overflow: 'hidden' },
  meterZone: { position: 'absolute', left: '72%', width: '26%', top: 0, bottom: 0, backgroundColor: 'rgba(92,201,138,0.35)' },
  meterDot: { position: 'absolute', top: 2, width: 18, height: 18, marginLeft: -9, borderRadius: 9, backgroundColor: C.accent },
  balance: { width: LADDER_R * 2 + 24, height: LADDER_R * 2 + 24, borderRadius: LADDER_R + 12, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  balanceZone: { position: 'absolute', width: LADDER_R, height: LADDER_R, borderRadius: LADDER_R / 2, backgroundColor: 'rgba(92,201,138,0.25)' },
  balanceDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent },
  bar: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: C.raised, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.ice },
  skip: { color: C.muted, fontSize: 13, textAlign: 'center', textDecorationLine: 'underline', paddingTop: 4 },
  result: { alignItems: 'center', gap: 4, paddingVertical: 30 },
  grade: { fontSize: 30, fontWeight: '900' },
  score: { color: C.muted, fontSize: 16 },
});
