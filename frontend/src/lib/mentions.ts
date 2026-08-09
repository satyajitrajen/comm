/**
 * Mentions are stored inline in the message body as `@[Display Name](userId)`.
 * Mirrors `backend/src/config/mentions.ts` — keep the pattern in sync.
 */

const MENTION_PATTERN =
  /@\[([^\]\n]{1,80})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; userId: string; displayName: string };

/**
 * Splits content into plain text and mention segments for rendering.
 * Returns a single text segment when there is nothing to highlight.
 */
export function parseMentions(content: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  // matchAll needs a fresh lastIndex because the regex is module-level /g.
  MENTION_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, start) });
    }
    segments.push({ type: 'mention', displayName: match[1], userId: match[2] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}

/** True when `userId` is named in the content. */
export function mentions(content: string, userId: string): boolean {
  MENTION_PATTERN.lastIndex = 0;
  return [...content.matchAll(MENTION_PATTERN)].some((m) => m[2] === userId);
}

/** Strips markup back to `@Name`, for previews and list subtitles. */
export function toPlainText(content: string): string {
  MENTION_PATTERN.lastIndex = 0;
  return content.replace(MENTION_PATTERN, (_full, name: string) => `@${name}`);
}

export type MentionQuery = {
  /** Text typed after the `@`, lowercased. */
  query: string;
  /** Index of the `@` that opened the token. */
  start: number;
};

/**
 * Finds an in-progress `@mention` immediately before the caret.
 *
 * Returns null unless the `@` starts a word (so an email address does not open
 * the picker) and the token has no whitespace, which would mean the user moved
 * on without selecting anyone.
 */
export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const upToCaret = value.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return null;

  const charBefore = at > 0 ? upToCaret[at - 1] : '';
  if (charBefore && !/\s/.test(charBefore)) return null;

  const token = upToCaret.slice(at + 1);
  if (/[\s\]]/.test(token) || token.length > 40) return null;

  return { query: token.toLowerCase(), start: at };
}

/** Replaces the in-progress token with finished mention markup. */
export function applyMention(
  value: string,
  caret: number,
  mention: MentionQuery,
  person: { userId: string; displayName: string },
): { value: string; caret: number } {
  const markup = `@[${person.displayName}](${person.userId}) `;
  const next = value.slice(0, mention.start) + markup + value.slice(caret);
  return { value: next, caret: mention.start + markup.length };
}
