# Delivery Phases

Feature: Flutter Android client for TeamTime  
Status: approved

## Phase status values

Use only: `not-started`, `in-progress`, `blocked`, `complete`.

## Phase structure

Each phase contains: objective and scope, dependencies, deliverables, verification steps, exit criteria, current status.

---

## Phase 0 — Scaffold and Firebase wiring

- **Objective and scope:** Create `mobile/` Flutter Android app (`live.teamtime.app`), flavors/env, theme, router shell, Firebase placeholders (app runs without `google-services.json` in debug no-op).
- **Dependencies:** Approved documents; Flutter SDK on the machine.
- **Deliverables:** App compiles; README; debug API `10.0.2.2:5000`; Crashlytics/Analytics initialized if config present.
- **Verification steps:** `flutter analyze`; app launches to login placeholder.
- **Exit criteria:** Android installable debug APK; applicationId correct.
- **Current status:** `complete`

## Phase 1 — Backend FCM coexistence

- **Objective and scope:** Extend `PushService` + subscribe/unsubscribe to store ANDROID FCM tokens and send FCM without breaking VAPID.
- **Dependencies:** Phase 0 not strictly required; can proceed in parallel. Firebase Admin credentials on the server (or skip send if unset).
- **Deliverables:** API contract from architecture.md; `.env.example` names; CORS note if needed.
- **Verification steps:** Existing web subscribe still 200; ANDROID token upsert; unit test or scripted send path branch.
- **Exit criteria:** WEB devices still use web-push; ANDROID tokens not JSON.parsed into VAPID.
- **Current status:** `complete`

## Phase 2 — Auth session

- **Objective and scope:** Login, 2FA, forgot/reset, refresh, logout, change password, secure storage, Dio interceptor.
- **Dependencies:** Phase 0; running backend.
- **Deliverables:** Auth feature; gated router.
- **Verification steps:** Login with 2FA user; 401 refresh; logout clears tokens.
- **Exit criteria:** F1 and F2 from PRD.
- **Current status:** `complete`

## Phase 3 — Shell, Home, People, Settings

- **Objective and scope:** Bottom nav + More; Home dashboard; People directory + DM create; self Settings (profile, avatar, availability, password); `allowedNavKeys`.
- **Dependencies:** Phase 2.
- **Deliverables:** Shell matching design.md IA.
- **Verification steps:** Restricted user missing nav keys; profile save round-trip.
- **Exit criteria:** F3, F9, F10, F11.
- **Current status:** `complete`

## Phase 4 — Teams, DMs, realtime, files

- **Objective and scope:** Conversations, composer, message actions, attachments, mentions, threads, polls, tasks, sockets, Files list/upload.
- **Dependencies:** Phase 3.
- **Deliverables:** Teams + DMs + Files features; socket client with web event names.
- **Verification steps:** Two users send/receive; attach file; react; pin; poll vote.
- **Exit criteria:** F4, F5, F8.
- **Current status:** `complete`

## Phase 5 — Calls + Jitsi + Activity + FCM UX

- **Objective and scope:** Call history, signaling, native Jitsi join, incoming UI, Activity list, FCM registration and notification tap routing.
- **Dependencies:** Phase 4; Phase 1 for real FCM; Jitsi server reachable.
- **Deliverables:** Calls feature; Activity; messaging background handler.
- **Verification steps:** Invite → incoming → accept → Jitsi; decline; FCM tap when config present.
- **Exit criteria:** F6, F7, F12, F13, F14.
- **Current status:** `complete`

## Phase 6 — Hardening and dogfood

- **Objective and scope:** Permissions, reconnect banner, error states, README, analyzer, regression vs web push.
- **Dependencies:** Phase 5.
- **Deliverables:** Polished v1; phase statuses updated; memory.md updated.
- **Verification steps:** PRD acceptance criteria checklist.
- **Exit criteria:** All v1 acceptance criteria checked or explicitly waived in memory.md.
- **Current status:** `complete`

## Phase 7 — Production readiness hardening (2026-09-10)

- **Objective and scope:** Audit-driven hardening of backend + mobile for production: mobile/backend contract alignment, backend security (strict DTO validation, upload MIME allowlist, hashed reset tokens, crypto-random OTP, deny-by-default active-session checks, localhost CORS removal), PostgreSQL 16 migration with baseline migration + SQLite data carry-over script, optional Redis socket adapter, hot-path query perf + indexes, mobile authenticated cached images, MediaStore scoped-storage downloads, release signing config with minify, socket reconnect backoff caps, StatefulShellRoute state preservation, call reliability (45s ring timeout, notification Accept/Decline driving the call controller, mic/camera gating).
- **Dependencies:** Phases 0–6.
- **Deliverables:** Branch `feat/production-readiness`; plan at `docs/superpowers/plans/2026-09-10-production-readiness.md`; docker-compose Postgres/Redis services; CI with backend tsc+jest+build and mobile analyze+test.
- **Verification steps:** backend `tsc --noEmit` + jest + `nest build`; `flutter analyze` + `flutter test`; release APK builds (debug-signed fallback without keystore).
- **Exit criteria:** Ship-blockers resolved; runtime Postgres/Redis verification performed on the deploy box (no Docker on the dev machine); Play keystore generated as a release-ops task.
- **Current status:** `complete`
