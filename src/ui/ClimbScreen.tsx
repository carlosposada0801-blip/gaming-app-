import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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

const VITALS: { key: keyof Stats; label: string; inverted?: boolean }[] = [
  { key: 'stamina', label: 'Stamina' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'hydration', label: 'Water' },
  { key: 'energy', label: 'Energy' },
  { key: 'ams', label: 'Altitude', inverted: true },
  { key: 'morale', label: 'Morale' },
];

/** Everyday actions that get a one-tap button; everything else lives under Options. */
const QUICK = ['drink', 'eat', 'layer:up', 'layer:down', 'rest'];

const TONE_COLOR: Record<NonNullable<LogEntry['tone']>, string> = { good: C.good, bad: C.bad, info: C.ice };
const GLASS = 'rgba(10,17,26,0.78)';

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

  const control = useRef<CameraControl>({ yaw: 0, dist: 8, overview: false });
  const [overview, setOverview] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'options' | 'notes'>('none');

  const drag = useRef({ yaw: 0, dist: 8 });
  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drag.current = { yaw: control.current.yaw, dist: control.current.dist };
      },
      onPanResponderMove: (_, g) => {
        control.current.yaw = drag.current.yaw - g.dx * 0.008;
        control.current.dist = Math.max(3, Math.min(40, drag.current.dist + g.dy * 0.06));
      },
    }),
    [],
  );

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

  const act = (id: string) => {
    setSheet('none');
    commit(doAction(state, id));
  };

  const node = NODES[state.node];
  const actions = listActions(state);
  const primary = actions.filter((a) => a.primary);
  const quick = QUICK.map((id) => actions.find((a) => a.id === id)).filter((a): a is Action => !!a);
  const more = actions.filter((a) => !a.primary && !QUICK.includes(a.id));
  const blocked = moveBlockedReason(state);
  const trend = warmthTrend(state);
  const event = state.pendingEvent ? EVENT_BY_ID[state.pendingEvent] : null;
  const ending = state.ending ? ENDINGS[state.ending] : null;

  return (
    <View style={styles.root}>
      {/* ---------- full-screen mountain ---------- */}
      <View style={StyleSheet.absoluteFill}>
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
          facing={state.dir}
        />
      </View>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {/* ---------- top HUD ---------- */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.chip} pointerEvents="none">
            <Text style={styles.place} numberOfLines={1}>{node.name.toUpperCase()}</Text>
            <Text style={[styles.big, NUM]}>{formatFt(node.ft)}</Text>
          </View>
          <View style={[styles.chip, { alignItems: 'flex-end' }]} pointerEvents="none">
            <Text style={[styles.place, NUM]}>DAY {dayOf(state.clock)} · {state.dir === 'up' ? 'ASCENT' : 'DESCENT'}</Text>
            <Text style={[styles.big, NUM]}>{formatClock(state.clock)}</Text>
          </View>
        </View>

        <View style={styles.vitals} pointerEvents="none">
          {VITALS.map(({ key, label, inverted }) => {
            const v = state.stats[key];
            const color = statColor(v, inverted);
            const arrow = key === 'warmth' && trend !== 'ok' ? (trend === 'cold' ? ' ↓' : ' ↑') : '';
            return (
              <View key={key} style={styles.vital}>
                <View style={styles.vitalTop}>
                  <Text style={styles.vitalLabel}>
                    {label}
                    {arrow ? <Text style={{ color: trend === 'cold' ? C.ice : C.warn }}>{arrow}</Text> : null}
                  </Text>
                  <Text style={[styles.vitalNum, NUM, { color }]}>{Math.round(v)}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, v))}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.subRow} pointerEvents="box-none">
          <Text style={[styles.weather, state.weather !== 'clear' && { color: C.warn }]} pointerEvents="none">
            {WEATHER_LABEL[state.weather]} · {LAYER_LABEL[state.layer]}
          </Text>
          <Pressable
            style={styles.smallChip}
            onPress={() => {
              control.current.overview = !control.current.overview;
              control.current.yaw = 0;
              setOverview(control.current.overview);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.smallChipText}>{overview ? 'Climber' : 'Route'}</Text>
          </Pressable>
        </View>
      </View>

      {/* ---------- bottom panel ---------- */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
        {ending ? (
          <>
            <Text style={[styles.endTitle, { color: ending.good ? C.good : C.bad }]}>{ending.title}</Text>
            <Text style={styles.caption}>{state.lastOutcome ?? ending.body}</Text>
            <Pressable style={styles.primaryBtn} onPress={onFinish} accessibilityRole="button">
              <Text style={styles.primaryText}>See your debrief</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={state.lastOutcome ? styles.outcome : styles.caption} numberOfLines={5}>
              {state.lastOutcome ?? node.desc}
            </Text>
            {blocked ? <Text style={styles.blocked}>{blocked}</Text> : null}
            {primary.map((a) => (
              <Pressable
                key={a.id}
                disabled={a.disabled}
                onPress={() => act(a.id)}
                style={({ pressed }) => [styles.primaryBtn, a.disabled && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{a.label}</Text>
                {a.detail ? <Text style={[styles.primaryDetail, NUM]}>{a.detail}</Text> : null}
              </Pressable>
            ))}
            <View style={styles.quickRow}>
              {quick.map((a) => (
                <Pressable
                  key={a.id}
                  disabled={a.disabled}
                  onPress={() => act(a.id)}
                  style={({ pressed }) => [styles.quick, a.disabled && { opacity: 0.35 }, pressed && { backgroundColor: C.line }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.label}. ${a.detail ?? ''}`}
                >
                  <Text style={styles.quickLabel}>{quickLabel(a.id)}</Text>
                  <Text style={[styles.quickDetail, NUM]} numberOfLines={1}>{quickDetail(a.id, state)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.linkRow}>
              <Pressable onPress={() => setSheet('options')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Options{more.length ? ` (${more.length})` : ''}</Text>
              </Pressable>
              <Pressable onPress={() => setSheet('notes')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Field notes</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* ---------- options / notes sheets ---------- */}
      {sheet !== 'none' && !event && (
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet('none')} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: height * 0.75 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{sheet === 'options' ? 'Options' : 'Field notes'}</Text>
              <Pressable onPress={() => setSheet('none')} hitSlop={10} accessibilityRole="button">
                <Text style={styles.link}>Done</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              {sheet === 'options'
                ? more.map((a) => (
                  <Pressable
                    key={a.id}
                    disabled={a.disabled}
                    onPress={() => act(a.id)}
                    style={({ pressed }) => [styles.row, a.disabled && { opacity: 0.4 }, pressed && { backgroundColor: C.line }]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rowText}>{a.label}</Text>
                    {a.detail ? <Text style={[styles.rowDetail, NUM]}>{a.detail}</Text> : null}
                  </Pressable>
                ))
                : state.log.map((e, i) => (
                  <View key={i} style={styles.note}>
                    <Text style={[styles.noteClock, NUM]}>{formatClock(e.clock)}</Text>
                    <Text style={[styles.noteText, e.tone && { color: TONE_COLOR[e.tone] }]}>{e.text}</Text>
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ---------- event sheet ---------- */}
      {event && (
        <View style={styles.scrim}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: height * 0.8 }]}>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <Text style={styles.eventKicker}>{node.name.toUpperCase()} · {formatClock(state.clock)}</Text>
              <Text style={styles.sheetTitle}>{event.title}</Text>
              <Text style={styles.eventText}>{event.text(state)}</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {eventChoices(state).map((ch, i) => (
                  <Pressable
                    key={i}
                    disabled={ch.disabled}
                    onPress={() => commit(chooseEvent(state, i))}
                    style={({ pressed }) => [styles.row, ch.disabled && { opacity: 0.45 }, pressed && { backgroundColor: C.line }]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!ch.disabled }}
                  >
                    <Text style={styles.rowText}>{ch.label}</Text>
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

function quickLabel(id: string) {
  return { drink: 'Drink', eat: 'Eat', 'layer:up': 'Layer +', 'layer:down': 'Layer −', rest: 'Break' }[id] ?? id;
}

function quickDetail(id: string, s: GameState) {
  switch (id) {
    case 'drink': return `${s.water.toFixed(1)} L`;
    case 'eat': return `${s.food} left`;
    case 'layer:up': return s.layer < 3 ? LAYER_LABEL[(s.layer + 1) as 0 | 1 | 2 | 3] : 'All on';
    case 'layer:down': return s.layer > 0 ? LAYER_LABEL[(s.layer - 1) as 0 | 1 | 2 | 3] : 'Base';
    case 'rest': return '20 min';
    default: return '';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  chip: { backgroundColor: GLASS, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11, maxWidth: '58%' },
  place: { color: C.ice, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  big: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 1 },
  vitals: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: 7, columnGap: 12, backgroundColor: GLASS, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 11,
  },
  vital: { width: '29%', flexGrow: 1 },
  vitalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  vitalLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  vitalNum: { fontSize: 11, fontWeight: '800' },
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weather: {
    color: C.good, fontSize: 11, fontWeight: '700', backgroundColor: GLASS, borderRadius: 999, overflow: 'hidden',
    paddingVertical: 4, paddingHorizontal: 10,
  },
  smallChip: { backgroundColor: GLASS, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  smallChipText: { color: C.ice, fontSize: 12, fontWeight: '700' },

  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,17,26,0.9)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 14, gap: 10,
  },
  caption: { color: C.muted, fontSize: 14, lineHeight: 20 },
  outcome: { color: C.text, fontSize: 14, lineHeight: 20 },
  blocked: { color: C.warn, fontSize: 13, fontWeight: '600' },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  primaryText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
  primaryDetail: { color: '#4a2109', fontSize: 12, marginTop: 1 },
  quickRow: { flexDirection: 'row', gap: 6 },
  quick: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingVertical: 8, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  quickLabel: { color: C.text, fontSize: 13, fontWeight: '700' },
  quickDetail: { color: C.faint, fontSize: 10, marginTop: 1 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 2 },
  link: { color: C.ice, fontSize: 14, fontWeight: '600' },
  endTitle: { fontSize: 22, fontWeight: '800' },

  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,9,14,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 18, gap: 12,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  eventKicker: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  eventText: { color: C.text, fontSize: 15, lineHeight: 22 },
  row: { backgroundColor: C.raised, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { color: C.text, fontSize: 15, fontWeight: '700' },
  rowDetail: { color: C.muted, fontSize: 12, marginTop: 2 },
  choiceHint: { color: C.warn, fontSize: 12, marginTop: 3 },
  note: { flexDirection: 'row', gap: 10 },
  noteClock: { color: C.faint, fontSize: 12, width: 64 },
  noteText: { color: C.muted, fontSize: 13, lineHeight: 18, flex: 1 },
});
