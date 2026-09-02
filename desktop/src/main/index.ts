import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { setupSystemTray, setTrayStatus } from './tray';
import { showNativeNotification } from './notification';

function loadDesktopEnvFile() {
  try {
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '../../.env'),
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      break;
    }
  } catch {
    /* ignore */
  }
}

loadDesktopEnvFile();

let mainWindow: BrowserWindow | null = null;

function frontendUrl(): string {
  return process.env.DESKTOP_FRONTEND_URL?.trim() || 'http://localhost:3000';
}

function apiUrl(): string {
  return process.env.DESKTOP_API_URL?.trim() || 'http://localhost:5000';
}

function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode || 500) < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function waitForFrontend(url: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probe(url)) return;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(
    `Frontend not reachable at ${url}. Start it first (bash start.sh or cd frontend && npm run dev).`,
  );
}

function isAllowedFrontendNavigation(targetUrl: string, allowedOrigin: string): boolean {
  try {
    return new URL(targetUrl).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

function isSafeExternalUrl(targetUrl: string): boolean {
  try {
    const protocol = new URL(targetUrl).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

function openExternalIfSafe(targetUrl: string) {
  if (isSafeExternalUrl(targetUrl)) {
    void shell.openExternal(targetUrl);
  } else {
    console.warn(`[desktop] Ignored non-http(s)/mailto URL: ${targetUrl}`);
  }
}

function createWindow(startUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:comm-desktop',
    },
  });

  void mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (!app.isPackaged && process.env.DESKTOP_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedFrontendNavigation(url, startUrl)) {
      return { action: 'allow' };
    }
    openExternalIfSafe(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedFrontendNavigation(url, startUrl)) {
      event.preventDefault();
      openExternalIfSafe(url);
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-state', false);
  });

  // Intercept window close when an active call may be in progress.
  let isClosingConfirmed = false;
  mainWindow.on('close', (e) => {
    if (isClosingConfirmed) return;
    const contents = mainWindow?.webContents;
    if (!contents) return;
    e.preventDefault();
    contents.executeJavaScript('window.__commInCall === true')
      .then((inCall: boolean) => {
        if (!inCall) {
          isClosingConfirmed = true;
          mainWindow?.close();
          return;
        }
        const { dialog } = require('electron');
        dialog.showMessageBox(mainWindow!, {
          type: 'question',
          buttons: ['Leave Call & Close', 'Cancel'],
          defaultId: 1,
          title: 'Active Call',
          message: 'You are in an active call. Close the window?',
        }).then((result: { response: number }) => {
          const { response } = result;
          if (response === 0) {
            contents.send('app:force-end-call');
            isClosingConfirmed = true;
            mainWindow?.close();
          }
        });
      })
      .catch(() => {
        isClosingConfirmed = true;
        mainWindow?.close();
      });
  });

  setupSystemTray(mainWindow);
}

function registerMediaPermissions() {
  const ses = session.fromPartition('persist:comm-desktop');
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'notifications', 'display-capture'].includes(
      permission,
    );
    callback(allowed);
  });
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);

ipcMain.handle('desktop:getConfig', () => ({
  isDesktop: true as const,
  frontendUrl: frontendUrl(),
  apiUrl: apiUrl(),
}));

ipcMain.on(
  'notification:send',
  (
    _event,
    payload: { title?: string; body?: string; tag?: string },
  ) => {
    showNativeNotification(
      payload?.title || 'Comm',
      payload?.body || '',
      mainWindow,
      payload?.tag,
    );
  },
);

ipcMain.on('tray:setStatus', (_event, status: 'online' | 'away' | 'dnd') => {
  if (status !== 'online' && status !== 'away' && status !== 'dnd') return;
  setTrayStatus(status);
});

app.whenReady().then(async () => {
  registerMediaPermissions();
  const startUrl = frontendUrl();

  try {
    console.log(`[desktop] Waiting for UI at ${startUrl} …`);
    await waitForFrontend(startUrl);
    createWindow(startUrl);
    console.log(`[desktop] Window loaded ${startUrl}`);
  } catch (error) {
    console.error('[desktop]', error);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(frontendUrl());
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
