/**
 * Ensure static UI exists before starting Electron.
 * Rebuilds only when resources/ui (or frontend/out) is missing.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');
const bundled = path.join(desktopRoot, 'resources', 'ui');
const exported = path.join(desktopRoot, '../frontend/out');

function hasUi(dir) {
  return (
    fs.existsSync(path.join(dir, 'index.html')) ||
    fs.existsSync(path.join(dir, 'home', 'index.html')) ||
    fs.existsSync(path.join(dir, 'home.html'))
  );
}

/** DESKTOP_FRONTEND_URL from the environment or desktop/.env. */
function frontendOverride() {
  if (process.env.DESKTOP_FRONTEND_URL?.trim()) return process.env.DESKTOP_FRONTEND_URL.trim();
  const envFile = path.join(desktopRoot, '.env');
  if (!fs.existsSync(envFile)) return '';
  const line = fs
    .readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('DESKTOP_FRONTEND_URL='));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
}

const override = frontendOverride();
if (override) {
  console.log(`[desktop] DESKTOP_FRONTEND_URL=${override} — using the running frontend, no bundle needed`);
  process.exit(0);
}

if (hasUi(bundled) || hasUi(exported)) {
  console.log('[desktop] Static UI found — starting Electron (app://, no port)');
  process.exit(0);
}

console.log('[desktop] No UI bundle yet — building static export…');
const result = spawnSync(process.execPath, [path.join(__dirname, 'build-ui.mjs')], {
  cwd: desktopRoot,
  stdio: 'inherit',
});
process.exit(result.status || 0);
