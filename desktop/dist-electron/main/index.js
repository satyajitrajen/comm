"use strict";
const electron = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
let tray = null;
function setupSystemTray(mainWindow2) {
  const icon = electron.nativeImage.createEmpty();
  tray = new electron.Tray(icon);
  tray.setToolTip("Comm Desktop");
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "Open Comm Desktop",
      click: () => {
        if (mainWindow2.isMinimized()) mainWindow2.restore();
        mainWindow2.show();
        mainWindow2.focus();
      }
    },
    { type: "separator" },
    {
      label: "Status",
      submenu: [
        { label: "🟢 Online", type: "radio", checked: true, click: () => setStatus("online") },
        { label: "🟡 Away", type: "radio", click: () => setStatus("away") },
        { label: "🔴 Do Not Disturb", type: "radio", click: () => setStatus("dnd") }
      ]
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow2.isVisible()) {
      mainWindow2.hide();
    } else {
      mainWindow2.show();
      mainWindow2.focus();
    }
  });
  return tray;
}
function setStatus(status) {
  console.log(`[Tray] User set status to: ${status}`);
}
function showNativeNotification(title, body, mainWindow2) {
  if (!electron.Notification.isSupported()) return;
  const notification = new electron.Notification({
    title,
    body: body || "",
    silent: false
  });
  notification.on("click", () => {
    if (mainWindow2) {
      if (mainWindow2.isMinimized()) mainWindow2.restore();
      mainWindow2.focus();
    }
  });
  notification.show();
}
function loadDesktopEnvFile() {
  try {
    const candidates = [
      path.join(process.cwd(), ".env"),
      path.join(__dirname, "../../.env")
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      break;
    }
  } catch {
  }
}
loadDesktopEnvFile();
let mainWindow = null;
function frontendUrl() {
  var _a;
  return ((_a = process.env.DESKTOP_FRONTEND_URL) == null ? void 0 : _a.trim()) || "http://localhost:3000";
}
function apiUrl() {
  var _a;
  return ((_a = process.env.DESKTOP_API_URL) == null ? void 0 : _a.trim()) || "http://localhost:5000";
}
function probe(url) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode || 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2e3, () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}
async function waitForFrontend(url, timeoutMs = 6e4) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probe(url)) return;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(
    `Frontend not reachable at ${url}. Start it first (bash start.sh or cd frontend && npm run dev).`
  );
}
function isAllowedFrontendNavigation(targetUrl, allowedOrigin) {
  try {
    return new URL(targetUrl).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}
function createWindow(startUrl) {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#f8fafc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      partition: "persist:comm-desktop"
    }
  });
  void mainWindow.loadURL(startUrl);
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  if (!electron.app.isPackaged && process.env.DESKTOP_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedFrontendNavigation(url, startUrl)) {
      return { action: "allow" };
    }
    void electron.shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedFrontendNavigation(url, startUrl)) {
      event.preventDefault();
      void electron.shell.openExternal(url);
    }
  });
  mainWindow.on("maximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window:maximized-state", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window:maximized-state", false);
  });
  setupSystemTray(mainWindow);
}
function registerMediaPermissions() {
  const ses = electron.session.fromPartition("persist:comm-desktop");
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["media", "mediaKeySystem", "notifications", "display-capture"].includes(
      permission
    );
    callback(allowed);
  });
}
electron.ipcMain.on("window:minimize", () => mainWindow == null ? void 0 : mainWindow.minimize());
electron.ipcMain.on("window:maximize", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow == null ? void 0 : mainWindow.maximize();
});
electron.ipcMain.on("window:close", () => mainWindow == null ? void 0 : mainWindow.close());
electron.ipcMain.handle("window:isMaximized", () => (mainWindow == null ? void 0 : mainWindow.isMaximized()) || false);
electron.ipcMain.handle("desktop:getConfig", () => ({
  isDesktop: true,
  frontendUrl: frontendUrl(),
  apiUrl: apiUrl()
}));
electron.ipcMain.on("notification:send", (_event, payload) => {
  showNativeNotification((payload == null ? void 0 : payload.title) || "Comm", (payload == null ? void 0 : payload.body) || "", mainWindow);
});
electron.ipcMain.on("tray:setStatus", (_event, status) => {
  console.log(`[Tray] User set status to: ${status}`);
});
electron.app.whenReady().then(async () => {
  registerMediaPermissions();
  const startUrl = frontendUrl();
  try {
    console.log(`[desktop] Waiting for UI at ${startUrl} …`);
    await waitForFrontend(startUrl);
    createWindow(startUrl);
    console.log(`[desktop] Window loaded ${startUrl}`);
  } catch (error) {
    console.error("[desktop]", error);
    electron.app.quit();
    return;
  }
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow(frontendUrl());
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
