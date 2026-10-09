// The mountain's sound: looping wind and breathing whose volume follows altitude, weather and
// effort, footsteps by surface, carabiner clinks, and rope-team calls spoken by the phone's own
// voice. Every sound file is synthesized by tools/audio/generate.ts; no recordings are used.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

const FILES = {
  wind: require('../../assets/sounds/wind.wav'),
  gust: require('../../assets/sounds/gust.wav'),
  breath: require('../../assets/sounds/breath.wav'),
  snow1: require('../../assets/sounds/snow1.wav'),
  snow2: require('../../assets/sounds/snow2.wav'),
  snow3: require('../../assets/sounds/snow3.wav'),
  rock1: require('../../assets/sounds/rock1.wav'),
  rock2: require('../../assets/sounds/rock2.wav'),
  dirt1: require('../../assets/sounds/dirt1.wav'),
  dirt2: require('../../assets/sounds/dirt2.wav'),
  clink1: require('../../assets/sounds/clink1.wav'),
  clink2: require('../../assets/sounds/clink2.wav'),
  rope: require('../../assets/sounds/rope.wav'),
} as const;

type Key = keyof typeof FILES;
export type Surface = 'snow' | 'rock' | 'dirt';

const SHOTS: Record<Surface | 'clink', Key[]> = {
  snow: ['snow1', 'snow2', 'snow3'],
  rock: ['rock1', 'rock2'],
  dirt: ['dirt1', 'dirt2'],
  clink: ['clink1', 'clink2'],
};

export interface Ambience {
  /** 0..1 */
  wind: number;
  gust: number;
  breath: number;
  /** Playback rate of the breathing loop (faster = harder breathing). */
  breathRate: number;
}

const safe = (fn: () => void) => {
  try { fn(); } catch { /* audio is a nicety; never crash the game over it */ }
};

class Mixer {
  private players = new Map<Key, AudioPlayer>();
  private loops: Key[] = ['wind', 'gust', 'breath'];
  private ready = false;
  enabled = true;

  private player(key: Key) {
    let p = this.players.get(key);
    if (!p) {
      p = createAudioPlayer(FILES[key]);
      this.players.set(key, p);
    }
    return p;
  }

  start() {
    if (this.ready) return;
    this.ready = true;
    // Respect the silent switch and mix with the player's own music.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    for (const k of this.loops) {
      safe(() => {
        const p = this.player(k);
        p.loop = true;
        p.volume = 0;
        if (this.enabled) p.play();
      });
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ready) return;
    for (const k of this.loops) safe(() => (on ? this.player(k).play() : this.player(k).pause()));
    if (!on) safe(() => { Speech.stop(); });
  }

  ambience(a: Ambience) {
    if (!this.ready || !this.enabled) return;
    safe(() => {
      this.player('wind').volume = clamp01(a.wind);
      this.player('gust').volume = clamp01(a.gust);
      const b = this.player('breath');
      b.volume = clamp01(a.breath);
      const rate = Math.max(0.7, Math.min(1.8, a.breathRate));
      if (Math.abs(b.playbackRate - rate) > 0.04) b.setPlaybackRate(rate);
    });
  }

  /** A one-shot from a small set of variations. */
  shot(kind: Surface | 'clink' | 'rope', volume = 1) {
    if (!this.ready || !this.enabled) return;
    const keys: Key[] = kind === 'rope' ? ['rope'] : SHOTS[kind];
    const key = keys[Math.floor(Math.random() * keys.length)];
    safe(() => {
      const p = this.player(key);
      p.volume = clamp01(volume);
      p.seekTo(0).then(() => p.play()).catch(() => {});
    });
  }

  /** A rope-team call, shouted by the phone's speech voice. */
  call(text: string) {
    if (!this.enabled) return;
    safe(() => {
      Speech.stop();
      Speech.speak(text, { rate: 1.05, pitch: 0.85, volume: 1 });
    });
  }

  stop() {
    for (const p of this.players.values()) safe(() => { p.pause(); p.remove(); });
    this.players.clear();
    this.ready = false;
    safe(() => { Speech.stop(); });
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const sound = new Mixer();
