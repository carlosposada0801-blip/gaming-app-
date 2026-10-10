import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  HAND_LABEL, LAYER_LABEL, WEATHER_LABEL, atStop, chooseEvent, clone, currentFt, doAction, elevAt, eventChoices, handOuter,
  handicapNote, listActions, moveBlockedReason, partTrend, recommendChoice, roped, routeOf, summitOf, warmthTrend, type Action,
} from '../game/engine';
import {
  TIME_SCALE, beatSeconds, breathsPerStep, legAt, metersToNext, nextStopName, restStepActive, speed, walkMut,
} from '../game/movement';
import { ENDINGS } from '../game/endings';
import { EVENT_BY_ID } from '../game/events';
import { dayOf, formatClock, formatFt } from '../game/route';
import type { GameState, LogEntry, Pace, Stats } from '../game/types';
import { MountainScene, type CameraControl, type LiveMove } from '../scene/MountainScene';
import { RestStep } from './RestStep';
import { SkillGame } from './SkillGame';
import { anchorStep, legOf } from '../game/skills';
import { has } from '../game/helpers';
import { SEASONS } from '../game/season';
import { oxConcern, readPartnerOx, readPulseOx } from '../game/vitals';
import { useClimbAudio } from '../audio/useClimbAudio';
import { loadSoundOn, saveSoundOn } from './storage';
import type { SkillId } from '../game/types';
import { Thumbstick, type Stick } from './Thumbstick';
import { C, NUM, climberLook, partnerLook, statColor } from './theme';

type VitalKey = keyof Stats | 'hands' | 'feet';
const VITALS: { key: VitalKey; label: string; inverted?: boolean }[] = [
  { key: 'stamina', label: 'Stamina' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'hydration', label: 'Water' },
  { key: 'energy', label: 'Energy' },
  { key: 'ams', label: 'Altitude', inverted: true },
  { key: 'morale', label: 'Morale' },
  { key: 'hands', label: 'Hands' },
  { key: 'feet', label: 'Feet' },
];

const vitalValue = (s: GameState, k: VitalKey) => (k === 'hands' ? s.handTemp : k === 'feet' ? s.footTemp : s.stats[k]);

/** Everyday actions that get a one-tap button; everything else lives under Options. */
const QUICK = ['drink', 'eat', 'layer:up', 'layer:down', 'hands', 'rest'];

const TONE_COLOR: Record<NonNullable<LogEntry['tone']>, string> = { good: C.good, bad: C.bad, info: C.ice };
const GLASS = 'rgba(10,17,26,0.78)';

const fire = (p: Promise<void>) => { p.catch(() => {}); };

