# TeamTime Android (Flutter)

Native Android client for the existing NestJS API + Socket.IO + Jitsi.
Firebase is used for FCM, Crashlytics, and Analytics only.

Application id: `live.teamtime.app`  
minSdk: 26 (Jitsi Meet SDK 11.x requires 26; older docs said 24).

## Run

1. Start the backend (`cd backend && npm run start:dev`).
2. Optional: copy `google-services.json` into `android/app/` (from a Firebase Android app with package `live.teamtime.app`). Without it the app still runs; FCM/Crashlytics no-op.
3. Emulator:

```bash
cd mobile
flutter pub get
flutter run
```

Default API: `http://10.0.2.2:5000` (emulator → host localhost).

Physical device:

```bash
flutter run --dart-define=API_BASE_URL=http://YOUR_LAN_IP:5000
```

Release API default: `https://communication.impmeet.com`

## Backend FCM

Set on the API host (never commit the file):

```
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-admin.json
```

See `backend/.env.example`.

## Jitsi

Uses `jitsi_meet_flutter_sdk` against `meet.teamtime.live` (override with `--dart-define=JITSI_SERVER=...`).
Room names: `veloce-call-<conversationId>` (same as web).
