import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { setupSystemTray, setTrayStatus, showMainWindow, type TrayStatus } from './tray';
import { showNativeNotification } from './notification';
import { appIcon, unreadOverlay } from './icon';
import { APP_ORIGIN, handleAppScheme, registerAppScheme, resolveUiRoot } from './protocol';
import { DEEP_LINK_SCHEME, deepLinkToPath, findDeepLinkInArgv } from './deeplink';

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

// Privileged schemes must be registered before `ready`.
registerAppScheme();

// A second launch (or a teamtime:// link) should reuse the running app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

/** One partition for the window, its permissions, and the app:// handler. */
const SESSION_PARTITION = 'persist:comm-desktop';

let mainWindow: BrowserWindow | null = null;
/** True once the user chose Quit; until then closing the window hides it. */
let isQuitting = false;
/** A deep link received before the window finished loading. */
let pendingDeepLinkPath: string | null = null;

/**
 * Where the UI comes from. DESKTOP_FRONTEND_URL points at a running Next dev
 * server; otherwise the bundled static export is served over app://.
 */
function startUrl(): string {
  const override = process.env.DESKTOP_FRONTEND_URL?.trim();
  if (override) return override.replace(/\/$/, '');
  return APP_ORIGIN;
}

function apiUrl(): string {
  return process.env.DESKTOP_API_URL?.trim() || 'https://communication.impmeet.com';
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
    `The TeamTime UI is not reachable at ${url}.\n\nStart the frontend (cd frontend && npm run dev), or unset DESKTOP_FRONTEND_URL to use the bundled UI.`,
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

/** Routes an in-app path to the renderer, or queues it until the window exists. */
function navigateTo(appPath: string) {
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingDeepLinkPath = appPath;
    return;
  }
  showMainWindow();
  mainWindow.webContents.send('app:navigate', appPath);
}

function handleDeepLink(link: string | null) {
  if (!link) return;
  const target = deepLinkToPath(link);
  if (target) navigateTo(target);
  else showMainWindow();
}

function setUnreadCount(count: number) {
  const n = Math.max(0, Math.floor(count) || 0);
  app.setBadgeCount(n);
  if (!mainWindow) return;
  if (process.platform === 'win32') {
    mainWindow.setOverlayIcon(n > 0 ? unreadOverlay() : null, n > 0 ? `${n} unread` : '');
  }
  // Draw attention only when the user is not already looking at the app.
  if (n > 0 && !mainWindow.isFocused()) mainWindow.flashFrame(true);
}

function createWindow(baseUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f8fafc',
    title: 'TeamTime',
    icon: appIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: SESSION_PARTITION,
    },
  });

  // A deep link that launched the app decides the first page.
  const firstPath = pendingDeepLinkPath ?? '/home/';
  pendingDeepLinkPath = null;
  void mainWindow.loadURL(`${baseUrl}${firstPath}`);

  const launchedHidden = app.getLoginItemSettings().wasOpenedAsHidden;
  mainWindow.once('ready-to-show', () => {
    if (!launchedHidden) mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLinkPath) {
      const target = pendingDeepLinkPath;
      pendingDeepLinkPath = null;
      navigateTo(target);
    }
  });

  if (!app.isPackaged && process.env.DESKTOP_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedFrontendNavigation(url, baseUrl)) {
      return { action: 'allow' };
    }
    openExternalIfSafe(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedFrontendNavigation(url, baseUrl)) {
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
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));

  let isCloseConfirmed = false;
  mainWindow.on('close', (e) => {
    // Closing the window keeps TeamTime running in the tray, like other chat
    // apps, so messages and calls still arrive.
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      return;
    }

    // Actually quitting: confirm first if a call is live.
    if (isCloseConfirmed) return;
    const contents = mainWindow?.webContents;
    if (!contents) return;
    e.preventDefault();
    contents
      .executeJavaScript('window.__commInCall === true')
      .then((inCall: boolean) => {
        if (!inCall) {
          isCloseConfirmed = true;
          mainWindow?.close();
          return;
        }
        showMainWindow();
        return dialog
          .showMessageBox(mainWindow!, {
            type: 'question',
            buttons: ['Leave call & quit', 'Cancel'],
            defaultId: 1,
            title: 'Active call',
            message: 'You are in an active call. Quit TeamTime?',
          })
          .then(({ response }) => {
            if (response === 0) {
              contents.send('app:force-end-call');
              isCloseConfirmed = true;
              mainWindow?.close();
            } else {
              isQuitting = false;
            }
          });
      })
      .catch(() => {
        isCloseConfirmed = true;
        mainWindow?.close();
      });
  });

  setupSystemTray(mainWindow);
}

function registerMediaPermissions() {
  const ses = session.fromPartition(SESSION_PARTITION);
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
  frontendUrl: startUrl(),
  apiUrl: apiUrl(),
}));

ipcMain.on(
  'notification:send',
  (_event, payload: { title?: string; body?: string; tag?: string; url?: string }) => {
    showNativeNotification(payload?.title || 'TeamTime', payload?.body || '', mainWindow, {
      tag: payload?.tag,
      url: payload?.url,
    });
  },
);

// Renderer reports the user's chosen status; mirror it in the tray.
ipcMain.on('tray:setStatus', (_event, status: TrayStatus) => {
  if (status !== 'online' && status !== 'away' && status !== 'dnd') return;
  setTrayStatus(status);
});

ipcMain.on('app:setUnreadCount', (_event, count: number) => {
  if (typeof count !== 'number') return;
  setUnreadCount(count);
});

ipcMain.handle('desktop:getLoginItem', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('desktop:setLoginItem', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
  return app.getLoginItemSettings().openAtLogin;
});

// Windows/Linux: a second launch carries the deep link in argv.
app.on('second-instance', (_event, argv) => {
  showMainWindow();
  handleDeepLink(findDeepLinkInArgv(argv));
});

// macOS delivers deep links here instead.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('before-quit', () => {
  isQuitting = true;
});

function registerDeepLinkProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    // Dev: electron.exe needs the script path to relaunch correctly.
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  }
}

app.whenReady().then(async () => {
  if (!gotLock) return;

  if (process.platform === 'win32') app.setAppUserModelId('live.teamtime.desktop');
  registerMediaPermissions();
  registerDeepLinkProtocol();

  // First launch via a teamtime:// link.
  const launchLink = findDeepLinkInArgv(process.argv);
  if (launchLink) pendingDeepLinkPath = deepLinkToPath(launchLink);

  const baseUrl = startUrl();

  try {
    if (baseUrl === APP_ORIGIN) {
      const root = resolveUiRoot();
      if (!root) {
        throw new Error(
          'The bundled TeamTime UI is missing.\n\nRun `npm run build:ui` in desktop/, or set DESKTOP_FRONTEND_URL to a running frontend.',
        );
      }
      handleAppScheme(root, session.fromPartition(SESSION_PARTITION));
      console.log(`[desktop] Serving bundled UI from ${root}`);
    } else {
      console.log(`[desktop] Waiting for UI at ${baseUrl} …`);
      await waitForFrontend(baseUrl);
    }
    createWindow(baseUrl);
  } catch (error) {
    console.error('[desktop]', error);
    dialog.showErrorBox(
      'TeamTime could not start',
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl());
    else showMainWindow();
  });
});

app.on('window-all-closed', () => {
  // The window only truly closes on quit; keep macOS convention otherwise.
  if (process.platform !== 'darwin') app.quit();
});
