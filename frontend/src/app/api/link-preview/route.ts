import { NextResponse } from 'next/server';
import { isIP } from 'net';

const MAX_HTML_CHARS = 400_000;

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0') return true;

  const fam = isIP(h);
  if (fam === 4) {
    const parts = h.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (fam === 6) {
    const lower = h.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('ff')) return true;
    return false;
  }

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
