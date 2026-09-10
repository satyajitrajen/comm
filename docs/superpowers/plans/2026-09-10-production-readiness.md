# TeamTime Production-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every ship-blocker and high-severity gap from the 2026-09-10 audit so the backend and Flutter Android app can ship to production.

**Architecture:** Four phases — (1) mobile/backend contract fixes to restore broken features, (2) backend security hardening, (3) data-layer move SQLite→Postgres + Redis socket adapter + query/index/perf fixes, (4) mobile release hardening (signing, scoped storage, authenticated images, socket backoff, call reliability). Docs under `agentic/` are synchronized last.

**Tech Stack:** NestJS 11 + Prisma 6 (SQLite→PostgreSQL 16), socket.io + @socket.io/redis-adapter, Flutter 3.x + Riverpod + socket_io_client + firebase_messaging, Docker Compose.

**Key facts established during audit (verified in source):**
- Web inline images use authenticated `filesAPI.download` blob URLs (`frontend/src/app/(app)/dms/page.tsx:90`), NOT anonymous `<img src>` — tightening `GET /files/:id/view` to JWT+ACL does not break web.
- `GET /api/v1/calendar` returns a bare array of events — mobile just calls the wrong URL.
- Poll entity carries `messageId` (`schema.prisma:468`) — mobile can route `poll.voted` updates to the right message via `m['poll']['id'] == payload['id']`.
- Backend emits `messageId` on `message.edited`/`message.deleted`; mobile matches `msg['id']` — fix mobile side.
- Throttler global default is 600/min/user (`app.module.ts:36-41`) — safe to un-skip chats.
- `MessageRead` has `@@unique([messageId, userId])` — `createMany(skipDuplicates: true)` replaces the raw SQLite SQL.
- Migrations dir is SQLite-locked; switching provider needs a fresh Postgres baseline migration + archived SQLite history.

---

## Phase 1 — Contract fixes (features broken today)

### Task 1: People → DM and self-filter
**Files:** Modify `mobile/lib/features/people/people_screen.dart:65,91`
- [ ] Read file, change `u['id']` → `u['userId']` in both the self-filter and `_dm('${u['userId']}')` calls.
- [ ] `flutter analyze` clean; run existing tests.

### Task 2: Calendar endpoint
**Files:** Modify `mobile/lib/features/calendar/events_screen.dart:26`
- [ ] Change path to `/api/v1/calendar` (backend returns bare array; `_load` already handles `data is List`). Pass `start`/`end` query as empty (backend `@Query('start'/'end')` optional).

### Task 3: Home stats envelope + recent-conversation avatars
**Files:** Modify `mobile/lib/features/home/home_screen.dart:76-79`; Modify `backend/src/modules/dashboard/dashboard.service.ts:139-152`
- [ ] Mobile: read `d['stats']?['unreadMessages']`, `['openTasks']`, `['files']`, `['upcomingEvents']` with 0 fallback.
- [ ] Backend: in `recentConversations.map`, add `avatarUrl` (direct: `directUser?.profile?.avatarUrl`, group: `conversation.group?.avatarUrl ?? null`) and `unreadCount` via one `message.groupBy` over the 5 conversation ids (`by: ['conversationId']`, where senderId != user, `reads: { none: { userId } }`, messageType notIn CALL_MESSAGE_TYPES).

### Task 4: Live message edit/delete/poll handling
**Files:** Modify `mobile/lib/features/chat/conversation_screen.dart:123-145,1140-1146`
- [ ] `_upsert`: accept optional `idKey`; `_onEdited` uses `data['messageId']` fallback `data['id']`, merges edit fields into the matched message (content/isEdited/updatedAt) instead of replacing with the payload map (payload has no `sender`, so replacing destroys the bubble).
- [ ] `_onDeleted`: match `data['messageId'] ?? data['id']`; on global delete set `content`/`isDeletedGlobally` on the local copy (render already handles deleted styling) or remove from list.
- [ ] `poll.voted`: find message where `m['poll']?['id'] == payload['id']` and replace `m['poll']` with payload (keeps bubble intact); no ghost insert.
- [ ] REST poll-vote response (`res.data` = Poll): same routing — update `m['poll']` for the message whose `poll.id` matches; do not upsert into messages.

### Task 5: Settings must not wipe aboutText
**Files:** Modify `mobile/lib/features/settings/settings_screen.dart:25-47`
- [ ] On init, `GET /api/v1/auth/me` and hydrate `aboutText`/`availability`/displayName from response (`user.profile.*`).
- [ ] `_save`: include `aboutText` only when the controller text differs from the hydrated value; same for other optional fields.

## Phase 2 — Backend security

