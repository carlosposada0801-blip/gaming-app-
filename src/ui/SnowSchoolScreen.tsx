import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SCHOOL_PASS } from '../game/career';
import { SkillGame } from './SkillGame';
import { C, NUM } from './theme';

/** Three practice slides on a slope with a safe runout, each a little steeper. */
const DRILLS = [
  { title: 'Feet first, on your stomach', slope: 25, tip: 'The easy one: roll toward the axe head, pick in by your shoulder, toes in.' },
  { title: 'Feet first, on your back', slope: 30, tip: 'Roll toward the axe head, not the spike, or the spike catches and flips you.' },
  { title: 'Head first, on your back', slope: 35, tip: 'Plant the pick out to the side and let it swing your feet around below you.' },
];

export function SnowSchoolScreen({ onDone }: { onDone: (avg: number, passed: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [scores, setScores] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const i = scores.length;
  const finished = i >= DRILLS.length;
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const passed = finished && avg >= SCHOOL_PASS;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
      <Text style={styles.kicker}>SNOW SCHOOL</Text>
      <Text style={styles.h1}>Self-arrest practice</Text>
      <Text style={styles.body}>
        A guide runs you down a practice slope with a safe runout, over and over. Pass with an average of {Math.round(SCHOOL_PASS * 100)}% or better over three drills.
      </Text>
      {DRILLS.map((d, k) => (
        <View key={k} style={[styles.drill, k === i && !finished && styles.drillOn]}>
          <Text style={styles.drillTitle}>{k + 1}. {d.title} · {d.slope}°</Text>
          <Text style={styles.small}>{d.tip}</Text>
          {scores[k] !== undefined ? <Text style={[styles.score, NUM, { color: scores[k] >= SCHOOL_PASS ? C.good : C.warn }]}>{Math.round(scores[k] * 100)}%</Text> : null}
        </View>
      ))}
      <View style={{ flex: 1 }} />
      {finished ? (
        <>
          <Text style={[styles.result, { color: passed ? C.good : C.warn }]}>
            {passed ? `Passed with ${Math.round(avg * 100)}%. The self-arrest skill is yours.` : `Average ${Math.round(avg * 100)}%. Not yet: come back and try again.`}
          </Text>
          <Pressable style={styles.start} onPress={() => onDone(avg, passed)} accessibilityRole="button">
            <Text style={styles.startText}>Back to your career</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.start} onPress={() => setRunning(true)} accessibilityRole="button">
          <Text style={styles.startText}>Slide: drill {i + 1}</Text>
        </Pressable>
      )}
      {running && !finished ? (
        <SkillGame
          skill="arrest"
          title={DRILLS[i].title}
          slopeDeg={DRILLS[i].slope}
          anchor=""
          allowDice={false}
          onDone={(perf) => {
            setRunning(false);
            setScores((s) => [...s, perf ?? 0]);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 18, gap: 12 },
  kicker: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800' },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  small: { color: C.faint, fontSize: 12, lineHeight: 17 },
  drill: { backgroundColor: C.panel, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: C.line },
  drillOn: { borderColor: C.accent },
  drillTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  score: { fontSize: 15, fontWeight: '800' },
  result: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  start: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  startText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
});
