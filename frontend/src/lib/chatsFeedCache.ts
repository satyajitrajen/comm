import { chatsAPI } from '../services/api';

export type ChatFeedItem = {
  conversationId: string;
  id?: string;
  type?: string;
  name?: string;
  group?: {
    name?: string | null;
    spaceType?: string | null;
    teamName?: string | null;
  } | null;
  [key: string]: unknown;
};

const TTL_MS = 8_000;

let cachedFeed: ChatFeedItem[] | null = null;
let cachedAt = 0;
let inFlight: Promise<ChatFeedItem[]> | null = null;

export function invalidateChatsFeed() {
  cachedFeed = null;
  cachedAt = 0;
  inFlight = null;
}

export async function getChatsFeedCached(force = false): Promise<ChatFeedItem[]> {
  const now = Date.now();
  if (!force && cachedFeed && now - cachedAt < TTL_MS) {
    return cachedFeed;
  }

  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = chatsAPI
    .getFeed()
    .then((feed) => {
      const list = Array.isArray(feed) ? (feed as ChatFeedItem[]) : [];
      cachedFeed = list;
      cachedAt = Date.now();
      return list;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
