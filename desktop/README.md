# Comm Desktop

Electron window that shows the **same Next.js UI** as the web app.
This is a desktop window — not Chrome/Edge — but the UI comes from your running frontend.

## Run (same as before)

```bash
# Terminal 1 — API + Next UI
bash start.sh

# Terminal 2 — Electron desktop window
cd desktop
cp .env.example .env
npm install
npm run app
```

Electron opens `http://localhost:3000` inside a frameless desktop window (tray + native notifications).

## Env

```
DESKTOP_FRONTEND_URL=http://localhost:3000
DESKTOP_API_URL=http://localhost:5000
# DESKTOP_OPEN_DEVTOOLS=1
```
