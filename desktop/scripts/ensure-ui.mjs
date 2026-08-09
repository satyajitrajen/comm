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
