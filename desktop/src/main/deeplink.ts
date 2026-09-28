/**
 * teamtime:// deep links.
 *
 *   teamtime://conversation/<uuid>  -> /teams?conversation=<uuid>
 *   teamtime://dm/<uuid>            -> /dms?conversation=<uuid>
 *   teamtime://open                 -> just focus the app
 *
 * Anything else is ignored. Ids are matched strictly so a crafted link cannot
 * smuggle extra query parameters or a path into the router.
 */
export const DEEP_LINK_SCHEME = 'teamtime';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deepLinkToPath(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;

  // For custom schemes the first segment lands in `host`.
  const segments = [url.host, ...url.pathname.split('/')].filter(Boolean);
  const [kind, id] = segments;

  if (kind === 'open' && segments.length === 1) return '/home/';
  if (segments.length !== 2 || !UUID.test(id)) return null;
  if (kind === 'conversation') return `/teams/?conversation=${id}`;
  if (kind === 'dm') return `/dms/?conversation=${id}`;
  return null;
}

/** On Windows/Linux the link arrives as a command-line argument. */
export function findDeepLinkInArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`)) ?? null;
}
