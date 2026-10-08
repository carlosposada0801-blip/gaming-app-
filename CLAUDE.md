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

- `src/ui/TitleScreen.tsx`: orbiting mountain behind the title, best score, "Pack your gear".
- `src/ui/ClimbScreen.tsx`: follow-cam scene (top 55%) with drag to orbit/zoom and a route-view
  toggle, HUD (location, elevation, clock, day, weather), six stat bars with warmth trend,
  last outcome, node description, actions from `listActions`, event sheet with disabled-choice
  hints, ending card, collapsible field notes, haptics (warning on events, success on summit,
  error on bad outcomes).
- `src/ui/EndScreen.tsx`: ending title/body/lesson, score (with "New best"), time on route,
  high point, gear review tips, "Climb again" (keeps the packed list) and "Title".
- `src/ui/storage.ts`: best score in AsyncStorage.
- `App.tsx`: SafeAreaProvider, screen state machine, light status bar text on the dark UI.
- `app.json`: "Summit Rainier", dark, portrait, iPhone only, bundle ID / package
  `com.carlosposada.summitrainier`.
- Verified: `npx tsc --noEmit`, `npx expo export --platform ios` and `--platform android`
  bundle cleanly; a web build was clicked through title → pack → climb → event → ending → debrief.

## Still to do
1. Test on a real phone with Expo Go (`npx expo start`) and tune touch/camera feel.
2. `npx expo lint` (first run sets up ESLint; it needs network access to Expo's servers).
3. App Store: `npx eas-cli@latest build --platform ios`, then `npx eas-cli@latest submit --platform ios`
   (needs an Apple Developer account).

## Design
Alpine-start palette in `src/ui/theme.ts`: pre-dawn slate background, glacier-ice blue
for data, rescue orange for primary buttons. System fonts, tabular numbers for stats.
Keep copy plain and accurate to real mountaineering.

## Ideas for later
- Pick a route (Emmons, Kautz) and a season (spring avalanche gear matters).
- Partner with their own gear and stats; party decisions.
- Training mode before the climb (gains stamina), real permits and costs.
- Sound: wind, crampons on ice, rope team calls ("ROCK!").
