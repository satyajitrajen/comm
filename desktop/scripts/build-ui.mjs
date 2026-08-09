/**
 * Build Next as a static export for Electron, then copy into desktop/resources/ui.
 * Next route handlers under app/api are incompatible with output:export — temporarily
 * parked for the Electron build only.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(desktopRoot, '../frontend');
const outSrc = path.join(frontendRoot, 'out');
const outDest = path.join(desktopRoot, 'resources', 'ui');
const apiDir = path.join(frontendRoot, 'src', 'app', 'api');
const apiSkipDir = path.join(frontendRoot, 'src', 'app', '_api.electron-skip');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function parkApiRoutes() {
  const source = fs.existsSync(apiDir)
    ? apiDir
    : fs.existsSync(apiSkipDir)
      ? null
      : null;
  // Already parked as _api.electron-skip or _api_backup_electron
  const backupAlt = path.join(frontendRoot, 'src', 'app', '_api_backup_electron');
  if (!fs.existsSync(apiDir)) {
    return fs.existsSync(apiSkipDir) || fs.existsSync(backupAlt);
  }
  if (fs.existsSync(apiSkipDir)) {
    fs.rmSync(apiSkipDir, { recursive: true, force: true });
  }
  copyDir(apiDir, apiSkipDir);
  fs.rmSync(apiDir, { recursive: true, force: true });
  return true;
}

function restoreApiRoutes() {
  const backupAlt = path.join(frontendRoot, 'src', 'app', '_api_backup_electron');
  const source = fs.existsSync(apiSkipDir)
    ? apiSkipDir
    : fs.existsSync(backupAlt)
      ? backupAlt
      : null;
  if (!source) return;
  if (fs.existsSync(apiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
  }
  copyDir(source, apiDir);
  fs.rmSync(source, { recursive: true, force: true });
}

console.log('[build:ui] Building static Next export for Electron…');
const parked = parkApiRoutes();

let build;
try {
  build = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'build'],
    {
      cwd: frontendRoot,
      env: { ...process.env, ELECTRON_BUILD: '1' },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
} finally {
  if (parked) restoreApiRoutes();
}

if (!build || build.status !== 0) {
  console.error('[build:ui] Frontend build failed');
  process.exit((build && build.status) || 1);
}

if (!fs.existsSync(path.join(outSrc, 'index.html')) && !fs.existsSync(path.join(outSrc, 'home'))) {
  console.error(`[build:ui] Expected static export at ${outSrc}`);
  process.exit(1);
}

fs.rmSync(outDest, { recursive: true, force: true });
copyDir(outSrc, outDest);
console.log(`[build:ui] Desktop UI ready at ${outDest} (served as app:// — no port)`);
