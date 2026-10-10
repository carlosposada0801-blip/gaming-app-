import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { dailyClimb, newGame } from './src/game/engine';
import { computeScore } from './src/game/endings';
import { routeOf } from './src/game/helpers';
import { EMPTY_PROFILE, recordClimb, skillLevels, type ClimbResult, type Profile } from './src/game/profile';
import type { GameState } from './src/game/types';
import { buy, effectsFor, finishTrip, newCareer, usable, work, type Career, type TripDef } from './src/game/career';
import { CareerScreen } from './src/ui/CareerScreen';
import { SnowSchoolScreen } from './src/ui/SnowSchoolScreen';
import { ClimbScreen } from './src/ui/ClimbScreen';
import { EndScreen } from './src/ui/EndScreen';
import { LogbookScreen } from './src/ui/LogbookScreen';
import { PackScreen } from './src/ui/PackScreen';
import { PlanScreen, type Plan } from './src/ui/PlanScreen';
import { TitleScreen } from './src/ui/TitleScreen';
import { keepPhoto } from './src/ui/photo';
import { loadBest, loadProfile, saveBestIfHigher, saveProfile, type Best } from './src/ui/storage';
import { C } from './src/ui/theme';

type Screen = 'title' | 'plan' | 'pack' | 'climb' | 'end' | 'logbook' | 'career' | 'school';

