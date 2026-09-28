# Memory

Feature: TeamTime desktop app (Electron)

## Status

| Phase | Status |
|---|---|
| 1. Bundled UI over app:// | done, verified in dev and in the packaged build |
| 2. Build pipeline + installer | done — NSIS + portable build from `npm run dist` |
| 3. Tray / window polish | done |
| 4. Deep links | done |
| 5. Launch at login | done |
| 6. Production CORS for `app://teamtime` | **pending — deploy config change** |
| Auto-update, code signing | not started (out of scope) |

## Facts worth remembering

- `DESKTOP_FRONTEND_URL` unset => bundled mode. `desktop/.env` is dev-only.
- Installed builds default `DESKTOP_API_URL` to `https://communication.impmeet.com`.
- Link previews do not render in the bundled app (Next API route not exportable).
- Authenticated flows were not exercised end to end in the desktop app during
  implementation: local backend needs PostgreSQL, which was not available.
  (`.claude/launch.json` no longer overrides `DATABASE_URL`; the backend uses
  `backend/.env`.)
