"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const tray_1 = require("./tray");
const notification_1 = require("./notification");
function loadDesktopEnvFile() {
    try {
        const candidates = [
            path_1.default.join(process.cwd(), '.env'),
            path_1.default.join(__dirname, '../../.env'),
        ];
        for (const file of candidates) {
            if (!fs_1.default.existsSync(file))
                continue;
            const text = fs_1.default.readFileSync(file, 'utf8');
            for (const line of text.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;
                const eq = trimmed.indexOf('=');
                if (eq <= 0)
                    continue;
                const key = trimmed.slice(0, eq).trim();
                let value = trimmed.slice(eq + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (!(key in process.env)) {
                    process.env[key] = value;
                }
            }
            break;
        }
    }
    catch {
        /* ignore */
    }
}
loadDesktopEnvFile();
let mainWindow = null;
function frontendUrl() {
    return process.env.DESKTOP_FRONTEND_URL?.trim() || 'http://localhost:3000';
}
function apiUrl() {
    return process.env.DESKTOP_API_URL?.trim() || 'http://localhost:5000';
}
function probe(url) {
    return new Promise((resolve) => {
        try {
            const req = http_1.default.get(url, (res) => {
                res.resume();
                resolve((res.statusCode || 500) < 500);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(2000, () => {
                req.destroy();
                resolve(false);
            });
        }
        catch {
            resolve(false);
        }
    });
}
async function waitForFrontend(url, timeoutMs = 60_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await probe(url))
            return;
        await new Promise((r) => setTimeout(r, 750));
    }
    throw new Error(`Frontend not reachable at ${url}. Start it first (bash start.sh or cd frontend && npm run dev).`);
}
function isAllowedFrontendNavigation(targetUrl, allowedOrigin) {
    try {
        return new URL(targetUrl).origin === new URL(allowedOrigin).origin;
    }
    catch {
        return false;
    }
}
function createWindow(startUrl) {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#f8fafc',
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            partition: 'persist:comm-desktop',
        },
    });
    void mainWindow.loadURL(startUrl);
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    if (!electron_1.app.isPackaged && process.env.DESKTOP_OPEN_DEVTOOLS === '1') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedFrontendNavigation(url, startUrl)) {
            return { action: 'allow' };
        }
        void electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedFrontendNavigation(url, startUrl)) {
            event.preventDefault();
            void electron_1.shell.openExternal(url);
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
        if (isClosingConfirmed)
            return;
        const contents = mainWindow?.webContents;
        if (!contents)
            return;
        e.preventDefault();
        contents.executeJavaScript('window.__commInCall === true')
            .then((inCall) => {
            if (!inCall) {
                isClosingConfirmed = true;
                mainWindow?.close();
                return;
            }
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
                type: 'question',
                buttons: ['Leave Call & Close', 'Cancel'],
                defaultId: 1,
                title: 'Active Call',
                message: 'You are in an active call. Close the window?',
            }).then((result) => {
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
    (0, tray_1.setupSystemTray)(mainWindow);
}
function registerMediaPermissions() {
    const ses = electron_1.session.fromPartition('persist:comm-desktop');
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowed = ['media', 'mediaKeySystem', 'notifications', 'display-capture'].includes(permission);
        callback(allowed);
    });
}
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
electron_1.ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);
electron_1.ipcMain.handle('desktop:getConfig', () => ({
    isDesktop: true,
    frontendUrl: frontendUrl(),
    apiUrl: apiUrl(),
}));
electron_1.ipcMain.on('notification:send', (_event, payload) => {
    (0, notification_1.showNativeNotification)(payload?.title || 'Comm', payload?.body || '', mainWindow, payload?.tag);
});
electron_1.ipcMain.on('tray:setStatus', (_event, status) => {
    console.log(`[Tray] User set status to: ${status}`);
});
electron_1.app.whenReady().then(async () => {
    registerMediaPermissions();
    const startUrl = frontendUrl();
    try {
        console.log(`[desktop] Waiting for UI at ${startUrl} …`);
        await waitForFrontend(startUrl);
        createWindow(startUrl);
        console.log(`[desktop] Window loaded ${startUrl}`);
    }
    catch (error) {
        console.error('[desktop]', error);
        electron_1.app.quit();
        return;
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow(frontendUrl());
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
