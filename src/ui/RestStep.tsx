import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from './theme';

/** How close to the beat a tap must land, as a fraction of the beat interval. */
const WINDOW = 0.22;

/**
 * The rest step: lock the downhill knee, pause, breathe, step. A ring pulses on each step;
 * tap on the pulse. `quality` (0..1) tracks how well you keep the rhythm and feeds the stamina cost.
 */
export function RestStep({
  interval,
  breaths,
  walking,
  quality,
}: {
  /** Real seconds between steps. */
  interval: number;
  breaths: number;
  walking: boolean;
  quality: React.MutableRefObject<number>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const start = useRef(Date.now());
  const tapped = useRef(false);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const [q, setQ] = useState(quality.current);

  // Pulse the ring once per beat; count a beat with no tap as a miss while walking.
  useEffect(() => {
    start.current = Date.now();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: Math.max(200, interval * 1000 - 140), easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const id = setInterval(() => {
      if (walking && !tapped.current) {
        quality.current *= 0.85;
        setQ(quality.current);
      }
      tapped.current = false;
    }, interval * 1000);
    return () => {
      loop.stop();
      clearInterval(id);
    };
  }, [interval, walking, pulse, quality]);

  const tap = () => {
    const t = (Date.now() - start.current) / 1000;
    const phase = (t % interval) / interval; // 0 = on the beat
    const off = Math.min(phase, 1 - phase);
    if (off <= WINDOW && !tapped.current) {
      quality.current += (1 - quality.current) * 0.3;
      tapped.current = true;
      setFlash('hit');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      quality.current *= 0.8;
      setFlash('miss');
    }
    setQ(quality.current);
    setTimeout(() => setFlash(null), 180);
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringColor = flash === 'hit' ? C.good : flash === 'miss' ? C.bad : 'rgba(255,255,255,0.55)';
  return (
    <View style={styles.wrap}>
      <Pressable onPressIn={tap} accessibilityRole="button" accessibilityLabel="Rest step: tap on the pulse">
        <Animated.View style={[styles.ring, { borderColor: ringColor, transform: [{ scale }] }]}>
          <Text style={styles.big}>STEP</Text>
          <Text style={styles.small}>{breaths} breath{breaths > 1 ? 's' : ''}</Text>
        </Animated.View>
      </Pressable>
      <View style={styles.meter}>
        <View style={[styles.fill, { width: `${Math.round(q * 100)}%`, backgroundColor: q > 0.6 ? C.good : q > 0.35 ? C.warn : C.bad }]} />
      </View>
      <Text style={styles.label}>Rhythm</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 5 },
  ring: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 3, backgroundColor: 'rgba(10,17,26,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  big: { color: C.text, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  small: { color: C.muted, fontSize: 10, fontWeight: '600' },
  meter: { width: 84, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: '100%' },
  label: { color: C.text, fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
});
