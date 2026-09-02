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
