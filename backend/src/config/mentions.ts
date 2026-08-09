/**
 * Mentions are stored inline in `Message.content` as `@[Display Name](userId)`.
 *
 * Keeping the markup in the message body (rather than a side table) means an
 * edit that removes the text also removes the mention, with no second source of
 * truth to drift. Clients render it; this module is the server-side reader.
 *
 * Mirrored by `frontend/src/lib/mentions.ts` - keep the pattern in sync.
 */

/** `@[Name](uuid)` — the id is matched strictly so prose cannot fake one. */
const MENTION_PATTERN =
  /@\[([^\]\n]{1,80})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

/** Sanity ceiling so one message cannot notify an unbounded number of people. */
export const MAX_MENTIONS_PER_MESSAGE = 50;

/**
 * Returns the distinct user ids mentioned in `content`.
 *
 * The caller must still confirm each id is a participant of the conversation -
 * anyone can type raw markup naming a user who cannot see the channel.
 */
export function extractMentionedUserIds(content?: string | null): string[] {
  if (!content) return [];

  const ids = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    ids.add(match[2]);
    if (ids.size >= MAX_MENTIONS_PER_MESSAGE) break;
  }
  return [...ids];
}
