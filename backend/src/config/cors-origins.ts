/**
 * Shared CORS rules for HTTP (Express) and Socket.IO.
 * In production, CORS_ORIGIN must be a comma-separated list of allowed browser origins.
 */
export function assertProductionCorsConfigured(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const list = parseCorsOrigins();
  if (list.length === 0) {
    throw new Error(
      'CORS_ORIGIN must be set to a comma-separated list of allowed origins when NODE_ENV=production',
    );
  }
}

export function parseCorsOrigins(): string[] {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Returns true if the browser origin is allowed to access the API / WS. */
export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  const allowed = parseCorsOrigins();
  if (allowed.length === 0) return true;
  if (allowed.includes(origin)) return true;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}
