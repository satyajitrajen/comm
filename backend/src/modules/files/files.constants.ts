export const FILE_UPLOAD_MAX_BYTES =
  Number(process.env.FILE_UPLOAD_MAX_BYTES) || 10 * 1024 * 1024;

export const FILE_UPLOAD_MAX_LABEL = `${Math.round(FILE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB`;

/**
 * Mime types safe to render inline in the browser. Uploads keep the
 * client-supplied mimetype, so anything not on this list (text/html,
 * image/svg+xml, application/xhtml+xml, ...) must be served as
 * application/octet-stream with Content-Disposition: attachment.
 */
export const INLINE_SAFE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'video/mp4',
  'audio/mpeg',
  'application/pdf',
]);

const ALLOWED_UPLOAD_MIME_RULES: (string | RegExp)[] = [
  /^image\//,
  /^video\//,
  /^audio\//,
  'text/plain',
  'application/pdf',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  /^application\/vnd\.openxmlformats-officedocument\./,
  /^application\/vnd\.oasis\.opendocument\./,
];

/**
 * Upload allowlist. Active-content vectors (svg/html/xhtml) are rejected
 * even though they sit under the image//text/ prefixes.
 */
export function isAllowedUploadMime(mimetype: string): boolean {
  const mt = (mimetype || '').toLowerCase().split(';')[0].trim();
  if (!mt) return false;
  if (
    mt === 'image/svg+xml' ||
    mt === 'text/html' ||
    mt === 'application/xhtml+xml'
  ) {
    return false;
  }
  return ALLOWED_UPLOAD_MIME_RULES.some((rule) =>
    typeof rule === 'string' ? rule === mt : rule.test(mt),
  );
}
