# Smash It: uploading to the stores (do these in order)

App id: `site.lempert.smash`. Texts for every language: `apps/smash-it/store/listing.json`. Icons and splash: `apps/smash-it/resources/`.

## 1. Once, in the terminal

1. `export VITE_API_BASE=https://<your-render-host>/` (https, trailing slash)
2. `export PRIVACY_CONTACT=you@example.com`
3. `npm run native:sync -w smash-it`
4. Check `https://<your-render-host>/privacy.html` opens (deploy `main` first if not).

## 2. Google Play

1. Pay and sign up at play.google.com/console.
2. `npm run native:android -w smash-it` (Android Studio opens; JDK 21).
3. Build > Generate Signed App Bundle > Android App Bundle > Next.
4. Create new keystore, save the `.jks` and both passwords in a safe place. Next > release > Create.
5. Play Console > Create app > name `Smash It!`, game, free.
6. Policy: Privacy policy = `/privacy.html`; Ads = no; Target audience = children; Data safety = nickname and random id (optional, deletable), no ads, no analytics in the app (Umami counts visits in the web build only, `index.html` skips it when `Capacitor.isNativePlatform()`); Content rating questionnaire.
7. Store listing: per language paste `short` and `full` from `listing.json`; icon `apps/smash-it/public/icon-512.png`; feature graphic 1024x500; 2 or more phone screenshots.
8. Testing > Internal testing > Create release > upload the `.aab` > Save > Roll out.
9. Personal accounts: closed test with 12 testers for 14 days, then Production > Apply.

## 3. Apple App Store

1. Pay and sign up at developer.apple.com/programs.
2. `npm run native:ios -w smash-it` (Xcode opens).
3. Click project `App` > Signing & Capabilities > pick your Team. Bundle Identifier stays `site.lempert.smash`.
4. General: Version `1.0`, Build `1`.
5. Top bar: device = Any iOS Device (arm64). Product > Archive.
6. Organizer > Distribute App > App Store Connect > Upload.
7. appstoreconnect.apple.com > My Apps > + > New App > iOS, bundle id `site.lempert.smash`.
8. Per language paste `subtitle`, `full` (description) and `keywords` from `listing.json`.
9. App Privacy: Privacy Policy URL = `/privacy.html`; data = nickname and random id, not linked to identity, not for tracking.
10. Age Rating: answer all "None"; General > Kids Category (up to 8, or your choice).
11. Screenshots: 6.9-inch iPhone portrait (1320x2868) per language.
12. Build section: choose the uploaded build > Add for Review > Submit.

## Free: signed APK from GitHub (no developer account)

The page `https://smash.lempert.site/download.html` (all languages) links the newest GitHub release tagged `smash-it-v*`, so Android players install without a store.

Once: the keystore is `~/.smash-it-release/smash-it.jks` with `keystore.properties` next to it (never in git; the repo is public). Back both up: a lost keystore means players can't update, they would have to uninstall first.

Each release:

1. Raise `versionCode` and `versionName` in `apps/smash-it/android/app/build.gradle`.
2. `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home VITE_API_BASE=https://smash.lempert.site/`
3. `npm run native:sync -w smash-it`
4. `cd apps/smash-it/android && ./gradlew assembleRelease`
5. `cp app/build/outputs/apk/release/app-release.apk /tmp/smash-it.apk`
6. `gh release create smash-it-v<versionName> /tmp/smash-it.apk --title "Smash It! <versionName>" --notes "..." --target smash-it`
7. Merge to `main` once so `download.html` is deployed.

## Each update

Raise `versionCode` and `versionName` in `apps/smash-it/android/app/build.gradle` and the Xcode Build number, then repeat from step 1.3 and the build steps.

## Before the first submit

- Test a release build on a real phone (iOS and Android).
- In the store build, decide if the hidden developer menu (7 taps on the version) should stay.
