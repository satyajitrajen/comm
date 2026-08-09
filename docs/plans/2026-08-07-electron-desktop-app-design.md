# Electron Desktop Application Design Document

**Date**: 2026-08-07  
**Status**: Approved  

---

## 1. Overview
The goal is to build a standalone Windows Desktop Application for the Communication Platform (`comm`) using Electron, React, TypeScript, Vite, and Tailwind CSS. The desktop application will reside in a dedicated `desktop/` workspace folder and connect seamlessly to the existing NestJS backend REST API and Socket.IO real-time gateways.

---

## 2. Architecture & Project Structure

The project will be located in `desktop/` with separate main process, preload script, and renderer UI build pipelines powered by Vite & `electron-builder`.

```
desktop/
├── package.json               # Dependencies & build scripts
├── vite.config.ts             # Vite configuration for Electron renderer & main process
├── tsconfig.json              # TypeScript configuration
├── electron-builder.json      # Windows .exe packaging setup
├── index.html                 # Entry point HTML
├── src/
│   ├── main/                  # Electron Main Process
│   │   ├── index.ts           # BrowserWindow creation, app lifecycle, native IPC handlers
│   │   ├── tray.ts            # Windows System Tray icon & context menu
│   │   └── notification.ts    # Windows Native Notifications handler
│   ├── preload/               # Electron Preload Script
│   │   └── index.ts           # Secure ContextBridge exposure (window.electronAPI)
│   └── renderer/              # React UI Application
│       ├── main.tsx           # React entry point
│       ├── App.tsx            # Main application layout router/view switch
│       ├── index.css          # Tailwind CSS & custom dark theme styling
│       ├── api/               # Axios REST API client for backend endpoints
│       ├── socket/            # Socket.io client (real-time chat & call signaling)
│       ├── store/             # Zustand stores (Auth, Messages, Calls, App state)
│       └── components/        # Custom frameless Titlebar, Sidebar, Chat, Call overlay, Settings
```

---

## 3. Core Features & Windows Native Integrations

1. **Frameless Window & Windows 11 Design**:
   - Custom frameless title bar with drag region and native window controls (minimize, maximize/restore, close).
   - Modern dark UI theme with glassmorphism effects and Tailwind CSS styling.

2. **Backend API & Real-time Synchronization**:
   - REST API integration via Axios targeting NestJS backend (Authentication, Channels, Messages, Teams, File Uploads).
   - Socket.IO client connected to backend `/realtime` namespace for live messages, typing status, presence update, and WebRTC call signaling (`call:offer`, `call:answer`, `ice-candidate`).

3. **Windows System Tray & Native Notifications**:
   - System tray icon with quick actions (Show/Hide, Online/Away status, Quit).
   - Windows native OS notifications for incoming messages and calls with click-to-focus window action.

4. **WebRTC Audio & Video Calling**:
   - Audio/video call overlay modal with device media stream handling.
   - Incoming call ringing overlay with Accept/Decline actions.

5. **Build & Packaging**:
   - Configured with `electron-builder` to generate a Windows `.exe` installer (NSIS) and portable executable.

---

## 4. Development Workflow

- `npm run dev`: Launch Vite dev server and Electron process with live reload.
- `npm run build`: Compile TypeScript main process, preload script, and Vite renderer UI.
- `npm run dist`: Package application into standalone Windows executable installer (`dist/*.exe`).
