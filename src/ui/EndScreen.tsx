import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtDuration } from '../game/engine';
import { ENDINGS, computeScore, gearReview } from '../game/endings';
import { NODES, START_CLOCK, formatFt } from '../game/route';
import { SEASONS } from '../game/season';
import type { GameState } from '../game/types';
import type { Best } from './storage';
import { C, NUM } from './theme';

export function EndScreen({
  state,
  highestNode,
  best,
  newBest,
  onAgain,
  onTitle,
}: {
  state: GameState;
  highestNode: number;
  best: Best | null;
  newBest: boolean;
  onAgain: () => void;
  onTitle: () => void;
}) {
  const insets = useSafeAreaInsets();
  const ending = ENDINGS[state.ending ?? 'retreat'];
  const score = computeScore(state);
  const tips = gearReview(state.packed, state.season);
  const high = NODES[highestNode];
  const f = state.flags;
  const injuries = [
    f.frostbiteHands ? 'Frostbitten fingers' : f.frostnipHands ? 'Frostnipped fingertips' : null,
    f.frostbiteFeet ? 'Frostbitten toes' : f.frostnipFeet ? 'Frostnipped toes' : null,
    f.frostnip ? 'Frostnip on your face' : null,
    f.snowBlind ? 'Snow blindness' : null,
    f.sunburn ? 'Bad sunburn' : null,
    f.ankle ? 'Sprained ankle' : null,
  ].filter((x): x is string => !!x);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 120, gap: 18 }}>
        <Text style={[styles.eyebrow, { color: ending.good ? C.good : C.bad }]}>
          {ending.good ? 'YOU MADE IT HOME' : 'RESCUED'} · {SEASONS[state.season].label.toUpperCase()}
        </Text>
        <Text style={styles.title}>{ending.title}</Text>
        <Text style={styles.body}>{ending.body}</Text>

        <View style={styles.stats}>
          <Stat label="SCORE" value={String(score)} accent={newBest ? 'New best' : undefined} />
          <Stat label="TIME ON ROUTE" value={fmtDuration(state.clock - START_CLOCK)} />
          <Stat label="HIGH POINT" value={formatFt(high.ft)} sub={high.name} />
          <Stat label="BEST SCORE" value={best ? String(best.score) : '—'} />
        </View>

        <View style={styles.lesson}>
          <Text style={styles.section}>THE LESSON</Text>
          <Text style={styles.lessonText}>{ending.lesson}</Text>
        </View>

        {injuries.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.section}>INJURIES</Text>
            {injuries.map((t) => (
              <View key={t} style={styles.tip}>
                <View style={[styles.bullet, { backgroundColor: C.bad }]} />
                <Text style={styles.tipText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {tips.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.section}>GEAR REVIEW</Text>
            {tips.map((t) => (
              <View key={t} style={styles.tip}>
                <View style={styles.bullet} />
                <Text style={styles.tipText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {tips.length === 0 && <Text style={styles.body}>Your pack had everything a guide would bring.</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.secondary} onPress={onTitle} accessibilityRole="button">
          <Text style={styles.secondaryText}>Title</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={onAgain} accessibilityRole="button">
          <Text style={styles.primaryText}>Climb again</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, NUM]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      {accent ? <Text style={[styles.statSub, { color: C.accent, fontWeight: '800' }]}>{accent}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  body: { color: C.muted, fontSize: 15, lineHeight: 22 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48.5%', backgroundColor: C.panel, borderRadius: 10, padding: 12, gap: 2 },
  statLabel: { color: C.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  statValue: { color: C.text, fontSize: 22, fontWeight: '800' },
  statSub: { color: C.muted, fontSize: 12 },
  section: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  lesson: { backgroundColor: C.panel, borderLeftWidth: 3, borderLeftColor: C.ice, borderRadius: 8, padding: 14, gap: 6 },
  lessonText: { color: C.text, fontSize: 15, lineHeight: 22 },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn, marginTop: 8 },
  tipText: { color: C.text, fontSize: 14, lineHeight: 20, flex: 1 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12,
    backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.line,
  },
  secondary: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  secondaryText: { color: C.ice, fontSize: 16, fontWeight: '700' },
  primary: { flex: 2, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
});
