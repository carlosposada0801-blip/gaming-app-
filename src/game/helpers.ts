import { GEAR_BY_ID } from './gear';
import { PROFILES } from './data/routeProfile';
import { ROUTES } from './routes';
import type { GameState } from './types';

/** The route this climb is on, and its terrain profile. */
export const routeOf = (s: GameState) => ROUTES[s.route];
export const profileOf = (s: GameState) => PROFILES[s.route];
/** Index of the summit stop (Columbia Crest) on this route. */
export const summitOf = (s: GameState) => ROUTES[s.route].nodes.length - 1;

export function has(s: GameState, id: string) {
  if (!s.packed.includes(id)) return false;
  if (s.campLeft && GEAR_BY_ID[id]?.camp) return false;
  return true;
}

export const FORECAST_TEXT = {
  stable: 'High pressure over the Cascades. Light wind, freezing level well above the summit.',
  unsettled: 'A weak trough arrives on summit day. Rising wind and clouds possible after mid-morning.',
  incoming: 'A Pacific front arrives on summit day. Strong wind on the upper mountain, snow by afternoon.',
} as const;

export const roped = (s: GameState) => has(s, 'rope') && has(s, 'harness');
export const crampons = (s: GameState) => has(s, 'crampons_steel') || has(s, 'crampons_alu');
