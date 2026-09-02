/**
 * Name field validation and sanitization.
 * Disallows symbols and special characters (@, #, $, %, ^, &, *, +, =, _, <, >, /, \, |, ~, `, !, ?, ;, :, ", {, }, [, ], etc.)
 * Allows letters (Unicode support), numbers, spaces, dots, hyphens, and apostrophes.
 */
export const NAME_ALLOWED_CHARS_REGEX = /^[\p{L}\p{N}\s.'-]+$/u;
export const NAME_DISALLOWED_SYMBOLS_REGEX = /[^\p{L}\p{N}\s.'-]/u;

export function sanitizeName(val: string): string {
  return val.replace(/[^\p{L}\p{N}\s.'-]/gu, '');
}

export function isValidName(val: string): boolean {
  const trimmed = val?.trim();
  if (!trimmed) return false;
  return NAME_ALLOWED_CHARS_REGEX.test(trimmed);
}
