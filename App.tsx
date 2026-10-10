import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { dailyClimb, newGame } from './src/game/engine';
import { computeScore } from './src/game/endings';
import { routeOf } from './src/game/helpers';
import { EMPTY_PROFILE, recordClimb, skillLevels, type ClimbResult, type Profile } from './src/game/profile';
import type { GameState } from './src/game/types';
import { ClimbScreen } from './src/ui/ClimbScreen';
import { EndScreen } from './src/ui/EndScreen';
import { LogbookScreen } from './src/ui/LogbookScreen';
import { PackScreen } from './src/ui/PackScreen';
import { PlanScreen, type Plan } from './src/ui/PlanScreen';
import { TitleScreen } from './src/ui/TitleScreen';
import { keepPhoto } from './src/ui/photo';
import { loadBest, loadProfile, saveBestIfHigher, saveProfile, type Best } from './src/ui/storage';
import { C } from './src/ui/theme';

type Screen = 'title' | 'plan' | 'pack' | 'climb' | 'end' | 'logbook';

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
    }));
    setHighestNode(0);
    setResult(null);
    setScreen('climb');
  }

  function startDaily() {
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
    const r = recordClimb(profile, game, { daily: plan.daily, highFt: routeOf(game).nodes[highestNode].ft, photo: kept });
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
            onStart={() => setScreen('plan')}
            onDaily={startDaily}
            onLogbook={() => setScreen('logbook')}
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
            onStart={startClimb}
            onBack={() => setScreen(plan.daily ? 'title' : 'plan')}
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
            onAgain={() => {
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
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
