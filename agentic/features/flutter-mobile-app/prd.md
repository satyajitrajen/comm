# Product Requirements Document

Feature: Flutter Android client for TeamTime  
Location: `agentic/features/flutter-mobile-app/`  
Status: approved

## Product vision

Give TeamTime members a native Android app that is a first-class client of the existing workspace: same accounts, channels, DMs, files, people, and Jitsi rooms as web and desktop — with OS push, crash reporting, and analytics via Firebase.

## Problem statement

Web and Electron already share one NestJS backend. There is no mobile client. Members cannot get reliable Android notifications, camera/mic calls, or a phone-sized Teams/DM experience without opening a browser. Current push is VAPID/web-only and does not reach Android.

## Target users and needs

| User | Need |
|---|---|
| Workspace member | Sign in (incl. 2FA), chat in teams and DMs, join/leave Jitsi calls, see activity, files, people, own profile/settings |
| Workspace guest (nav-gated) | Same surfaces their `allowedNavKeys` allow |
| Workspace admin | Use the **web** admin tools; not a mobile admin console in v1 |

## Goals

- Ship an Android Flutter app (`live.teamtime.app`) that talks to the existing `/api/v1` + Socket.IO protocol.
- Member-core feature parity for: auth (login/2FA/forgot/reset/change password), Home, Teams, DMs, Calls, Activity, Files, People, self Settings, presence.
- Teams/DM message actions: send/receive, attach, react, mention, thread, poll, task, edit/delete/forward/star/pin, call invite/accept/decline/end.
- FCM for message/call/event notifications; Crashlytics; Analytics. Nest remains source of truth.
- Native Jitsi via `jitsi_meet_flutter_sdk` on `meet.teamtime.live`.
- Extend backend push so Android FCM tokens coexist with web VAPID subscriptions.

## Non-goals

- iOS (Dart should stay portable; no iOS signing/Firebase iOS app in v1).
- Firebase Auth, Firestore, or replacing Nest.
- Mobile workspace register / tenant provisioning.
- Admin: user CSV, roles, approval cycle, Apps module, announcement-channel admin.
- Dedicated Calendar module (Home may show upcoming events from the dashboard API as read-only cards).
- Document Picture-in-Picture / web-only chrome.
- Rewriting the web or desktop UIs.

## Use cases and user stories

1. As a member, I sign in with email/phone + password, complete 2FA if required, and land on Home.
2. As a member, I reset a forgotten password using the same email flow as web (link still opens web; app can deep-link reset if token is pasted/opened).
3. As a member, I browse teams/channels, send messages and files, use mentions, threads, polls, tasks, and message actions.
4. As a member, I DM colleagues from People or Chat.
5. As a member, I start or join a video call in a conversation; incoming calls show a native incoming UI and an FCM high-priority notification if backgrounded.
6. As a member, I see Activity, mark notifications read, and receive FCM when mentioned or called.
7. As a member, I list/upload files and open people profiles to start a DM.
8. As a member, I change display name, avatar, availability, and password; nav respects role module gates.
9. As a member, I stay signed in across process death via stored refresh session (same `veloce_*` semantics: access, refresh, session id).

## Functional requirements

| ID | Requirement |
|---|---|
| F1 | Login, 2FA verify, forgot-password request, reset-password, logout, token refresh, change password against existing auth API |
| F2 | Persist session securely (encrypted storage); refresh on 401 like web |
| F3 | Home dashboard from existing dashboard API (unread, recents, tasks, optional event cards) |
| F4 | Teams: list spaces/channels, join/leave where API allows, channel info, realtime `message.sent` / typing / receipts |
| F5 | DMs: list/create direct chats, same composer and message actions as Teams |
| F6 | Calls: history + dial; signaling events `call.invite` / `incoming` / `accept` / `decline` / `cancel` / `join` / `end`; Jitsi room names match web |
| F7 | Activity: notification list, mark read / read-all |
| F8 | Files: list (incl. mine / conversation filter), upload within existing size limit |
| F9 | People: directory search, open DM |
| F10 | Settings: profile, avatar, availability → presence; change password; no admin tabs |
| F11 | Hide nav items not in `allowedNavKeys` |
| F12 | Register FCM token as `Device` `ANDROID`; unregister on logout |
| F13 | Crashlytics on fatal/nonfatal; Analytics screen views for main tabs (no PII in events) |
| F14 | Camera, mic, notifications, storage permissions as required |

## Non-functional requirements

- Android API 26+ (Jitsi Flutter SDK 11.x).
- Debug API default `http://10.0.2.2:5000`; release default `https://communication.impmeet.com`.
- JWT handling must not log tokens.
- UI must remain usable on 360dp-wide phones; no desktop-only layouts.
- Socket reconnect with backoff; show reconnecting state.
- Cold start to login or Home < 3s on a mid-range device excluding network.

## Success metrics

- Member can complete login → DM send → receive on second account → incoming call accept into Jitsi.
- FCM delivered for `message.notify` and `call.incoming` when app is backgrounded (once Firebase config is present).
- Crash-free sessions reported in Crashlytics after first internal dogfood.
- Web VAPID push still works after FCM backend change.

## Constraints and dependencies

- Existing NestJS + Prisma + Socket.IO + Jitsi (`meet.teamtime.live`).
- User must supply Firebase Android app + `google-services.json` (not committed if it contains sensitive project keys beyond the standard client file).
- Backend CORS must allow the app’s HTTP origin if any; mobile clients typically have no Origin — confirm Nest CORS/JWT still accept the Android client.
- File uploads follow `FILE_UPLOAD_MAX_BYTES`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| No `google-services.json` | App runs; FCM no-ops until file + `FIREBASE_*` admin creds exist |
| Jitsi manifest merge | `tools:replace="android:label"`; minSdk 24 |
| VAPID JSON vs FCM string tokens | Split send path by `deviceType` |
| Emulator localhost | `10.0.2.2`; document LAN IP for physical devices |
| Scope creep into admin | Non-goals above are authoritative |

## Acceptance criteria

- All F1–F14 demonstrable on an Android emulator or device against a running backend.
- Nav gating matches web for the same user.
- Call room name matches web for the same conversation.
- Logout clears session and FCM token.
- Web login/chat/push still pass smoke tests.

## Release scope

**v1:** Android member core as above.  
**Later:** iOS, Calendar module, Apps, announcements admin, Firebase Auth (rejected), admin console.
