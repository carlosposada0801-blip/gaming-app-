import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { newGame } from './src/game/engine';
import { computeScore } from './src/game/endings';
import type { GameState, Season } from './src/game/types';
import { ClimbScreen } from './src/ui/ClimbScreen';
import { EndScreen } from './src/ui/EndScreen';
import { PackScreen } from './src/ui/PackScreen';
import { TitleScreen } from './src/ui/TitleScreen';
import { loadBest, saveBestIfHigher, type Best } from './src/ui/storage';
import { C } from './src/ui/theme';

type Screen = 'title' | 'pack' | 'climb' | 'end';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [packed, setPacked] = useState<string[]>([]);
  const [season, setSeason] = useState<Season>('july');
  const [game, setGame] = useState<GameState | null>(null);
  const [highestNode, setHighestNode] = useState(0);
  const [best, setBest] = useState<Best | null>(null);
  const [newBest, setNewBest] = useState(false);

  useEffect(() => {
    loadBest().then(setBest);
  }, []);

  function startClimb() {
    setGame(newGame(packed, Math.random, season));
    setHighestNode(0);
    setScreen('climb');
  }

  function updateGame(next: GameState) {
    setGame(next);
    setHighestNode((h) => Math.max(h, next.node));
  }

  async function finishClimb() {
    if (!game?.ending) return;
    const score = computeScore(game);
    const saved = await saveBestIfHigher({ score, ending: game.ending, summited: game.summited });
    setNewBest(score > 0 && score > (best?.score ?? -1));
    setBest(saved);
    setScreen('end');
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {screen === 'title' && <TitleScreen best={best} onStart={() => setScreen('pack')} />}
        {screen === 'pack' && (
          <PackScreen
            packed={packed}
            setPacked={setPacked}
            season={season}
            setSeason={setSeason}
            onStart={startClimb}
            onBack={() => setScreen('title')}
          />
        )}
        {screen === 'climb' && game && <ClimbScreen state={game} onState={updateGame} onFinish={finishClimb} />}
        {screen === 'end' && game && (
          <EndScreen
            state={game}
            highestNode={highestNode}
            best={best}
            newBest={newBest}
            onAgain={() => setScreen('pack')}
            onTitle={() => setScreen('title')}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
