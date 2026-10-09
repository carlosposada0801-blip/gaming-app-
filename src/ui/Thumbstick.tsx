import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { C } from './theme';

export interface Stick {
  /** -1 (left) .. 1 (right) */
  x: number;
  /** -1 (back) .. 1 (forward) */
  y: number;
}

const SIZE = 132;
const KNOB = 56;
const R = (SIZE - KNOB) / 2;

/** A virtual thumbstick. Writes its position into `stick` every move; springs back on release. */
export function Thumbstick({ stick, disabled }: { stick: React.MutableRefObject<Stick>; disabled?: boolean }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        origin.current = { x: e.nativeEvent.locationX - SIZE / 2, y: e.nativeEvent.locationY - SIZE / 2 };
        const len = Math.hypot(origin.current.x, origin.current.y);
        const k = len > R ? R / len : 1;
        const kx = origin.current.x * k;
        const ky = origin.current.y * k;
        stick.current = { x: kx / R, y: -ky / R };
        setKnob({ x: kx, y: ky });
      },
      onPanResponderMove: (_, g) => {
        let x = origin.current.x + g.dx;
        let y = origin.current.y + g.dy;
        const len = Math.hypot(x, y);
        if (len > R) {
          x *= R / len;
          y *= R / len;
        }
        stick.current = { x: x / R, y: -y / R };
        setKnob({ x, y });
      },
      onPanResponderRelease: () => {
        stick.current = { x: 0, y: 0 };
        setKnob({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        stick.current = { x: 0, y: 0 };
        setKnob({ x: 0, y: 0 });
      },
    }),
    [stick],
  );
  const push = Math.hypot(knob.x, knob.y) / R;
  const pace = push < 0.12 ? '' : push < 0.45 ? 'Rest step' : push < 0.85 ? 'Steady' : 'Push';
  return (
    <View style={[styles.wrap, disabled && { opacity: 0.35 }]} pointerEvents={disabled ? 'none' : 'auto'}>
      <View style={styles.base} {...pan.panHandlers} accessibilityLabel="Movement stick" accessibilityHint="Drag up to climb, down to go back, sideways to leave the track">
        <View style={styles.ring} pointerEvents="none" />
        <View style={[styles.knob, { transform: [{ translateX: knob.x }, { translateY: knob.y }] }]} pointerEvents="none" />
      </View>
      <Text style={styles.pace}>{pace || 'Drag to walk'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  base: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: 'rgba(10,17,26,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  ring: { position: 'absolute', width: SIZE * 0.62, height: SIZE * 0.62, borderRadius: SIZE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: 'rgba(231,238,245,0.85)', borderWidth: 2, borderColor: C.accent },
  pace: { color: C.text, fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
});
