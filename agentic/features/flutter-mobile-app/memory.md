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
- 2026-09-03: Integrated custom curved gradient background asset (`assets/images/app_background.png`) into Android launch splash (`launch_background.xml`), Flutter `SplashScreen` (`/splash`), and global app wrapper (`AppBackground` in `TeamTimeApp` builder) with transparent scaffold theme.
- 2026-09-03: Applied modern reference design system across mobile: `TtButton` (white pill primary, glass pill secondary, filled blue), `TtSquircleBadge`, `TtGlassCard`, bold white hero typography with translucent subtitles, and rounded 20dp cards/inputs across Auth, Shell, Home, Chat, Calls, Activity, Files, People, Events, and Settings.
- 2026-09-03: Redesigned Chats feed layout (`chat_lists.dart`) to match clean reference design: bold "Chats" headline with more options `•••` action, large 54dp circular avatars, sender name in bold slate `#0F172A`, message preview with sent/read checkmarks, timestamp, and bright golden yellow circle unread count badges (`#F59E0B`).
- 2026-09-03: Resolved blank area when files are sent in chats: added attachment rendering in `ConversationScreen` (`conversation_screen.dart`) for images (constrained network previews + tap-to-zoom dialog) and documents (file cards with type icons, formatted size, and filename); added reload and auto-scroll on file attach; updated `chat_lists.dart` preview to show `📎 Shared a file`; updated `FilesScreen` to support backend `{ items: [...] }` payload; updated backend `FilesService.uploadFile` to broadcast `message.sent` and notification over RealtimeGateway.
- 2026-09-03: Implemented bidirectional mobile call ringing & global overlay: created animated `IncomingCallOverlay` with pulsating indicator and periodic heavy haptic feedback (`HapticFeedback.heavyImpact()`); mounted `IncomingCallOverlay` and calling banner globally in `TeamTimeApp` (`app.dart`) so incoming calls display over any screen (chats, files, settings, etc.); added local heads-up notification with sound and vibration via `flutter_local_notifications`; added interactive "Join Call" card in `ConversationScreen` (`conversation_screen.dart`) for `messageType == 'CALL'`.
- 2026-09-03: Fixed mobile app appearing offline: (1) Fixed fatal Riverpod element assertion crash (`Provider<TeamTimeSocket> modified StateProvider<SocketStatus> while building`) caused by synchronous `_setStatus(connecting)` during `build()` by deferring status updates to `Future.microtask`; (2) Replaced `setAuthFn` asynchronous callback with direct `.setAuth({'token': token})` and updated token on `reconnect_attempt`; (3) Added manual reconnect trigger on server disconnect (`io server disconnect`); (4) Added `WidgetsBindingObserver` in `TeamTimeApp` (`app.dart`) to auto-reconnect socket when app is resumed from background; (5) Fixed `setState() callback argument returned a Future` in `home_screen.dart`.
- 2026-09-03: Redesigned Fullscreen Calling & Ringing UI to match user reference image and aligned signaling with Web: (1) In `call_controller.dart`, calls no longer launch into Jitsi Meet prematurely; caller waits on `OutgoingCallOverlay` and only joins Jitsi when `call.accepted` is received from callee; (2) Added 35s auto-timeout, decline handling with 1.6s feedback, and cancel handling with `call.cancel` emission; (3) Built gorgeous fullscreen `OutgoingCallOverlay` and `IncomingCallOverlay` in `incoming_call_overlay.dart` with rich violet/purple ambient gradient, dynamic timer, bold contact name, iconic smiling face with glowing outline, animated audio waveform visualizer, circular glass Speaker and Mute toggles, large red End/Decline button, and emerald green Accept button; (4) Mounted overlay in `app.dart` replacing the legacy top banner.
- 2026-09-03: Added File Download Options across Chat and Files: (1) Created `FileDownloader` (`core/file_downloader.dart`) integrating `open_filex` and `path_provider` to download files via `Dio` to Android's public Downloads directory (`/storage/emulated/0/Download`) with floating SnackBar and auto-open trigger; (2) Replaced static document icon in chat attachment cards (`conversation_screen.dart`) with an interactive circular download button and loading spinner; tapping either the card or the button downloads and opens the file; (3) Added download icon action in full-screen image viewer dialog (`_viewFullImage`); (4) Added download action buttons to `FilesScreen` (`files_screen.dart`).
- 2026-09-03: Integrated exact Web call ringtone audio into mobile app: (1) Copied `frontend/public/ringtone.mp3` to `mobile/assets/audio/ringtone.mp3` and registered in `pubspec.yaml`; (2) Integrated `audioplayers` into `OutgoingCallOverlay` and `IncomingCallOverlay` (`incoming_call_overlay.dart`) with looped playback (`ReleaseMode.loop`) starting upon call initiation/arrival; (3) Immediate cleanup and audio stop on End, Decline, Accept, and widget disposal.
- 2026-09-03: Enabled Background Call Ringing & Push Notifications: (1) Added `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `VIBRATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_PHONE_CALL`, `FOREGROUND_SERVICE_MICROPHONE`, and `FOREGROUND_SERVICE_CAMERA` permissions to `AndroidManifest.xml` alongside `android:showWhenLocked="true"` and `android:turnScreenOn="true"` on `MainActivity`; (2) Updated `firebaseMessagingBackgroundHandler` in `mobile/lib/core/fcm.dart` to intercept background FCM call messages and fire high-priority full-screen incoming call heads-up notifications with sound, vibration, and Accept / Decline action buttons; (3) Updated backend `RealtimeGateway.handleCallInvite` and `PushService.sendToUsers` to pass structured `CALL_INVITE` data payloads with max priority on Android so devices wake up and ring even when app is locked or in background.
- 2026-09-03: Fixed Unable to Join Calls & Chat Call Message Recognition: (1) In `conversation_screen.dart`, replaced broken `messageType == 'CALL'` with comprehensive `SYSTEM_CALL_*` check matching backend events; (2) Added active call state detector `_isCallStartActive(index)` and `_hasActiveCall()`; (3) Rendered active calls with rich emerald cards and a prominent "Join Call" button; (4) Added sticky top "Video Call in Progress • Tap to join" banner in `ConversationScreen` when a call is live in the conversation; (5) Added `joinCall` to `CallController` (`call_controller.dart`) emitting `call.join` and launching Jitsi; (6) Ensured FCM token registration and notification setup runs reliably in `app.dart` on app startup (`initState` microtask) and app resume (`didChangeAppLifecycleState`).
- 2026-09-03: Fixed Ring Not Triggering While In Open Chat: (1) In `realtime.gateway.ts`, emitted `call.incoming` to `conversation:${conversationId}` in addition to `user:${userId}` so active chat listeners immediately receive the ringing event; (2) In `call_controller.dart`, added `handleIncomingCallStart(...)` and `dismissIncoming()` with self-caller filtering; (3) In `conversation_screen.dart`, hooked `_onSent` so receipt of `SYSTEM_CALL_START` immediately pops up the `IncomingCallOverlay` with music, vibration, and Accept/Decline action buttons even if `call.incoming` socket event was delayed or filtered; (4) In `socket_client.dart`, updated `onSocket` to bind immediately whenever socket is non-null rather than only when connected.
- 2026-09-03: Changed Session Expiry to Logout-Driven (Removed 30-Minute Timeout): (1) In `backend/.env`, `backend/.env.example`, `auth.service.ts`, and `auth.module.ts`, updated `ACCESS_TOKEN_EXPIRES_IN` default from `30m` to `365d` so active sessions never expire after 30 minutes; (2) Attached `sessionId` from `loginSession` table into every `accessToken` payload in both `createAuthSession` and `refreshTokens`; (3) In `JwtAuthGuard` (`jwt-auth.guard.ts`) and WebSocket connection handler (`realtime.gateway.ts`), verified `loginSession.isRevoked === false` on every request; (4) When user logs out via `/api/v1/auth/logout`, `isRevoked` is set to `true`, instantly invalidating the session and revoking token access immediately upon logout.
- 2026-09-03: Updated Login & Auth Screens Font Color to Black/Dark Slate: (1) In `auth_screens.dart`, updated headline text to `#0F172A` (bold black) and subtitle text to `#334155` (dark slate) across `LoginScreen`, `TwoFactorScreen`, `ForgotPasswordScreen`, and `ResetPasswordScreen` so content is crisp and readable against the light cloud background (`app_background.png`); (2) Styled text field inputs with `#0F172A` and `#475569` labels; (3) Updated error banners to high-contrast red text on light pink background.
- 2026-09-03: Added Password Eye Show/Hide Toggle: (1) In `auth_screens.dart` (`LoginScreen` and `ResetPasswordScreen`), added `_obscurePassword` state with an interactive `suffixIcon` `IconButton` switching between `Icons.visibility_off_outlined` and `Icons.visibility_outlined` to allow users to toggle password visibility.







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
