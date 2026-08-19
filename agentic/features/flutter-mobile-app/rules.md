# Engineering Rules

Feature: Flutter Android client for TeamTime  
Status: approved

## Mandatory conventions

- Read this folder’s approved `prd.md`, `design.md`, `architecture.md`, `phases.md`, and `memory.md` before coding.
- Product data goes through Nest `/api/v1` and Socket.IO only. Firebase is FCM + Crashlytics + Analytics only.
- Socket event names must match web (`message.sent`, `call.incoming`, …). Never reintroduce desktop stub names (`message:new`).
- Jitsi room IDs must match `frontend/src/lib/callRoom.ts`.
- Web VAPID subscribe body must keep working after FCM work.
- No secrets, service account JSON, or live tokens in `memory.md` or sample env committed with real values.
- Feature modules: UI widgets have no Dio/socket calls; those live in data sources / notifiers.
- Respect `allowedNavKeys` for every nav destination.

## Coding and naming standards

- Dart: `package:flutter_lints`; files `snake_case.dart`; types `PascalCase`; Riverpod providers `camelCaseProvider`.
- Flutter features under `mobile/lib/features/<name>/`.
- API client methods mirror web service names where practical (`chatsApi.getFeed`, `messagesApi.send`).
- Backend: keep Nest module boundaries; PushService owns both VAPID and FCM.
- Android applicationId stays `live.teamtime.app` unless documents are updated first.

## Testing requirements

- New auth/session code: unit tests for refresh-on-401 and logout clearing storage.
- Backend push branch: unit or e2e covering “WEB JSON token still parsed; ANDROID string not passed to web-push”.
- Do not require Firebase emulator for CI if keys absent; tests must skip FCM send.

## Security requirements

- Tokens only in `flutter_secure_storage`.
- Do not log Authorization headers, refresh tokens, FCM tokens, or OTP codes.
- Release builds talk HTTPS to the approved API host.
- Permission prompts only when the user starts a call or pick files.

## Dependency and version constraints

- Flutter stable; Android minSdk 26; target/compile SDK current stable.
- `jitsi_meet_flutter_sdk` official package only (not abandoned community forks).
- No Firebase Auth/Firestore packages.
- Backend `firebase-admin` only for messaging.

## Documentation expectations

- `mobile/README.md`: how to run emulator, set API URL, place `google-services.json`.
- `backend/.env.example`: FCM-related variable **names** only.
- Update this feature `memory.md` and phase statuses when a phase completes.

## Definition of done

- Phase exit criteria in `phases.md` met.
- Analyzer clean for touched Dart; Nest build/tests for touched backend.
- Manual two-user chat + call path executed when that phase claims complete.
- Nav gating verified for a restricted role if fixtures exist.

## Forbidden practices

- Embedding Next.js in a WebView as the product UI.
- Storing JWT in unencrypted prefs.
- Inventing a second chat protocol.
- Shipping admin CSV/roles UI in v1.
- Committing Firebase **service account** private keys.
- Expanding to iOS QA as a hidden v1 requirement.
- Silent scope changes; update PRD first.
