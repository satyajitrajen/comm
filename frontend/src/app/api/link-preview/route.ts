import { NextResponse } from 'next/server';
import { isIP } from 'net';
import { promises as dnsPromises } from 'dns';

const MAX_HTML_CHARS = 400_000;

const NUMERIC_IPV4_PART = /^(?:0[xX][0-9a-fA-F]+|0[0-7]+|\d+)$/;

function uint32ToDottedQuad(value: number): string {
  return `${(value >>> 24) & 255}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`;
}

/**
 * If the hostname is a numeric IPv4 encoding (decimal integer like
 * `2852039166`, hex like `0x7f000001`, octal, or inet_aton-style shorthand
 * like `127.1`), returns its dotted-quad form; otherwise null.
 */
function normalizeIPv4Host(hostname: string): string | null {
  const parts = hostname.split('.');
  if (parts.length > 4 || !parts.every((part) => NUMERIC_IPV4_PART.test(part))) {
    return null;
  }

  const parsePart = (part: string): number => {
    if (/^0[xX]/.test(part)) return parseInt(part, 16);
    if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
    return parseInt(part, 10);
  };

  if (parts.length === 1) {
    const value = parsePart(parts[0]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) return null;
    return uint32ToDottedQuad(value);
  }

  const nums = parts.map(parsePart);
  if (nums.some((n) => !Number.isSafeInteger(n) || n < 0)) return null;

  if (parts.length === 4) {
    if (nums.some((n) => n > 255)) return null;
    return uint32ToDottedQuad(((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0);
  }

  // inet_aton shorthand: a.b and a.b.c, where the last field spans the rest.
  const head = nums.slice(0, -1);
  if (head.some((n) => n > 255)) return null;
  const last = nums[nums.length - 1];
  if (last > 256 ** (4 - head.length) - 1) return null;
  let shifted = 0;
  for (const n of head) shifted = (shifted << 8) | n;
  return uint32ToDottedQuad(((shifted << (8 * (4 - head.length))) | last) >>> 0);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedIPv6(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped forms (::ffff:127.0.0.1) resolve as IPv4 literals.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  // fe80::/10 link-local
  if (/^fe[89ab]/.test(lower)) return true;
  // fc00::/7 unique-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // ff00::/8 multicast
  if (lower.startsWith('ff')) return true;
  return false;
}

function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isBlockedIPv6(ip);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0') return true;

  // Non-literal hostnames are checked after DNS resolution below.
  const normalizedIpv4 = normalizeIPv4Host(h);
  if (normalizedIpv4 && isBlockedIp(normalizedIpv4)) return true;

  const blocked = new Set(['metadata.google.internal', 'metadata.goog', 'metadata']);
  if (blocked.has(h)) return true;

  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http and https URLs are allowed' }, { status: 400 });
  }

  if (isBlockedHostname(parsed.hostname)) {
    return NextResponse.json({ error: 'URL host is not allowed' }, { status: 400 });
  }

  // Resolve every address the host maps to; deny if any of them is private.
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsPromises.lookup(parsed.hostname, { all: true });
  } catch {
    return NextResponse.json({ error: 'URL host could not be resolved' }, { status: 400 });
  }

  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    return NextResponse.json({ error: 'URL host is not allowed' }, { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch url' }, { status: 400 });
    }

    const html = (await res.text()).slice(0, MAX_HTML_CHARS);

    const getMetaTag = (name: string, property: string) => {
      let match = html.match(
        new RegExp(
          `<meta(?:\\s+[^>]*?)?(?:property|name)=["'](?:${name}|${property})["']\\s+content=["']([^"']+)["']`,
          'i',
        ),
      );
      if (!match) {
        match = html.match(
          new RegExp(
            `<meta(?:\\s+[^>]*?)?content=["']([^"']+)["']\\s+(?:property|name)=["'](?:${name}|${property})["']`,
            'i',
          ),
        );
      }
      return match ? match[1] : null;
    };

    let title = getMetaTag('og:title', 'twitter:title');
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : '';
    } else {
      title = title.trim();
    }

    let description =
      getMetaTag('og:description', 'twitter:description') || getMetaTag('description', 'description') || '';
    description = description.trim();

    let image = getMetaTag('og:image', 'twitter:image') || '';

    if (image && image.startsWith('/')) {
      const baseUrl = parsed.origin;
      image = `${baseUrl}${image}`;
    }

    return NextResponse.json({
      title: title || parsed.hostname,
      description,
      image,
      url: parsed.toString(),
    });
  } catch (error) {
    console.error('Link preview error:', error);
    return NextResponse.json({ error: 'Failed to process url' }, { status: 500 });
  }
}