const DEFAULT_PLAN: Plan = { route: 'dc', season: 'july', partner: 'veteran', mode: 'standard', seed: '', daily: false };

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [packed, setPacked] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [game, setGame] = useState<GameState | null>(null);
  const [highestNode, setHighestNode] = useState(0);
  const [best, setBest] = useState<Best | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [result, setResult] = useState<ClimbResult | null>(null);
  const photo = useRef<string | null>(null);
  // Career: the trip under way, gear rented for it, and what the debrief says about money and wear.
  const [trip, setTrip] = useState<TripDef | null>(null);
  const [rented, setRented] = useState<string[]>([]);
  const [careerNotes, setCareerNotes] = useState<string[]>([]);

  function saveCareer(c: Career, extra: Partial<Profile> = {}) {
    setProfile((p) => {
      const next = { ...p, ...extra, career: c };
      saveProfile(next);
      return next;
    });
  }

  function openCareer() {
    if (!profile.career) saveCareer(newCareer());
    setScreen('career');
  }

  function goTrip(t: TripDef) {
    if (t.id === 'school') {
      setTrip(t);
      setScreen('school');
      return;
    }
    const c = profile.career;
    if (!c) return;
    setTrip(t);
    setRented([]);
    setPlan({ ...plan, route: t.route ?? plan.route, season: t.season ?? plan.season, mode: 'standard', seed: '', daily: false });
    const have = new Set(usable(c, []));
    setPacked(packed.filter((id) => have.has(id)));
    setScreen('pack');
  }

  useEffect(() => {
    loadBest().then(setBest);
    loadProfile().then(setProfile);
  }, []);

  const today = dailyClimb();

  function startClimb() {
    photo.current = null;
    setGame(newGame(packed, {
      season: plan.season,
      route: plan.route,
      partner: plan.partner,
      mode: plan.mode,
      seed: plan.seed || undefined,
      skills: skillLevels(profile),
      career: trip && profile.career ? effectsFor(profile.career, packed) : undefined,
    }));
    setHighestNode(0);
    setResult(null);
    setScreen('climb');
  }

  function startDaily() {
    setTrip(null);
    setPlan({ ...DEFAULT_PLAN, route: today.route, season: today.season, partner: today.partner, seed: today.seed, daily: true });
    setScreen('pack');
  }

  function updateGame(next: GameState) {
    setGame(next);
    setHighestNode((h) => Math.max(h, next.node));
  }

  async function finishClimb() {
    if (!game?.ending) return;
    const score = computeScore(game);
    setNewBest(score > 0 && score > (best?.score ?? -1));
    setScreen('end');
    const kept = await keepPhoto(photo.current);
    let base = profile;
    const badges: string[] = [];
    setCareerNotes([]);
    if (trip && profile.career) {
      const t = finishTrip(profile.career, trip, game, rented);
      setCareerNotes(t.notes);
      const done = t.career.done.includes(trip.id) && !profile.career.done.includes(trip.id);
      // The Camp Muir day hike is altitude and navigation practice.
      const xp = trip.id === 'muir' && done ? { ...profile.xp, acclim: profile.xp.acclim + 2, nav: profile.xp.nav + 1 } : profile.xp;
      if (trip.id === 'rainier' && done) badges.push('career');
      base = { ...profile, xp, career: t.career };
    }
    const r = recordClimb(base, game, { daily: plan.daily, highFt: routeOf(game).nodes[highestNode].ft, photo: kept, badges });
    setResult(r);
    setProfile(r.profile);
    saveProfile(r.profile);
    setBest(await saveBestIfHigher({ score, ending: game.ending, summited: game.summited }));
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {screen === 'title' && (
          <TitleScreen
            best={best}
            dailyScore={profile.daily[today.day]}
            onStart={() => { setTrip(null); setScreen('plan'); }}
            onDaily={startDaily}
            onLogbook={() => setScreen('logbook')}
            onCareer={openCareer}
            careerStarted={!!profile.career}
          />
        )}
        {screen === 'plan' && (
          <PlanScreen plan={plan} setPlan={setPlan} profile={profile} onNext={() => setScreen('pack')} onBack={() => setScreen('title')} />
        )}
        {screen === 'pack' && (
          <PackScreen
            packed={packed}
            setPacked={setPacked}
            plan={plan}
            career={trip && profile.career ? {
              career: profile.career,
              trip,
              rented,
              setRented,
              onBuy: (id) => saveCareer(buy(profile.career!, id)),
            } : undefined}
            onStart={startClimb}
            onBack={() => setScreen(trip ? 'career' : plan.daily ? 'title' : 'plan')}
          />
        )}
        {screen === 'climb' && game && (
          <ClimbScreen state={game} onState={updateGame} onFinish={finishClimb} onPhoto={(uri) => { photo.current = uri; }} />
        )}
        {screen === 'end' && game && (
          <EndScreen
            state={game}
            highestNode={highestNode}
            best={best}
            newBest={newBest}
            result={result}
            careerNotes={trip ? careerNotes : undefined}
            onAgain={() => {
              if (trip) {
                setScreen('career');
                return;
              }
              // A new climb gets a new seed; the Daily Climb stays the Daily Climb.
              if (!plan.daily) setPlan({ ...plan, seed: '' });
              setScreen(plan.daily ? 'pack' : 'plan');
            }}
            onReplay={() => {
              setPlan({ ...plan, seed: game.seed });
              setScreen('pack');
            }}
            onTitle={() => setScreen('title')}
          />
        )}
        {screen === 'logbook' && <LogbookScreen profile={profile} onBack={() => setScreen('title')} />}
        {screen === 'career' && profile.career && (
          <CareerScreen
            career={profile.career}
            profile={profile}
            plan={plan}
            setPlan={setPlan}
            onWork={() => saveCareer(work(profile.career!))}
            onGo={goTrip}
            onBack={() => { setTrip(null); setScreen('title'); }}
          />
        )}
        {screen === 'school' && trip && profile.career && (
          <SnowSchoolScreen
            onDone={(_avg, passed) => {
              // Snow school is a "trip" that counts as done when you pass.
              const fake = { ending: 'retreat', summited: passed, packed: [], log: [], usedEvents: [], flags: {} } as unknown as GameState;
              const t = finishTrip(profile.career!, trip, fake, []);
              const c = passed ? t.career : { ...t.career, done: t.career.done.filter((x) => x !== 'school') };
              saveCareer(c, passed ? {
                xp: { ...profile.xp, arrest: profile.xp.arrest + 3 },
                badges: profile.badges.includes('school') ? profile.badges : [...profile.badges, 'school'],
              } : {});
              setTrip(null);
              setScreen('career');
            }}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
