/**
 * Recursively convert BigInt values to strings for JSON serialization
 * without mutating global prototypes.
 */
export function serializeBigInts<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString() as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value;
  }
  if (Array.isArray(value)) {
    const arr: unknown[] = value as unknown[];
    return arr.map((item) => serializeBigInts(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInts(v);
    }
    return out as T;
  }
  return value;
}
