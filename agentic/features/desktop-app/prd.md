# Product Requirements

Feature: TeamTime desktop app (Electron)
Status: approved

## Problem

The Electron shell only worked in development: it loaded `localhost:3000` and
quit when no frontend server was running. The installer bundled a static UI
that was never served, so installed builds could not start.

## Goals

- Installed builds run standalone: bundled UI, remote API, no local server.
- Behave like a desktop chat app: tray residency, single instance, unread
  signal on the taskbar, native notifications that open the right place.
- `teamtime://` deep links to a channel or DM.
- Optional launch at login.

## Non-goals

- Auto-update (re-run the installer for now).
- A separate desktop UI. The product UI is the Next.js frontend.
- Code signing (builds are unsigned until a certificate exists).

## Requirements

| # | Requirement |
|---|---|
| R1 | With `DESKTOP_FRONTEND_URL` unset, serve `resources/ui` over `app://teamtime`. |
| R2 | API/socket base URL comes from the main process before any request. |
| R3 | Closing the window hides to tray; tray Quit exits; quitting during a call confirms. |
| R4 | Second launch focuses the running instance and forwards any deep link. |
| R5 | Tray status and in-app status stay in sync both ways; DND silences notifications. |
| R6 | Unread count shows as a taskbar overlay; taskbar flashes when unfocused. |
| R7 | Deep links accept only `conversation/<uuid>`, `dm/<uuid>`, `open`; survive sign-in. |
| R8 | Launch-at-login toggle in Settings, desktop only, starts hidden. |
| R9 | Production backend must list `app://teamtime` in `CORS_ORIGIN`. |
