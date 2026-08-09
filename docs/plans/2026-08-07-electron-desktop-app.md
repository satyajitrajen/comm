# Standalone Electron Desktop App Implementation Plan

> **For Cursor:** Use executing-plans skill to implement this plan task-by-task.

**Goal:** Build a standalone Windows Electron Desktop application with Vite, React, TypeScript, and Tailwind CSS in `desktop/` that connects to the NestJS backend API & Socket.io real-time gateways.

**Architecture:** Electron main process handles native Windows integration (frameless titlebar IPC, system tray, native notifications). The renderer process is a fast Vite + React app styling with Tailwind CSS, utilizing Axios for REST API and Socket.io for live messaging & WebRTC call signaling.

**Tech Stack:** Electron 34+, React 19, TypeScript 5+, Vite 6+, Tailwind CSS 4+, Socket.io-client 4+, Zustand 5+, Axios, electron-builder.

---

## Phase 1: Desktop Environment Scaffolding

### Task 1: Initialize `desktop/package.json` and dependencies
- **Files**: `desktop/package.json`
- Create `desktop/package.json` with scripts (`dev`, `build`, `dist`) and dependencies (`electron`, `react`, `react-dom`, `vite`, `tailwindcss`, `axios`, `socket.io-client`, `zustand`, `lucide-react`, `@types/node`, `@types/react`, `@types/react-dom`, `electron-builder`).

### Task 2: Configure TypeScript, Vite, and Tailwind CSS
- **Files**:
  - `desktop/tsconfig.json`
  - `desktop/tsconfig.node.json`
  - `desktop/vite.config.ts`
  - `desktop/postcss.config.js`
  - `desktop/tailwind.config.js`
  - `desktop/electron-builder.json`
- Setup tsconfig for React and Node, configure Vite to transpile renderer & Electron main/preload, configure Tailwind CSS, and configure electron-builder for Windows `.exe` installer.

### Task 3: Create Renderer HTML & Global CSS
- **Files**:
  - `desktop/index.html`
  - `desktop/src/renderer/index.css`
- Design system with custom dark theme, dynamic CSS variables, glassmorphism card utilities, smooth scrollbars, and title bar drag utility classes.

---

## Phase 2: Electron Main Process & Preload Bridge

### Task 4: Implement Electron Preload Script (`preload/index.ts`)
- **Files**: `desktop/src/preload/index.ts`
- Expose safe `window.electronAPI` bridge via `contextBridge` for window controls (minimize, maximize, close, unmaximize), native notification dispatch, and system tray status events.

### Task 5: Implement Native Windows Features (`main/index.ts`, `main/tray.ts`, `main/notification.ts`)
- **Files**:
  - `desktop/src/main/index.ts`
  - `desktop/src/main/tray.ts`
  - `desktop/src/main/notification.ts`
- Create frameless BrowserWindow with `titleBarStyle: 'hidden'`, handle IPC calls from renderer, build System Tray with context menu, and implement native Windows OS notifications.

---

## Phase 3: React Renderer UI & Backend Real-Time Connectivity

### Task 6: Data Models & Store Setup
- **Files**:
  - `desktop/src/renderer/types/index.ts`
  - `desktop/src/renderer/store/useAppStore.ts`
- Define TypeScript interfaces for User, Channel, Message, CallState, and setup Zustand store managing active view, auth session, channels, active chat, call state, and notification preferences.

### Task 7: REST API Client & Socket.IO Real-Time Gateway Interface
- **Files**:
  - `desktop/src/renderer/api/client.ts`
  - `desktop/src/renderer/socket/client.ts`
- Build Axios REST client for backend authentication and resources, and Socket.IO client handling live message broadcasting, typing indicators, user presence, and WebRTC call signaling.

### Task 8: Build Custom Frameless Windows TitleBar (`components/TitleBar.tsx`)
- **Files**: `desktop/src/renderer/components/TitleBar.tsx`
- Sleek dark Windows 11 custom title bar with window title, connection status indicator, and interactive minimize, maximize/restore, and close buttons invoking `window.electronAPI`.

### Task 9: Build Navigation Sidebar (`components/Sidebar.tsx`)
- **Files**: `desktop/src/renderer/components/Sidebar.tsx`
- Left navigation sidebar showing current user avatar, status toggle (Online, Away, DND), channel list, direct messages list, quick call launcher, and settings button.

### Task 10: Build Real-Time Chat View (`components/ChatView.tsx`)
- **Files**: `desktop/src/renderer/components/ChatView.tsx`
- Full-featured chat interface displaying channel header, message history with user avatars, timestamps, code blocks, real-time message stream, typing indicators, and message input box with emoji / send actions.

### Task 11: Build WebRTC Voice & Video Call Overlay (`components/CallOverlay.tsx`)
- **Files**: `desktop/src/renderer/components/CallOverlay.tsx`
- Incoming call notification popup (Accept/Decline with ring audio), active call modal with local/remote video streams, mute mic, toggle camera, screen share, and end call controls.

### Task 12: Build Desktop Settings View (`components/SettingsView.tsx`)
- **Files**: `desktop/src/renderer/components/SettingsView.tsx`
- Configuration tab for backend API URL (`http://localhost:3000`), system tray minimize settings, launch on startup toggle, and audio/video input device selection.

### Task 13: Wire Renderer Application (`src/renderer/App.tsx` & `main.tsx`)
- **Files**:
  - `desktop/src/renderer/App.tsx`
  - `desktop/src/renderer/main.tsx`
- Connect TitleBar, Sidebar, ChatView, CallOverlay, and SettingsView into a cohesive desktop app layout with active view routing.

---

## Phase 4: Build Verification & Packaging

### Task 14: Verify Dev Build & Electron Execution
- **Commands**: `cd desktop`, `npm install`, `npm run dev`
- Ensure dev server builds main process, preload script, and Vite renderer without TypeScript or bundler errors.

### Task 15: Production Bundle & Windows Packaging Test
- **Commands**: `npm run build`
- Verify production compilation of main and renderer bundles for packaging into Windows executable.
