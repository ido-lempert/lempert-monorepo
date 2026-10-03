# Smash It: releasing to the App Store and Google Play

The store apps are a Capacitor shell (`apps/smash-it/ios`, `apps/smash-it/android`) around the same web build. The projects build here (iOS simulator build and Android debug APK both succeed). What is left needs your accounts and decisions.

## Decide before the first upload

- **App id** `site.lempert.smash` (the lempert.site domain, reversed; set in `capacitor.config.ts`, `android/app/build.gradle` and the Xcode project). It cannot change after the first upload. To change it anyway (before uploading): edit the config, then `npx cap sync`, and fix the same id in `android/app/build.gradle` (`namespace`, `applicationId`, and the folder `android/app/src/main/java/...`) and in Xcode (Signing and Capabilities, Bundle Identifier).
- **Server address.** The app runs from the device, so it needs the full public address of the deployed game for the leaderboards: `VITE_API_BASE=https://<your-render-host>/` (https, trailing slash). Without it the leaderboards do not work in the app (the game itself works offline).
- **Contact e-mail** for the privacy policy (both stores require one): build with `PRIVACY_CONTACT=you@example.com`. The privacy page is `https://<your-render-host>/privacy.html`.

## Build

```sh
export VITE_API_BASE=https://<your-render-host>/
npm run native:sync -w smash-it      # builds dist and copies it into ios/ and android/
npm run native:ios -w smash-it       # opens Xcode
npm run native:android -w smash-it   # opens Android Studio
```

Icons and splash screens come from `apps/smash-it/resources/` (`npm run native:assets -w smash-it` regenerates them).

## Apple App Store

1. Join the Apple Developer Program (paid, yearly).
2. Xcode: open the project, pick your Team under Signing and Capabilities, set the version and build number.
3. Product > Archive > Distribute App > App Store Connect.
4. App Store Connect: create the app, then paste texts from `store/listing.json` for each language (subtitle, description, keywords).
5. Privacy policy URL: `/privacy.html`. Privacy "nutrition label": the game collects a nickname and a random id only if the player joins the leaderboard (linked to nothing else, not used for tracking).
6. Age rating and **Kids Category**: choose it for a children's game. Apple then forbids third-party analytics and ads (the game has none) and requires a parental gate for any link out (the game has none).
7. Screenshots: 6.9-inch iPhone portrait (and iPad if you offer it) in each language you want shown.

## Google Play

1. Create a Google Play Console developer account (one-time fee).
2. Create a signing key (Android Studio: Build > Generate Signed App Bundle). Keep the keystore and its passwords safe; losing them locks you out of updates (or use Play App Signing).
3. Build the release bundle (`.aab`) and upload it to a closed or internal test track first. New personal accounts must run a closed test with testers for a set period before production access.
4. Store listing: texts from `store/listing.json` for each language (short description, full description), icon 512x512 (`public/icon-512.png`), feature graphic 1024x500, phone screenshots.
5. Data safety form: nickname and random id only when joining the leaderboard, can be deleted in the app; no ads, no purchases, no analytics.
6. Target audience: children (Families policy). Content rating questionnaire.
7. Privacy policy URL: `/privacy.html`.

## What the app already does for the kids' policies

- No ads, analytics, purchases or links out.
- Nicknames in the store apps come only from the dice (generated list), never free text.
- Leaving the leaderboard deletes the player from the server.
- Developer tools stay hidden unless someone taps the version seven times; consider whether you want that in the store build.

## Not verified

The shell has been built, not run on a physical phone or submitted. Test a release build on real iOS and Android devices (WebGL speed, safe areas, the leaderboard through `VITE_API_BASE`) before submitting.
