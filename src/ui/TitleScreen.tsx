import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dailyClimb, newGame } from '../game/engine';
import { ENDINGS } from '../game/endings';
import { RECOMMENDED } from '../game/gear';
import { DAY, NODES, SUMMIT, formatFt } from '../game/route';
import { PARTNERS } from '../game/partners';
import { SEASONS } from '../game/season';
import { MountainScene, type CameraControl } from '../scene/MountainScene';
import type { Best } from './storage';
import { C, NUM, climberLook, partnerLook } from './theme';

export function TitleScreen({
  best,
  dailyScore,
  onStart,
  onDaily,
  onLogbook,
  onCareer,
  careerStarted,
}: {
  best: Best | null;
  /** Today's Daily Climb score, if you've played it. */
  dailyScore?: number;
  onStart: () => void;
  onDaily: () => void;
  onLogbook: () => void;
  onCareer: () => void;
  /** Whether a career is under way (button says Continue). */
  careerStarted?: boolean;
}) {
  const daily = useMemo(() => dailyClimb(), []);
  const insets = useSafeAreaInsets();
  const control = useRef<CameraControl>({ yaw: 0, dist: 6, overview: false });
  // A sample party for the backdrop; the orbit camera never shows them up close.
  const demo = useMemo(() => newGame(RECOMMENDED, { rng: () => 0.5 }), []);

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        <MountainScene
          node={0}
          clock={DAY + 8 * 60}
          weather="clear"
          look={climberLook(demo)}
          partnerLook={partnerLook(demo)}
          roped={false}
          wands={false}
          mode="orbit"
          control={control}
        />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 24 }]} pointerEvents="none">
        <Text style={styles.eyebrow}>MOUNT RAINIER · FOUR ROUTES</Text>
        <Text style={styles.title}>Summit{'\n'}Rainier</Text>
        <Text style={[styles.elev, NUM]}>
          {formatFt(NODES[0].ft)} → {formatFt(NODES[SUMMIT].ft)}
        </Text>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 18 }]}>
        <Text style={styles.lede}>
          Pick a route and a partner, pack your own gear, then climb to Columbia Crest and back. Weather, cold, thin air,
          crevasses and the clock all get a say.
        </Text>
        {best ? (
          <Text style={[styles.best, NUM]}>
            Best score {best.score} · {ENDINGS[best.ending].title}
          </Text>
        ) : (
          <Text style={styles.best}>No climbs yet.</Text>
        )}
        <Pressable
          style={({ pressed }) => [styles.start, pressed && { opacity: 0.85 }]}
          onPress={onStart}
          accessibilityRole="button"
        >
          <Text style={styles.startText}>Plan a climb</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable style={styles.secondary} onPress={onDaily} accessibilityRole="button">
            <Text style={styles.secondaryText}>Daily Climb</Text>
            <Text style={styles.secondarySub}>
              {SEASONS[daily.season].label} · with {PARTNERS[daily.partner].name}{dailyScore !== undefined ? ` · ${dailyScore}` : ''}
            </Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onCareer} accessibilityRole="button">
            <Text style={styles.secondaryText}>Career</Text>
            <Text style={styles.secondarySub}>{careerStarted ? 'Continue' : 'Mt. Si to Rainier'}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onLogbook} accessibilityRole="button">
            <Text style={styles.secondaryText}>Logbook</Text>
            <Text style={styles.secondarySub}>Badges, photos</Text>
          </Pressable>
        </View>
        <Text style={styles.credits}>
          Terrain: USGS 3DEP elevation via AWS Terrain Tiles. Sound effects synthesized for this game; rope-team calls
          use your phone's built-in voice.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { paddingHorizontal: 24, gap: 8 },
  eyebrow: { color: C.ice, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: {
    color: C.text, fontSize: 54, fontWeight: '900', letterSpacing: -1.5, lineHeight: 54,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 12,
  },
  elev: { color: C.text, fontSize: 15, fontWeight: '600', opacity: 0.9 },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 20, gap: 14,
    backgroundColor: 'rgba(12,20,30,0.92)', borderTopWidth: 1, borderTopColor: C.line,
  },
  lede: { color: C.text, fontSize: 15, lineHeight: 22 },
  best: { color: C.muted, fontSize: 13 },
  start: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  startText: { color: '#1a0b03', fontSize: 17, fontWeight: '800' },
  credits: { color: C.faint, fontSize: 10, lineHeight: 14 },
  row: { flexDirection: 'row', gap: 8 },
  secondary: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  secondaryText: { color: C.ice, fontSize: 15, fontWeight: '700' },
  secondarySub: { color: C.faint, fontSize: 11, marginTop: 1 },
});