### Task 6: CORS + tokens + OTP + reset + sid + throttle
**Files:** Modify `backend/src/config/cors-origins.ts:29-33`, `backend/src/modules/auth/auth.service.ts:193,401-413`, `backend/src/common/active-session.ts:17`, `backend/src/modules/chats/chats.controller.ts:17`, `backend/.env.example`, `backend/.env` (expiry only), `backend/src/modules/auth/auth.controller.ts` forgot/reset DTOs
- [ ] Delete the `http://localhost:` / `127.0.0.1:` branch in `isCorsOriginAllowed` (dev still allows because NODE_ENV check precedes).
- [ ] `ACCESS_TOKEN_EXPIRES_IN` default `365d` → `1h` (refresh rotation + mobile single-flight refresh already exist and are tested).
- [ ] OTP: `randomInt` from `node:crypto`, `randomInt(100000, 1000000)`.
- [ ] Password reset: store `sha256(token)` hex (existing column fits a 64-char hex); lookup `findUnique({ where: { tokenHash } })` — no loop of bcrypt compares. Update `requestPasswordReset` hashing accordingly.
- [ ] `active-session.ts`: remove the `if (!sessionId || !userId) return;` pass-through — tokens without `sid` are rejected (deny by default).
- [ ] Remove `@SkipThrottle()` from `ChatsController` class decorator (global 600/min applies).
- [ ] `forgotPassword`/`resetPassword` get real DTO classes (see Task 7 conventions).

### Task 7: DTOs for all inline `@Body()` endpoints
**Files:** Create `backend/src/modules/{chats,files,messages,auth,admin}/*.dto.ts`; Modify the 5 controllers listed by `grep -rn "@Body() body: {" backend/src/modules`
- [ ] One class per body with `class-validator` decorators (`@IsString() @IsNotEmpty()` etc.), matching current accepted fields; controllers take `@Body() dto: XDto` and pass `dto.field` to services (service signatures unchanged).
- [ ] Known bodies: chats `targetUserId`, `userIds`, `role`; files `conversationId`; messages `content`, `emoji` (x2), `optionId`, `conversationId` (x2), `targetConversationId`; auth `email`, `token+password`; admin `csv`.
- [ ] Add `forbidNonWhitelisted: true` to the global ValidationPipe in `main.ts:44-49`.

### Task 8: Upload allowlist
**Files:** Modify `backend/src/modules/files/files.controller.ts:49-53`, `backend/src/modules/files/files.service.ts:269-298`, `backend/src/modules/files/files.constants.ts`
- [ ] `FileInterceptor` gains `fileFilter` allowing mime prefixes: image/, video/, audio/, text/plain, application/pdf, zip, plus common office types; reject others with 400.
- [ ] In service, verify stored extension against the allowlist (never trust client mimetype for content decisions beyond the filter).

### Task 9: File view ACL
**Files:** Modify `backend/src/modules/files/files.controller.ts:72-86`, `backend/src/modules/files/files.service.ts:513-534`
- [ ] `viewFile` uses `JwtAuthGuard` (not Optional) and applies the same `fileAccessFilter` as `getDownload` (workspace check); anonymous streaming ends.
- [ ] Web verified safe (uses authenticated download API). Mobile switches to authenticated images in Task 14 — deploy backend and mobile image change together in the same release.

## Phase 3 — Data layer, performance, ops

### Task 10: Feed unread N+1 + read-marking rewrite
**Files:** Modify `backend/src/modules/chats/chats.service.ts:885-901,1065-1076`
- [ ] `getChatsFeed`: replace per-conversation `message.count` with one `message.groupBy({ by: ['conversationId'], where: { conversationId: { in: ids }, senderId: { not: userId }, messageType: { notIn: CALL_MESSAGE_TYPES }, reads: { none: { userId } } }, _count: { _all: true } })`; map results.
- [ ] `getMessagesHistory`: delete the `$executeRaw` SQLite block. Replace with: find unread ids (`message.findMany({ where: { conversationId, senderId: { not: userId }, reads: { none: { userId } } }, select: { id: true } })` — bounded by conversation size, idempotent), then `messageRead.createMany({ data: ids.map(...), skipDuplicates: true })` guarded by `ids.length > 0`.

### Task 11: Indexes (folded into the Postgres baseline)
**Files:** Modify `backend/prisma/schema.prisma`
- [ ] Add: `ConversationParticipant @@index([userId])`; `WorkspaceUser @@index([userId, isActive])`; `Message @@index([conversationId, createdAt, id])`; `LoginSession @@index([userId])`; `File @@index([workspaceId])`; `Conversation @@index([workspaceId])`; `AuditLog @@index([workspaceId, createdAt])`.

