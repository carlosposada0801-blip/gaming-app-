# Whiteout Ridge

A 3D mountain-ascent survival game for iPhone. Climb from Base Camp (5,000 m) to the summit (8,000 m) while managing health, stamina, warmth and oxygen against rockfall, storms, nightfall and the death zone.

The game is HTML + [three.js](https://threejs.org) in `www/`, wrapped as a native iOS app with [Capacitor](https://capacitorjs.com) in `ios/`. Everything (three.js, fonts) is bundled, so the app works offline.

## Project layout

| Path | What it is |
| --- | --- |
| `www/index.html` | The whole game |
| `ios/` | Native Xcode project (Swift Package Manager, no CocoaPods) |
| `assets/` | Source images for the app icon and launch screen |
| `scripts/vendor.mjs` | Copies three.js and fonts from `node_modules` into `www/` |
| `capacitor.config.json` | App name, bundle ID, iOS settings |

## Run it on your iPhone

You need a Mac with **Xcode** (free from the Mac App Store) and **Node.js 22+**.

```sh
npm install
npm run sync      # bundles three.js + fonts into www/ and copies the game into the iOS project
npm run open      # opens the project in Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → choose your **Team** (sign in with your Apple ID under Xcode → Settings → Accounts).
2. If Xcode says the bundle ID is taken, change `com.carlosposada.whiteoutridge` to something unique, both there and in `capacitor.config.json`.
3. Plug in your iPhone (or pick a simulator) and press **Run** ▶. On a real phone, the first time you may need to turn on Developer Mode (Settings → Privacy & Security) and trust the developer (Settings → General → VPN & Device Management).

After changing `www/index.html`, run `npm run sync` again before building.

## Publish to the App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).
2. In [App Store Connect](https://appstoreconnect.apple.com), create a new app with the same bundle ID.
3. In Xcode, set the run destination to **Any iOS Device**, then **Product → Archive**. When the Organizer opens, choose **Distribute App → App Store Connect**.
4. In App Store Connect, add screenshots (6.9" iPhone), a description, an age rating, and a privacy policy URL. The game collects no data, so the privacy answers are "Data Not Collected".
5. Optionally test with friends through **TestFlight**, then **Submit for Review**.

## Notes

- iPhone only, portrait only, status bar hidden.
- Haptic feedback on falls, gusts, and the end of a climb (via `@capacitor/haptics`).
- Best altitude is saved on the device.
- A GitHub Actions workflow (`.github/workflows/ios-build.yml`) compiles the app for the iOS Simulator on every change, as a build check.

## Controls

Buttons below the mountain, swipe, or tap the left / middle / right of the mountain. On a computer: arrows / WASD to climb, E to bivouac at a camp after dusk, P to pause.
