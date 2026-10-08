import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EndingId } from '../game/types';

const BEST_KEY = 'summit-rainier/best';

export interface Best {
  score: number;
  ending: EndingId;
  summited: boolean;
}

export async function loadBest(): Promise<Best | null> {
  try {
    const raw = await AsyncStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as Best) : null;
  } catch {
    return null;
  }
}

/** Saves `run` if it beats the stored best. Returns the best after saving. */
export async function saveBestIfHigher(run: Best): Promise<Best> {
  const prev = await loadBest();
  if (prev && prev.score >= run.score) return prev;
  try {
    await AsyncStorage.setItem(BEST_KEY, JSON.stringify(run));
  } catch {
    // Storage unavailable: keep the best for this session only.
  }
  return run;
}
