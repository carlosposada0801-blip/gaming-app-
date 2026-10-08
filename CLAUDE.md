# Summit Rainier

A 3D mountaineering survival game for phones (Expo / React Native, TypeScript).
The player packs real climbing gear, then climbs Mount Rainier's Disappointment
Cleaver route from Paradise (5,400 ft) to Columbia Crest (14,411 ft) and back,
managing stamina, warmth, water, food, altitude sickness, morale, weather,
and time.

See AGENTS.md for Expo rules (use `npx expo install`, check versioned docs).

## Stack
- Expo SDK 57, React Native 0.86, React 19.2
- 3D: `three` + `@react-three/fiber` (import from `@react-three/fiber/native`) + `expo-gl`
- `react-native-safe-area-context`, `expo-haptics`, `@react-native-async-storage/async-storage`
- No Expo Router yet: a single game screen state machine in App.tsx is fine for now.

## Done
- `src/game/gear.ts`: ~40 real items with real weights (oz), categories, warmth/layer values,
  camp gear left at Muir on summit day, one-per-group boots and crampons.
- `src/game/route.ts`: 8 route nodes with real elevations, 7 legs with times and terrain.
- `src/game/types.ts`, `helpers.ts`: state types and gear checks.
- `src/game/engine.ts`: `newGame`, `listActions`, `doAction`, `eventChoices`, `chooseEvent`,
  weather model, warmth/insulation model, pacing (rest step / steady / push), sleeping at Muir,
  turnaround time, headlamp-at-night rule.
- `src/game/events.ts`: ~20 events (ranger check, whiteouts, rockfall, Cleaver, crevasse falls
  with prusik/Z-pulley rescue, ladder crossing, slips and self-arrest, lenticular cloud,
  wind/frostnip, partner HACE, sunrise, crater register, glissading, balling crampons).
- `src/game/endings.ts`: 10 endings with lessons, scoring, gear review tips.
- Engine was balanced with 2,000 simulated runs per loadout
  (guide's list + steady pace: ~79% summit, ~20% retreat).
- `src/scene/terrain.ts`: procedural volcano heightfield, route projected onto it, vertex colors.
- `src/scene/Climber.tsx`: low-poly climber built from primitives; shows helmet, glasses,
  headlamp, axe, poles, crampons, harness, rope coil, pack size; walk animation.
- `src/scene/MountainScene.tsx`: Canvas with terrain, route line, wands, Camp Muir huts/tents,
  crevasses, distant volcanoes, stars, snowfall, time-of-day sky/light/fog, headlamp spotlight,
  rope partner with rope, follow/overview/orbit camera driven by a `control` ref.
- `src/ui/theme.ts`: palette, `climberLook(state)`, `partnerLook(state)`, `statColor`.
- `src/ui/PackScreen.tsx`: gear packing screen with weights and a "guide's list" button.

## Still to build
1. `src/ui/TitleScreen.tsx`: MountainScene in `mode="orbit"` behind a title, best score from
   AsyncStorage, "Pack your gear" button.
2. `src/ui/ClimbScreen.tsx`:
   - MountainScene (top ~55% of screen, `mode="follow"`), with a transparent PanResponder
     overlay: horizontal drag changes `control.yaw`, vertical drag changes `control.dist`
     (clamp 2.5 to 14). A button toggles `control.overview` (route view vs climber view).
   - HUD over the scene: location + elevation (`formatFt`), clock + day + weather.
   - Six stat bars (altitude/AMS is inverted: high is bad) and a warmth trend label
     from `warmthTrend` ("cold" / "sweating").
   - Last outcome text (`state.lastOutcome`), node description, action buttons from
     `listActions` (primary action large), disabled reason from `moveBlockedReason`.
   - Event sheet when `state.pendingEvent` is set: title, `text(state)`, choices from
     `eventChoices` (disabled ones show their `hint`, e.g. "Needs an ice axe").
   - Collapsible "Field notes" list from `state.log`.
   - Haptics: warning when an event appears, success on summit, error on bad outcomes.
3. `src/ui/EndScreen.tsx`: ending title/body/lesson from `ENDINGS`, `computeScore`,
   time on route, highest point reached, `gearReview(packed)` tips, "Climb again"
   (back to pack screen keeping the previous list). Save best score to AsyncStorage.
4. `App.tsx`: SafeAreaProvider, screen state ('title' | 'pack' | 'climb' | 'end'),
   dark StatusBar, holds `packed` and `GameState`.
5. Set `app.json` name to "Summit Rainier", `userInterfaceStyle: "dark"`, portrait.
6. Verify: `npx tsc --noEmit`, `npx expo export --platform ios` and `--platform android`
   to confirm it bundles, then test on a phone with Expo Go (`npx expo start`).

## Design
Alpine-start palette in `src/ui/theme.ts`: pre-dawn slate background, glacier-ice blue
for data, rescue orange for primary buttons. System fonts, tabular numbers for stats.
Keep copy plain and accurate to real mountaineering.

## Ideas for later
- Pick a route (Emmons, Kautz) and a season (spring avalanche gear matters).
- Partner with their own gear and stats; party decisions.
- Training mode before the climb (gains stamina), real permits and costs.
- Sound: wind, crampons on ice, rope team calls ("ROCK!").