export function ClimbScreen({
  state,
  onState,
  onFinish,
  onPhoto,
}: {
  state: GameState;
  onState: (s: GameState) => void;
  onFinish: () => void;
  /** Called with the summit photo's URI when it is taken. */
  onPhoto?: (uri: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const control = useRef<CameraControl>({ yaw: 0, dist: 8, overview: false });
  const [overview, setOverview] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'options' | 'notes'>('none');
  const [skillRun, setSkillRun] = useState<{ index: number; skill: SkillId } | null>(null);
  const shot = useRef<(() => Promise<string | null>) | null>(null);

  // Summit photo: a moment after topping out, from the follow camera.
  useEffect(() => {
    if (!state.summited) return;
    const id = setTimeout(() => {
      shot.current?.().then((uri) => onPhoto?.(uri)).catch(() => onPhoto?.(null));
    }, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.summited]);

  // Your partner speaks up: a speech bubble for a few seconds.
  const [bubble, setBubble] = useState<string | null>(null);
  useEffect(() => {
    if (!state.partnerSays) return;
    setBubble(state.partnerSays);
    const id = setTimeout(() => setBubble(null), 7000);
    return () => clearTimeout(id);
  }, [state.partnerSays]);

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
    // A slip gives no time to read a menu: if you carry an axe, the self-arrest starts at once.
    if (state.pendingEvent === 'slip' && !state.flags.noArrest) {
      const i = eventChoices(state).findIndex((c) => c.skill === 'arrest' && !c.disabled);
      if (i >= 0) setSkillRun({ index: i, skill: 'arrest' });
    }
  }, [state.pendingEvent]);

  const stateRef = useRef(state);
  stateRef.current = state;

  function commit(next: GameState, quiet = false) {
    const prev = stateRef.current;
    if (next === prev) return;
    stateRef.current = next;
    const newest = next.log[0];
    const prevNewest = prev.log[0];
    const freshBad = newest?.tone === 'bad' && (newest.text !== prevNewest?.text || newest.clock !== prevNewest?.clock);
    if (next.ending && !prev.ending) {
      fire(Haptics.notificationAsync(
        ENDINGS[next.ending].good ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      ));
    } else if (next.summited && !prev.summited) {
      fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } else if (freshBad) {
      fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    } else if (next.node !== prev.node) {
      fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    } else if (!quiet) {
      fire(Haptics.selectionAsync());
    }
    onState(next);
  }

  // ---------- walking ----------
  const stick = useRef<Stick>({ x: 0, y: 0 });
  const rhythm = useRef(0.6);
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  autoRef.current = auto;
  const live = useRef<LiveMove>({ dist: state.dist, lateral: state.lateral, speed: 0 });
  const working = useRef<GameState | null>(null);
  const lastCommit = useRef(0);
  const [walking, setWalking] = useState(false);
  const walkingRef = useRef(false);
  const [pace, setPace] = useState<Pace | null>(null);
  const paceRef = useRef<Pace | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => { loadSoundOn().then(setSoundOn); }, []);
  useClimbAudio({ state, live, walking, pace, paused: !!skillRun, enabled: soundOn });

  useEffect(() => {
    if (!working.current) {
      live.current.dist = state.dist;
      live.current.lateral = state.lateral;
    }
  }, [state]);

  useEffect(() => {
    let raf = 0;
    let last = Date.now();
    const flush = () => {
      const w = working.current;
      if (!w) return;
      working.current = null;
      lastCommit.current = Date.now();
      commit(w, true);
    };
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const base = working.current ?? stateRef.current;
      const y = autoRef.current ? 0.65 : stick.current.y;
      const x = autoRef.current ? 0 : stick.current.x;
      const push = Math.min(1, Math.hypot(x, y));
      let moving = false;
      let stridePace: Pace | null = null;
      if (push > 0.12 && !base.ending && !base.pendingEvent) {
        const w = working.current ?? (working.current = clone(base));
        const pace: Pace = push < 0.45 ? 'rest' : push < 0.85 ? 'steady' : 'push';
        stridePace = pace;
        const gameMinutes = (dt * TIME_SCALE) / 60;
        // Forward/back from the stick; a sideways-only push still edges you forward slowly.
        const along = Math.abs(y) > 0.12 ? Math.sign(y) : 0.3;
        const meters = speed(w, pace) * gameMinutes * along;
        // "Right" on screen is right of the way you face.
        const side = (w.dir === 'up' ? 1 : -1) * (Math.abs(x) > 0.12 ? x : 0);
        const node0 = w.node;
        const moved = walkMut(w, meters, { pace, rhythm: rhythm.current, lateral: w.lateral + side * 2.5 * dt });
        moving = moved > 0;
        live.current = { dist: w.dist, lateral: w.lateral, speed: moved / Math.max(dt, 1e-3) };
        const arrived = w.node !== node0;
        if (!moving && autoRef.current) setAuto(false);
        if (arrived && autoRef.current) setAuto(false);
        if (arrived || w.pendingEvent || w.ending || !moving || now - lastCommit.current > 150) flush();
      } else {
        live.current.speed = 0;
        flush();
      }
      if (moving !== walkingRef.current) {
        walkingRef.current = moving;
        setWalking(moving);
      }
      const shownPace = moving ? stridePace : null;
      if (shownPace !== paceRef.current) {
        paceRef.current = shownPace;
        setPace(shownPace);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = (id: string) => {
    setSheet('none');
    setAuto(false);
    const base = working.current ?? stateRef.current;
    working.current = null;
    commit(doAction(base, id));
  };

  const R = routeOf(state);
  const node = R.nodes[state.node];
  // Walking replaces the old "Climb to X" buttons: drop every go:* action.
  const actions = listActions(state).filter((a) => !a.id.startsWith('go:'));
  const primary = actions.filter((a) => a.primary);
  const quick = QUICK.map((id) => actions.find((a) => a.id === id)).filter((a): a is Action => !!a);
  const more = actions.filter((a) => !a.primary && !QUICK.includes(a.id));
  const stopped = atStop(state);
  const next = nextStopName(state);
  const toNext = metersToNext(state);
  const place = stopped ? node.name : R.legs[legAt(state)].name;
  const elevM = elevAt(state);
  const showRhythm = restStepActive(state) && !state.ending && !state.pendingEvent;
  const [panelH, setPanelH] = useState(220);
  // On top, pushing forward starts the descent, so the summit message doesn't block the stick.
  const onTop = state.node === summitOf(state) && state.dir === 'up';
  const blocked = onTop ? undefined : moveBlockedReason(state);
  const trend = warmthTrend(state);
  const handTrend = partTrend(state, 'hands');
  const footTrend = partTrend(state, 'feet');
  const ox = has(state, 'oximeter') ? readPulseOx(state, pace) : null;
  const partnerOx = ox ? readPartnerOx(state, pace) : null;
  const event = state.pendingEvent ? EVENT_BY_ID[state.pendingEvent] : null;
  // Guided climbs: the guide points at the choice they'd make.
  const guidePick = useMemo(
    () => (event && state.mode === 'guided' ? recommendChoice(state) : -1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.pendingEvent, state.mode],
  );
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
          live={live}
          paused={!!skillRun}
          season={state.season}
          route={state.route}
          shot={shot}
        />
      </View>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {/* ---------- top HUD ---------- */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.chip} pointerEvents="none">
            <Text style={styles.place} numberOfLines={1}>{place.toUpperCase()}</Text>
            <Text style={[styles.big, NUM]}>{formatFt(currentFt(state))}</Text>
          </View>
          <View style={[styles.chip, { alignItems: 'flex-end' }]} pointerEvents="none">
            <Text style={[styles.place, NUM]}>{SEASONS[state.season].label.toUpperCase()} · DAY {dayOf(state.clock)} · {state.dir === 'up' ? 'UP' : 'DOWN'}</Text>
            <Text style={[styles.big, NUM]}>{formatClock(state.clock)}</Text>
          </View>
        </View>

        <View style={styles.vitals} pointerEvents="none">
          {VITALS.map(({ key, label, inverted }) => {
            const v = vitalValue(state, key);
            const color = statColor(v, inverted);
            const arrow = key === 'warmth' && trend !== 'ok' ? (trend === 'cold' ? ' ↓' : ' ↑')
              : key === 'hands' && handTrend === 'cold' && v < 100 ? ' ↓'
                : key === 'feet' && footTrend === 'cold' && v < 100 ? ' ↓' : '';
            return (
              <View key={key} style={styles.vital}>
                <View style={styles.vitalTop}>
                  <Text style={styles.vitalLabel}>
                    {label}
                    {arrow ? <Text style={{ color: arrow === ' ↑' ? C.warn : C.ice }}>{arrow}</Text> : null}
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

        {ox && partnerOx ? (
          <View style={styles.oxRow} pointerEvents="none" accessibilityLabel={`Pulse oximeter: you ${ox.spo2} percent, heart rate ${ox.hr}. Partner ${partnerOx.spo2} percent, ${partnerOx.hr}.`}>
            <Text style={styles.oxLabel}>SpO₂</Text>
            <Text style={[styles.oxNum, NUM, { color: oxColor(oxConcern(ox.spo2, state, pace)) }]}>{ox.spo2}%</Text>
            <Text style={[styles.oxSub, NUM]}>♥ {ox.hr}</Text>
            <Text style={styles.oxLabel}>  PARTNER</Text>
            <Text style={[styles.oxNum, NUM, { color: oxColor(oxConcern(partnerOx.spo2, state, pace)) }]}>{partnerOx.spo2}%</Text>
            <Text style={[styles.oxSub, NUM]}>♥ {partnerOx.hr}</Text>
          </View>
        ) : null}

        <View style={styles.subRow} pointerEvents="box-none">
          <Text style={[styles.weather, state.weather !== 'clear' && { color: C.warn }]} pointerEvents="none" numberOfLines={1}>
            {WEATHER_LABEL[state.weather]} · {LAYER_LABEL[state.layer]}
            {state.wet > 30 ? <Text style={{ color: C.warn }}>{state.wet > 65 ? ' · soaked' : ' · damp'}</Text> : null}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={styles.smallChip}
            onPress={() => {
              setSoundOn((on) => {
                saveSoundOn(!on);
                return !on;
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={soundOn ? 'Mute sound' : 'Turn sound on'}
          >
            <Text style={styles.smallChipText}>{soundOn ? 'Sound on' : 'Muted'}</Text>
          </Pressable>
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

      {bubble && !event && !ending ? (
        <View style={[styles.bubble, { bottom: panelH + 150 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={styles.bubbleText}>{bubble}</Text>
        </View>
      ) : null}

      {/* ---------- controls over the scene ---------- */}
      {!ending && !event && (
        <View style={[styles.controls, { bottom: panelH + 10 }]} pointerEvents="box-none">
          <Thumbstick stick={stick} disabled={!!blocked} />
          {showRhythm ? (
            <RestStep interval={beatSeconds(elevM)} breaths={breathsPerStep(elevM)} walking={walking} quality={rhythm} />
          ) : <View />}
        </View>
      )}

      {/* ---------- bottom panel ---------- */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]} onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}>
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
            <Text style={state.lastOutcome ? styles.outcome : styles.caption} numberOfLines={4}>
              {state.lastOutcome ?? (stopped ? node.desc : `${R.legs[legAt(state)].name}.`)}
            </Text>
            {onTop ? <Text style={styles.toNext}>Push the stick forward to start down.</Text> : null}
            {next ? (
              <Text style={[styles.toNext, NUM]}>
                {toNext >= 1000 ? `${(toNext / 1000).toFixed(1)} km` : `${Math.round(toNext)} m`} to {next}
                {Math.abs(state.lateral) > 1.5 ? '  ·  off the boot track' : ''}
              </Text>
            ) : null}
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
              {next && !blocked ? (
                <Pressable
                  onPress={() => setAuto((a) => !a)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={auto ? 'Stop walking' : `Auto-walk to ${next}`}
                >
                  <Text style={[styles.link, auto && { color: C.accent }]}>{auto ? 'Stop walking' : 'Auto-walk'}</Text>
                </Pressable>
              ) : null}
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

      {/* ---------- skill mini-game ---------- */}
      {event && skillRun && (
        <SkillGame
          skill={skillRun.skill}
          title={event.title}
          slopeDeg={R.legs[legOf(state)].slopeDeg}
          anchor={anchorStep(state)}
          note={handicapNote(state, skillRun.skill)}
          allowDice={state.mode !== 'hardcore'}
          onDone={(perf) => {
            const idx = skillRun.index;
            setSkillRun(null);
            commit(chooseEvent(stateRef.current, idx, undefined, perf));
          }}
        />
      )}

      {/* ---------- event sheet ---------- */}
      {event && !skillRun && (
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
                    onPress={() => (ch.skill && !(ch.skill === 'arrest' && state.flags.noArrest)
                      ? setSkillRun({ index: i, skill: ch.skill })
                      : commit(chooseEvent(state, i)))}
                    style={({ pressed }) => [styles.row, ch.disabled && { opacity: 0.45 }, pressed && { backgroundColor: C.line }]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!ch.disabled }}
                  >
                    <Text style={styles.rowText}>{ch.label}</Text>
                    {i === guidePick ? <Text style={styles.guidePick}>Your guide’s call</Text> : null}
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
  return { drink: 'Drink', eat: 'Eat', 'layer:up': 'Layer +', 'layer:down': 'Layer −', hands: 'Hands', rest: 'Break' }[id] ?? id;
}

/** A reading well under what's typical at this height is a red flag (see src/game/vitals.ts). */
function oxColor(c: 'ok' | 'low' | 'very low') {
  return c === 'very low' ? C.bad : c === 'low' ? C.warn : C.ice;
}

function quickDetail(id: string, s: GameState) {
  switch (id) {
    case 'drink': return `${s.water.toFixed(1)} L`;
    case 'eat': return `${s.food} left`;
    case 'layer:up': return s.layer < 3 ? LAYER_LABEL[(s.layer + 1) as 0 | 1 | 2 | 3] : 'All on';
    case 'layer:down': return s.layer > 0 ? LAYER_LABEL[(s.layer - 1) as 0 | 1 | 2 | 3] : 'Base';
    case 'hands': {
      const o = handOuter(s);
      return HAND_LABEL[o === 'mitts' ? 2 : o === 'gloves' ? 1 : 0];
    }
    case 'rest': return '20 min';
    default: return '';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  controls: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  toNext: { color: C.ice, fontSize: 12, fontWeight: '700' },

  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  chip: { backgroundColor: GLASS, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11, maxWidth: '58%' },
  place: { color: C.ice, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  big: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 1 },
  vitals: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: 7, columnGap: 12, backgroundColor: GLASS, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 11,
  },
  vital: { width: '21%', flexGrow: 1 },
  vitalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  vitalLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  vitalNum: { fontSize: 11, fontWeight: '800' },
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  oxRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 5, alignSelf: 'flex-start', backgroundColor: GLASS, borderRadius: 999,
    paddingVertical: 4, paddingHorizontal: 11,
  },
  oxLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  oxNum: { fontSize: 13, fontWeight: '800' },
  oxSub: { color: C.muted, fontSize: 11, fontWeight: '600' },
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
  quickLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
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
  guidePick: { color: C.good, fontSize: 12, fontWeight: '800', marginTop: 3 },
  bubble: {
    position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(231,238,245,0.94)', borderRadius: 14,
    paddingVertical: 9, paddingHorizontal: 13,
  },
  bubbleText: { color: '#0c141e', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  note: { flexDirection: 'row', gap: 10 },
  noteClock: { color: C.faint, fontSize: 12, width: 64 },
  noteText: { color: C.muted, fontSize: 13, lineHeight: 18, flex: 1 },
});
