# Summit Rainier

A 3D mountaineering survival game for phones, built with Expo / React Native and three.js.
Pack real climbing gear, then climb Mount Rainier's Disappointment Cleaver route from Paradise
(5,400 ft) to Columbia Crest (14,411 ft) and back, managing stamina, warmth, water, food,
altitude sickness, morale, weather and time.

## Play it on your phone

1. Install **Expo Go** from the App Store or Google Play.
2. On a computer with Node.js 22+:
   ```sh
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone's camera (iPhone) or with Expo Go (Android).

## Put it on the App Store

With an Apple Developer account ($99/year), EAS builds and signs the app in the cloud, so no Mac is required:

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform ios
npx eas-cli@latest submit --platform ios
```

The bundle ID is `com.carlosposada.summitrainier` (set in `app.json`); change it if it's taken.

See `CLAUDE.md` for how the game is put together.

## Credits

Terrain is the real Mount Rainier: elevation data from AWS Terrain Tiles (Terrarium), derived from
USGS 3DEP and SRTM. See `tools/dem/` to regenerate it.