### Task 12: SQLite → PostgreSQL
**Files:** Modify `backend/prisma/schema.prisma:1-4`, `backend/.env.example`, `backend/.env`, `docker-compose.yml:30`, `backend/docker-entrypoint.sh`, `scripts/deploy-bare.sh:14`, `scripts/deploy-prod.sh`, `backend/prisma.service.ts:10-13`; Create `backend/prisma/migrate-sqlite-data.ts`
- [ ] `provider = "postgresql"`; remove SQLite WAL pragma block from `prisma.service.ts`.
- [ ] Archive: `git mv backend/prisma/migrations backend/prisma/migrations-sqlite-archive`.
- [ ] Generate baseline offline: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > backend/prisma/migrations/20260910000000_init_postgres/migration.sql`; write `migration_lock.toml` with `provider = "postgresql"`.
- [ ] Compose: add `postgres:16-alpine` (volume `pgdata`, healthcheck `pg_isready`) and set default `DATABASE_URL=postgresql://teamtime:${PGPASSWORD:-teamtime}@postgres:5432/teamtime?schema=public`; backend `depends_on` postgres healthy.
- [ ] Entrypoint: `npx prisma migrate deploy` always; delete `PRISMA_DB_PUSH` path. `deploy-bare.sh`: `prisma migrate deploy` instead of `db push`.
- [ ] `.env.example`: `DATABASE_URL="postgresql://teamtime:change-me@localhost:5432/teamtime?schema=public"`.
- [ ] Data migration script (one-off, for existing deployments): legacy client generated from `prisma/schema.sqlite-legacy.prisma` (copy of current schema with sqlite provider + `output = "./generated/prisma-sqlite"`), new client for Postgres; copy in FK order (Workspace→User→Profile→WorkspaceUser→Conversation→Participant→Message→…→Device/LoginSession/Notification/AuditLog) with `createMany(skipDuplicates)` and raw uuid preservation; document in script header.
- [ ] Verify: `npx prisma validate`, `npx prisma generate`, tsc build clean, `docker compose config` valid.

### Task 13: Redis socket adapter + graceful shutdown + CI tests
**Files:** Modify `backend/src/modules/realtime/realtime.gateway.ts`, `backend/package.json`, `docker-compose.yml`, `backend/src/main.ts`, `.github/workflows/ci.yml`
- [ ] `npm i ioredis @socket.io/redis-adapter`. In gateway `afterInit`: if `process.env.REDIS_URL` set, create pub/sub clients and `this.io.adapter(createAdapter(pub, sub))`; else log single-instance notice.
- [ ] Compose: add `redis:7-alpine` with `REDIS_URL` env passed to backend (comment: presence/activeCalls remain per-process; scale-out needs Redis-backed presence — documented limitation).
- [ ] `main.ts`: `app.enableShutdownHooks()`; add `onModuleDestroy`/`$disconnect` in `prisma.service.ts`.
- [ ] CI: add `npm run build` + `npm test` steps (jest).

## Phase 4 — Mobile release hardening

### Task 14: Authenticated, cached images
**Files:** Modify `mobile/pubspec.yaml` (add `cached_network_image`), `mobile/lib/features/chat/conversation_screen.dart:688,700`, `mobile/lib/widgets/common.dart:20`
- [ ] Helper `AuthImage` widget in `widgets/common.dart`: `CachedNetworkImage(imageUrl: '$baseUrl/api/v1/files/$id/view', httpHeaders: {'Authorization': 'Bearer $token'}, memCacheWidth: ..., fadeInDuration: 150ms)`; token from `sessionProvider`.
- [ ] Replace chat attachment thumbnails and full-screen viewer; replace `TtAvatar`'s raw `NetworkImage`.
- [ ] Full-screen viewer: fetch bytes via Dio (auth header) → `Image.memory(bytes, cacheWidth: ...)`.

### Task 15: Release signing + minify
**Files:** Modify `mobile/android/app/build.gradle.kts:36-41`, Create `mobile/android/key.properties.example`, `mobile/android/app/proguard-rules.pro`
- [ ] `signingConfigs.create("release")` reading `key.properties` (storeFile/storePassword/keyAlias/keyPassword) with `if (file.exists())` guard so CI/dev without the keystore still builds debug-signed (with a loud log line); buildTypes.release uses it when present.
- [ ] `isMinifyEnabled = true; isShrinkResources = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")`.
- [ ] Keep rules: `-keep class org.jitsi.** {*;}`, `-keep class org.webrtc.** {*;}`, `-keep class io.socket.** {*;}`, Firebase/consumer rules come from AARs.
- [ ] Verify: `flutter build apk --release` succeeds (debug-signed fallback acceptable locally; Play keystore is a release-ops task, documented in README).

