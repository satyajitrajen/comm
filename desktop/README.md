# TeamTime Desktop

Electron shell for TeamTime. It runs the same Next.js UI as the web app in a
native window, with a system tray, native notifications, a taskbar unread
badge, `teamtime://` deep links, and an optional launch-at-login setting.

## Two ways the UI is loaded

| Mode | When | UI source |
|---|---|---|
| **Bundled** (default, and every installed build) | `DESKTOP_FRONTEND_URL` unset | Static Next export in `resources/ui`, served over `app://teamtime/`. No local server needed. |
| **Dev** | `DESKTOP_FRONTEND_URL=http://localhost:3000` | A running `next dev`, with hot reload. |

Either way, API and socket traffic go to `DESKTOP_API_URL`. The page learns that
URL from the main process at startup (`window.electronAPI.getConfig()`).

## Run

```bash
cd desktop
cp .env.example .env
npm install

# Dev against a running frontend (set DESKTOP_FRONTEND_URL in .env)
npm run app

# Bundled UI, no frontend server (unset DESKTOP_FRONTEND_URL)
npm run build:ui   # static export of ../frontend into resources/ui
npm run app
```

`npm run app` builds the static UI automatically the first time if it is
missing and no `DESKTOP_FRONTEND_URL` is configured.

## Build the installer

```bash
npm run dist          # export UI, build Electron, package
npm run dist:skip-ui  # reuse an existing resources/ui
```

Output goes to `release/`: `TeamTime Setup <version>.exe` (NSIS) and a portable
`TeamTime <version>.exe`. Builds are unsigned; configure code signing in
`electron-builder.json` before distributing widely.

## Env (`desktop/.env`)

```
# Optional. Unset = bundled UI.
DESKTOP_FRONTEND_URL=http://localhost:3000
# API + Socket.IO the UI talks to. Default: https://communication.impmeet.com
DESKTOP_API_URL=http://localhost:5000
# DESKTOP_OPEN_DEVTOOLS=1
```

`.env` is only read in development. An installed build uses the default API
URL unless `DESKTOP_API_URL` is set in the environment.

## Backend requirement: CORS

The bundled UI has the origin `app://teamtime`. A production backend must allow
it, alongside the web origin:

```
CORS_ORIGIN=https://communication.impmeet.com,app://teamtime
```

Without this, the installed app cannot sign in against production. Development
backends allow every origin.

## Behaviour

- **Closing the window** keeps TeamTime running in the tray; use the tray's
  *Quit TeamTime* to exit. Quitting during a call asks for confirmation.
- **Single instance.** Launching again focuses the existing window.
- **Tray status** (Online / Away / Do not disturb) stays in sync with the
  status picker in the app, in both directions. Do not disturb also silences
  native notifications.
- **Unread** count shows as a taskbar overlay dot, and the taskbar button
  flashes when the window is not focused.
- **Deep links:** `teamtime://conversation/<uuid>`, `teamtime://dm/<uuid>`,
  `teamtime://open`. Anything else is ignored. If signed out, the link is
  kept through sign-in.
- **Launch at login:** *Settings → Desktop app*. It starts hidden in the tray.

## Layout

```
src/main/index.ts         window, IPC, single instance, quit/close handling
src/main/protocol.ts      app:// handler for the bundled UI
src/main/deeplink.ts      teamtime:// parsing
src/main/tray.ts          tray menu and status
src/main/notification.ts  native notifications
src/main/icon.ts          app icon and unread overlay
src/preload/index.ts      window.electronAPI (mirrored in frontend/src/lib/desktopRuntime.ts)
scripts/build-ui.mjs      static Next export -> resources/ui
```

The Vite renderer in `src/renderer` is a placeholder required by the build
tooling; product screens all come from the Next.js frontend.

## Known limits

- The in-app link preview uses a Next API route, which a static export cannot
  include, so link previews do not render in the bundled app.
- No auto-update yet: ship new versions by re-running the installer.
