import { app, net, protocol, type Session } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Serves the static Next.js export (resources/ui) over app://teamtime/.
 *
 * A custom privileged scheme rather than file:// so the UI gets a real,
 * stable origin: absolute asset paths (/_next/...) resolve, fetch/CORS work,
 * and the backend can allow-list exactly `app://teamtime`.
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'teamtime';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Must run before app `ready`. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/** Packaged: <resources>/ui. Dev: desktop/resources/ui, then frontend/out. */
export function resolveUiRoot(): string | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'ui')]
    : [
        path.join(__dirname, '../../resources/ui'),
        path.join(__dirname, '../../../frontend/out'),
      ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Maps a request path onto the export. The export uses trailingSlash, so
 * `/teams/` lives at `teams/index.html`; bare `/teams` is tolerated too.
 */
function resolveFile(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = path.normalize(path.join(root, decoded));

  // Never serve outside the UI root (e.g. /../../secrets).
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  if (isFile(target)) return target;
  const asIndex = path.join(target, 'index.html');
  if (isFile(asIndex)) return asIndex;
  if (isFile(`${target}.html`)) return `${target}.html`;
  return null;
}

async function notFound(root: string): Promise<Response> {
  const page = path.join(root, '404.html');
  if (!isFile(page)) return new Response('Not found', { status: 404 });
  const body = await fs.promises.readFile(page);
  return new Response(body, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * Must be registered on the session the window actually uses. The window runs
 * in the `persist:comm-desktop` partition, and `protocol.handle` on the global
 * `protocol` only covers the default session — every app:// load would abort.
 */
export function handleAppScheme(root: string, ses: Session) {
  ses.protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) {
      return new Response('Not found', { status: 404 });
    }
    const file = resolveFile(root, url.pathname);
    if (!file) return notFound(root);
    return net.fetch(pathToFileURL(file).toString());
  });
}