### Task 16: Scoped-storage downloads (MediaStore)
**Files:** Modify `mobile/lib/core/file_downloader.dart`, `mobile/android/app/src/main/kotlin/live/teamtime/app/MainActivity.kt`, `mobile/android/app/src/main/AndroidManifest.xml` (keep WRITE_EXTERNAL_STORAGE with `maxSdkVersion="28"`)
- [ ] MainActivity registers `MethodChannel("teamtime/downloads")`: `saveFile(bytes, fileName, mimeType)` → API≥29: `MediaStore.Downloads` insert with `IS_PENDING` then flip; API 26-28: direct write to `Environment.getExternalStoragePublicDirectory(DIRECTORY_DOWNLOADS)`. Returns absolute path (or content URI string).
- [ ] Dart: download bytes via Dio (auth header), invoke channel; on API<29 request `WRITE_EXTERNAL_STORAGE` via `permission_handler` first; keep SnackBar+open via `open_filex` on returned path.

### Task 17: Socket backoff + override gate
**Files:** Modify `mobile/lib/core/socket_client.dart:60-97`, `mobile/lib/core/api_client.dart:20-24`
- [ ] Reconnect: attempts capped at 10, delay `min(1000 * 2^n, 15000)` with ±20% jitter; after cap, status `disconnected` (resume/manual triggers can restart). Remove the unguarded 2s `io server disconnect` reconnect (let socket.io's own reconnection with fresh token on `reconnect_attempt` handle it; on `io server disconnect` call `socket.connect()` once through the same backoff path).
- [ ] `connect()` while connecting: no dispose-recreate; return existing socket.
- [ ] `api_base_override` honored only `if (kDebugMode)`.

### Task 18: Shell keep-alive + call-scan O(n²)
**Files:** Modify `mobile/lib/features/shell/shell_screen.dart:44-70`, `mobile/lib/app/router.dart:60-64`, `mobile/lib/features/chat/conversation_screen.dart:433,848,1019`
- [ ] Router: single `ShellRoute` with `ShellScreen` hosting an `IndexedStack` of the five tabs (each tab builds lazily once, state preserved); `StatefulShellRoute.indexedStack` if the router version supports it — use `go_router`'s built-in.
- [ ] Conversation: maintain `String? _activeCallConversationId` updated incrementally in `_upsert`/`_onSent` (SYSTEM_CALL_START sets, SYSTEM_CALL_END/DECLINE clears); `_hasActiveCall` becomes an O(1) field check; `_isCallStartActive(index)` keeps O(1) lookups via a map of callStart message id → active.

### Task 19: Call reliability + permissions
**Files:** Modify `mobile/lib/core/fcm.dart:82-134`, `mobile/lib/features/calls/call_controller.dart`, `mobile/lib/features/calls/incoming_call_overlay.dart`, `mobile/lib/features/chat/conversation_screen.dart` (joinCall path), `mobile/pubspec.yaml` (add `permission_handler`)
- [ ] `flutter_local_notifications`: add `Accept`/`Decline` action buttons with input payloads; wire `onDidReceiveBackgroundNotificationResponse` (top-level) — Decline emits `call.decline` (needs socket one-shot connect or deferred until app open), Accept stores pending-call payload in secure storage and routes to `/calls` on launch.
- [ ] Incoming overlay: 45s auto-timeout → dismiss + missed-call state.
- [ ] Cold-start from FCM data (`CALL_INVITE`): `takePendingPushRoute` maps to an incoming-call route that shows `IncomingCallOverlay` (not just `/calls`).
- [ ] Before `joinRoom`/Jitsi launch: request mic+camera via `permission_handler`; denial shows an explanatory SnackBar and aborts.

### Task 20: Docs + verification
**Files:** Modify `agentic/features/flutter-mobile-app/{phases.md,memory.md}`, `agentic/features/flutter-mobile-app/architecture.md`, `mobile/README.md`, `backend/README.md` if present
- [ ] Amend architecture doc: PostgreSQL + Redis adapter decision, single-instance presence limitation, signing keystore procedure.
- [ ] Update phases/memory with the production-readiness pass.
- [ ] Full verification: `cd backend && npx tsc --noEmit && npm run build && npm test`; `cd mobile && flutter analyze && flutter test`; `docker compose config`; record results.

**Commit cadence:** one commit per task, conventional messages (`fix(mobile): ...`, `feat(backend): ...`).

## Self-review notes
- Spec coverage: all 4 blockers (SQLite T12, adapter T13, signing T15, downloads T16), all 9 contract bugs (T1-T5), security list (T6-T9), perf list (T10-T11, T17-T18), call reliability (T19), docs (T20). Dead-process full-screen ringing is scoped to the credible notification-action + cold-start path (T19); a native ConnectionService is explicitly out of scope and noted as a follow-up.
- Types: `messageRead.createMany` requires Prisma ≥4.3 batch API — using `skipDuplicates` (supported). `group-by` with relation `where` is supported.
- No placeholders: mechanical DTO/index tasks enumerate every field list above; anything needing runtime feedback (ProGuard, keystore) has an explicit verification step.
