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
6. Policy: Privacy policy = `/privacy.html`; Ads = no; Target audience = children; Data safety = nickname and random id (optional, deletable), no ads, no analytics; Content rating questionnaire.
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

## Each update

Raise `versionCode` and `versionName` in `apps/smash-it/android/app/build.gradle` and the Xcode Build number, then repeat from step 1.3 and the build steps.

## Before the first submit

- Test a release build on a real phone (iOS and Android).
- In the store build, decide if the hidden developer menu (7 taps on the version) should stay.
