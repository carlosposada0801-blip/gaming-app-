import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  LAYER_LABEL, WEATHER_LABEL, chooseEvent, doAction, eventChoices, listActions, moveBlockedReason, roped,
  warmthTrend, type Action,
} from '../game/engine';
import { ENDINGS } from '../game/endings';
import { EVENT_BY_ID } from '../game/events';
import { NODES, dayOf, formatClock, formatFt } from '../game/route';
import type { GameState, LogEntry, Stats } from '../game/types';
import { MountainScene, type CameraControl } from '../scene/MountainScene';
import { C, NUM, climberLook, partnerLook, statColor } from './theme';

const STAT_ROWS: { key: keyof Stats; label: string; inverted?: boolean }[] = [
  { key: 'stamina', label: 'Stamina' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'hydration', label: 'Water' },
  { key: 'energy', label: 'Energy' },
  { key: 'ams', label: 'Altitude', inverted: true },
  { key: 'morale', label: 'Morale' },
];

const TONE_COLOR: Record<NonNullable<LogEntry['tone']>, string> = { good: C.good, bad: C.bad, info: C.ice };

const fire = (p: Promise<void>) => { p.catch(() => {}); };

export function ClimbScreen({
  state,
  onState,
  onFinish,
}: {
  state: GameState;
  onState: (s: GameState) => void;
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sceneH = Math.round(height * 0.55);

  const control = useRef<CameraControl>({ yaw: 0, dist: 6, overview: false });
  const [overview, setOverview] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const drag = useRef({ yaw: 0, dist: 6 });
  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drag.current = { yaw: control.current.yaw, dist: control.current.dist };
      },
      onPanResponderMove: (_, g) => {
        control.current.yaw = drag.current.yaw - g.dx * 0.008;
        control.current.dist = Math.max(2.5, Math.min(14, drag.current.dist + g.dy * 0.03));
      },
    }),
    [],
  );

  // Warn when an event appears.
  useEffect(() => {
    if (state.pendingEvent) fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  }, [state.pendingEvent]);

  function commit(next: GameState) {
    if (next === state) return;
    const newest = next.log[0];
    const prevNewest = state.log[0];
    const freshBad = newest?.tone === 'bad' && (newest.text !== prevNewest?.text || newest.clock !== prevNewest?.clock);
    if (next.ending && !state.ending) {
      fire(Haptics.notificationAsync(
        ENDINGS[next.ending].good ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      ));
    } else if (next.summited && !state.summited) {
      fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } else if (freshBad) {
      fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    } else {
      fire(Haptics.selectionAsync());
    }
    onState(next);
  }

  const node = NODES[state.node];
  const actions = listActions(state);
  const primary = actions.filter((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const blocked = moveBlockedReason(state);
  const trend = warmthTrend(state);
  const event = state.pendingEvent ? EVENT_BY_ID[state.pendingEvent] : null;
  const ending = state.ending ? ENDINGS[state.ending] : null;

  return (
    <View style={styles.root}>
      {/* ---------- 3D scene + HUD ---------- */}
      <View style={{ height: sceneH }}>
        <MountainScene
          node={state.node}
          clock={state.clock}
          weather={state.weather}
          look={climberLook(state)}
          partnerLook={partnerLook(state)}
          roped={roped(state)}
          wands={!!state.flags.wandsPlaced}
          mode="follow"
          control={control}
        />
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

        <View style={[styles.hud, { top: insets.top + 8 }]} pointerEvents="none">
          <View style={styles.hudBox}>
            <Text style={styles.hudName} numberOfLines={1}>{node.name}</Text>
            <Text style={[styles.hudBig, NUM]}>{formatFt(node.ft)}</Text>
            <Text style={styles.hudSmall}>{state.dir === 'up' ? 'Ascending' : 'Descending'}</Text>
          </View>
          <View style={[styles.hudBox, { alignItems: 'flex-end' }]}>
            <Text style={[styles.hudBig, NUM]}>{formatClock(state.clock)}</Text>
            <Text style={styles.hudSmall}>Day {dayOf(state.clock)}</Text>
            <Text style={[styles.hudWeather, state.weather !== 'clear' && { color: C.warn }]}>
              {WEATHER_LABEL[state.weather]}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.viewToggle}
          onPress={() => {
            control.current.overview = !control.current.overview;
            control.current.yaw = 0;
            setOverview(control.current.overview);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.viewToggleText}>{overview ? 'Climber view' : 'Route view'}</Text>
        </Pressable>
        <Text style={styles.dragHint} pointerEvents="none">Drag to look around</Text>
      </View>

      {/* ---------- stats, story, actions ---------- */}
      <ScrollView style={styles.lower} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.stats}>
          {STAT_ROWS.map(({ key, label, inverted }) => {
            const v = state.stats[key];
            const color = statColor(v, inverted);
            return (
              <View key={key} style={styles.stat}>
                <View style={styles.statTop}>
                  <Text style={styles.statLabel}>
                    {label.toUpperCase()}
                    {key === 'warmth' && trend !== 'ok' ? (
                      <Text style={{ color: trend === 'cold' ? C.ice : C.warn }}>{trend === 'cold' ? '  ↓ COLD' : '  ↑ SWEATING'}</Text>
                    ) : null}
                  </Text>
                  <Text style={[styles.statNum, NUM, { color }]}>{Math.round(v)}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, v))}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[styles.kit, NUM]}>
          {LAYER_LABEL[state.layer]} · {state.water.toFixed(1)} L water · {state.food} food
        </Text>

        {state.lastOutcome ? (
          <View style={styles.outcome}>
            <Text style={styles.outcomeText}>{state.lastOutcome}</Text>
          </View>
        ) : null}

        {ending ? (
          <View style={[styles.endCard, { borderColor: ending.good ? C.good : C.bad }]}>
            <Text style={[styles.endTitle, { color: ending.good ? C.good : C.bad }]}>{ending.title}</Text>
            <Text style={styles.body}>{ending.body}</Text>
            <Pressable style={styles.primaryBtn} onPress={onFinish} accessibilityRole="button">
              <Text style={styles.primaryText}>See your debrief</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.body}>{node.desc}</Text>
            {blocked ? <Text style={styles.blocked}>{blocked}</Text> : null}
            <View style={{ gap: 8 }}>
              {primary.map((a) => (
                <ActionButton key={a.id} action={a} big onPress={() => commit(doAction(state, a.id))} />
              ))}
            </View>
            <View style={styles.grid}>
              {secondary.map((a) => (
                <ActionButton key={a.id} action={a} onPress={() => commit(doAction(state, a.id))} />
              ))}
            </View>
          </>
        )}

        <Pressable onPress={() => setNotesOpen((o) => !o)} style={styles.notesHead} accessibilityRole="button">
          <Text style={styles.notesTitle}>FIELD NOTES</Text>
          <Text style={styles.notesToggle}>{notesOpen ? 'Hide' : `Show ${state.log.length}`}</Text>
        </Pressable>
        {notesOpen && (
          <View style={{ gap: 8 }}>
            {state.log.map((e, i) => (
              <View key={i} style={styles.note}>
                <Text style={[styles.noteClock, NUM]}>{formatClock(e.clock)}</Text>
                <Text style={[styles.noteText, e.tone && { color: TONE_COLOR[e.tone] }]}>{e.text}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ---------- event sheet ---------- */}
      {event && (
        <View style={styles.scrim}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: height * 0.8 }]}>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <Text style={styles.sheetTitle}>{event.title}</Text>
              <Text style={styles.sheetText}>{event.text(state)}</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {eventChoices(state).map((ch, i) => (
                  <Pressable
                    key={i}
                    disabled={ch.disabled}
                    onPress={() => commit(chooseEvent(state, i))}
                    style={({ pressed }) => [styles.choice, ch.disabled && { opacity: 0.45 }, pressed && { backgroundColor: C.line }]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!ch.disabled }}
                  >
                    <Text style={styles.choiceText}>{ch.label}</Text>
                    {ch.hint ? <Text style={styles.choiceHint}>{ch.hint}</Text> : null}
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

function ActionButton({ action, big, onPress }: { action: Action; big?: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={action.disabled}
      onPress={onPress}
      style={({ pressed }) => [
        big ? styles.primaryBtn : styles.smallBtn,
        action.disabled && { opacity: 0.4 },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!action.disabled }}
    >
      <Text style={big ? styles.primaryText : styles.smallText}>{action.label}</Text>
      {action.detail ? <Text style={[big ? styles.primaryDetail : styles.smallDetail, NUM]}>{action.detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hud: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  hudBox: { backgroundColor: 'rgba(12,20,30,0.72)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, maxWidth: '55%' },
  hudName: { color: C.ice, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  hudBig: { color: C.text, fontSize: 19, fontWeight: '800' },
  hudSmall: { color: C.muted, fontSize: 11 },
  hudWeather: { color: C.good, fontSize: 12, fontWeight: '700', marginTop: 1 },
  viewToggle: {
    position: 'absolute', right: 12, bottom: 10, backgroundColor: 'rgba(12,20,30,0.78)', borderRadius: 999,
    borderWidth: 1, borderColor: C.line, paddingVertical: 7, paddingHorizontal: 13,
  },
  viewToggleText: { color: C.ice, fontSize: 12, fontWeight: '700' },
  dragHint: { position: 'absolute', left: 12, bottom: 14, color: 'rgba(231,238,245,0.6)', fontSize: 11 },
  lower: { flex: 1, borderTopWidth: 1, borderTopColor: C.line },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 14 },
  stat: { width: '30%', flexGrow: 1 },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  statLabel: { color: C.faint, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, flexShrink: 1 },
  statNum: { fontSize: 13, fontWeight: '800' },
  track: { height: 5, backgroundColor: C.raised, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  kit: { color: C.muted, fontSize: 12 },
  outcome: { backgroundColor: C.panel, borderLeftWidth: 3, borderLeftColor: C.ice, borderRadius: 8, padding: 12 },
  outcomeText: { color: C.text, fontSize: 14, lineHeight: 20 },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  blocked: { color: C.warn, fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  primaryText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
  primaryDetail: { color: '#3d1a08', fontSize: 12, marginTop: 2 },
  smallBtn: {
    width: '48.5%', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  smallText: { color: C.text, fontSize: 14, fontWeight: '700' },
  smallDetail: { color: C.faint, fontSize: 11, marginTop: 2 },
  endCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10, backgroundColor: C.panel },
  endTitle: { fontSize: 20, fontWeight: '800' },
  notesHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line },
  notesTitle: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, paddingTop: 8 },
  notesToggle: { color: C.ice, fontSize: 13, fontWeight: '600', paddingTop: 8 },
  note: { flexDirection: 'row', gap: 10 },
  noteClock: { color: C.faint, fontSize: 12, width: 64 },
  noteText: { color: C.muted, fontSize: 13, lineHeight: 18, flex: 1 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,9,14,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: C.line,
    paddingHorizontal: 18, paddingTop: 18,
  },
  sheetTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  sheetText: { color: C.text, fontSize: 15, lineHeight: 22 },
  choice: { backgroundColor: C.raised, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line },
  choiceText: { color: C.text, fontSize: 15, fontWeight: '700' },
  choiceHint: { color: C.warn, fontSize: 12, marginTop: 3 },
});
