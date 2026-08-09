import { Injectable } from '@nestjs/common';

/**
 * Authoritative registry of who currently has a live socket.
 *
 * Presence is derived state, not durable state: it is exactly "does this user
 * hold an open connection right now". Persisting it to the database was the
 * source of a family of bugs - users stranded "Online" after a server restart,
 * seeded accounts appearing online before they had ever connected, and manual
 * AWAY / DND choices being clobbered on every reconnect. Keeping it in memory
 * means a restart correctly starts everyone at offline with nothing to clean up.
 *
 * What a user *declares* (AWAY / DND / OUT_OF_OFFICE) is a separate, durable
 * concern and lives in `UserProfile.statusAvailability`.
 *
 * NOTE: this is per-process. If the API is ever scaled beyond a single
 * instance, back it with Redis (or the socket.io adapter's room membership)
 * so presence is shared across instances.
 */
@Injectable()
export class PresenceService {
  /** userId -> socket ids (a user may have several tabs / devices). */
  private readonly sockets = new Map<string, Set<string>>();

  /**
   * Records a connection.
   * @returns true when this is the user's first socket (offline -> online).
   */
  connect(userId: string, socketId: string): boolean {
    let bucket = this.sockets.get(userId);
    if (!bucket) {
      bucket = new Set();
      this.sockets.set(userId, bucket);
    }
    const wasOffline = bucket.size === 0;
    bucket.add(socketId);
    return wasOffline;
  }

  /**
   * Records a disconnection.
   * @returns true when the user's last socket closed (online -> offline).
   */
  disconnect(userId: string, socketId: string): boolean {
    const bucket = this.sockets.get(userId);
    if (!bucket) return false;

    bucket.delete(socketId);
    if (bucket.size > 0) return false;

    this.sockets.delete(userId);
    return true;
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  /** Subset of the given ids that are currently online. */
  filterOnline(userIds: string[]): Set<string> {
    return new Set(userIds.filter((id) => this.isOnline(id)));
  }

  onlineUserIds(): string[] {
    return [...this.sockets.keys()];
  }
}
