# Project Memory

Feature: Flutter Android client for TeamTime  
Status: approved  
Do not record secrets, credentials, access tokens, or sensitive personal data.

## Approved decisions and rationale

- **Firebase option A:** FCM + Crashlytics + Analytics only. NestJS remains source of truth so mobile does not fork identity or chat from web/desktop.
- **v1 member core:** Home, Teams, DMs, Calls, Activity, Files, People, self Settings, presence. Admin/Apps/announcement-admin/Calendar module/iOS deferred to keep a shippable phone app.
- **Android only:** Avoid Apple Developer/signing blockers in v1; Dart stays reusable.
- **Native Jitsi SDK:** Official `jitsi_meet_flutter_sdk` against `meet.teamtime.live`. Packaged SDK 11.6 requires **minSdk 26** (handbook still mentions 24).
- **Sign-in only:** Login, 2FA, forgot/reset, change password. Workspace register stays on web.
- **Brief approved** 2026-08-19. App id `live.teamtime.app`. Default API (debug & release) `https://communication.impmeet.com`.

## Current progress

- `prd.md` approved.
- `design.md` approved.
- `architecture.md` approved.
- `rules.md` approved.
- `phases.md` approved.
- All six feature documents approved.
- Phases 0–6 implemented in `mobile/` + backend FCM path.
- Debug APK built: `mobile/build/app/outputs/flutter-apk/app-debug.apk`.
- Server FCM: service account `teamtime-fcm` on `communication-5f5bd`; local key at gitignored `backend/.secrets/firebase-admin.json`; env `FIREBASE_SERVICE_ACCOUNT_PATH`.
- Web FCM: Firebase web app on same project; Next enrolls after login (`NEXT_PUBLIC_FIREBASE_*` in gitignored `.env.local`). Electron skipped (native toasts). VAPID remains fallback.
- Flutter FCM: token on login/hydrate + refresh; background handler; notification tap routing.
- 2026-08-29 multi-agent review fixes: mobile call events corrected to past tense (`call.accepted/declined/ended/cancelled`), `callerName` added to `call.invite`, single app-scoped socket provider with reconnect banner + fresh-token reconnects, single-flight refresh with `forceSignOut` wiring, router-level `allowedNavKeys` gating (covers push deep links), cleartext disabled in release (debug manifest keeps emulator/LAN), `teamtime_push` channel created via `flutter_local_notifications`, mandatory refresh-on-401/logout-clear unit tests added, unused plugins removed.

## Important context

- Web push today is VAPID; `Device.pushToken` is unique; web stores JSON PushSubscription strings. Android FCM tokens are opaque strings — send path must branch.
- Socket names that already broke a previous desktop stub: do not use `message:new` / `call:incoming` (colon). Use dotted names like the Next app.
- Jitsi script on web: `https://meet.teamtime.live/external_api.js`.
- Home may show dashboard event cards without shipping a Calendar module.

## Active risks

- FCM and Crashlytics stay dark until `google-services.json` / web config / admin creds are present on that machine.
- Jitsi Android manifest `android:label` merge conflicts are expected.
- Physical-device debug will not work with `10.0.2.2` (emulator-only loopback).

## Unresolved noncritical questions

- Store listing copy and final launcher icon.
- Whether Home event cards are shown or hidden if the dashboard payload includes them.

## Changes affecting future work

- iOS: add Firebase iOS app, Apple push setup, and QA — new feature folder or an approved PRD amendment.
- If register-on-mobile is requested later, that conflicts with non-goals; update PRD before building it.
- If someone asks to put chat in Firestore, that conflicts with architecture; refuse until documents change.
