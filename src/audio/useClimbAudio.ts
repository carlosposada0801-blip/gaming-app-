import { useEffect, useRef } from 'react';
import { elevAt, profileOf, roped, routeOf } from '../game/engine';
import { legAt } from '../game/movement';
import { SEASONS } from '../game/season';
import type { GameState, Pace } from '../game/types';
import type { LiveMove } from '../scene/MountainScene';
import { sound, type Surface } from './sound';

const M_TO_FT = 3.28084;

/**
 * What's underfoot: out of Muir you cross the Cowlitz Glacier on snow, then scramble the rock of
 * Cathedral Gap (roughly 10,300 to 10,700 ft; approximate) and later the Cleaver itself. Below the
 * season's snowline, the dirt trail.
 */
export function surfaceAt(s: GameState): Surface {
  const leg = legAt(s);
  const terrain = routeOf(s).legs[leg].terrain;
  const ft = elevAt(s) * M_TO_FT;
  if (terrain === 'cleaver' || terrain === 'ridge' || (terrain === 'gap' && ft > 10300 && ft < 10700)) return 'rock';
  if (ft < SEASONS[s.season].snowlineFt) return 'dirt';
  return 'snow';
}

/** Rope-team calls for the events that need one. */
const CALLS: Record<string, string> = {
  rockfall_gap: 'Rock! Rock!',
  slip: 'Falling!',
  crevasse: 'Falling!',
  avalanche: 'Avalanche!',
};

/**
 * Drives the mixer from the climb: ambience from altitude, weather and effort; a footstep in time
 * with the walk animation; a clink of hardware now and then on the rope.
 */
export function useClimbAudio(opts: {
  state: GameState;
  live: React.MutableRefObject<LiveMove>;
  walking: boolean;
  pace: Pace | null;
  paused: boolean;
  enabled: boolean;
}) {
  const { state, live, walking, pace, paused, enabled } = opts;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    sound.start();
    return () => sound.stop();
  }, []);

  useEffect(() => {
    sound.setEnabled(enabled);
  }, [enabled]);

  // Ambience.
  useEffect(() => {
    const elev = elevAt(state);
    const alt = Math.max(0, Math.min(1, (elev - 1600) / 2800));
    const w = state.weather;
    const weatherWind = w === 'storm' ? 0.55 : w === 'windy' ? 0.4 : w === 'coldsnap' ? 0.3 : w === 'whiteout' ? 0.25 : 0;
    const effort = !walking || paused ? 0 : pace === 'push' ? 1 : pace === 'steady' ? 0.6 : 0.35;
    const tired = state.stats.stamina < 30 ? 0.2 : 0;
    sound.ambience({
      wind: paused ? 0.08 : 0.12 + alt * 0.35 + weatherWind,
      gust: paused ? 0 : Math.max(0, alt - 0.55) * 0.5 + (w === 'storm' || w === 'windy' ? 0.45 : 0),
      breath: paused ? 0 : effort * (0.25 + alt * 0.45) + tired + (state.stats.ams > 50 ? 0.1 : 0),
      breathRate: 0.85 + effort * 0.35 + alt * 0.3 + tired,
    });
  }, [state, walking, pace, paused]);

  // Calls when an event starts.
  useEffect(() => {
    const call = state.pendingEvent ? CALLS[state.pendingEvent] : undefined;
    if (call) sound.call(call);
  }, [state.pendingEvent]);

  // Footsteps and hardware.
  useEffect(() => {
    if (!walking || paused) return;
    let raf = 0;
    let last = Date.now();
    let phase = 0;
    let nextClink = 3 + Math.random() * 6;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // The walk clip is 1.03 s for two steps, sped up the same way the climber's animation is.
      const timeScale = Math.max(0.6, Math.min(3, (live.current.speed || 1.3) / 1.3));
      phase += (dt * timeScale) / 0.517;
      if (phase >= 1) {
        phase -= 1;
        const surf = surfaceAt(stateRef.current);
        sound.shot(surf, surf === 'rock' ? 0.55 : 0.4);
      }
      nextClink -= dt;
      if (nextClink <= 0) {
        nextClink = 4 + Math.random() * 8;
        const s = stateRef.current;
        if (roped(s) && s.dist > profileOf(s).nodeDist[routeOf(s).camp]) sound.shot(Math.random() < 0.7 ? 'clink' : 'rope', 0.35);
        else sound.shot('clink', 0.2); // poles and the axe on your pack
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [walking, paused, live]);
}
