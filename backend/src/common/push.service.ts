import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma.service';

/**
 * Browser push via VAPID. Self-hosted keys, no third-party account.
 *
 * Generate a key pair once with `npx web-push generate-vapid-keys` and set:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or https: URL)
 *
 * Without those the service is inert, exactly like MailService without SMTP.
 * Subscriptions live in the existing `Device` model, which had a `pushToken`
 * column and no code behind it.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(private prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      this.logger.warn(
        '[PUSH] VAPID keys are not set - browser push is disabled',
      );
      return;
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@teamtime.live',
      publicKey,
      privateKey,
    );
    this.enabled = true;
    this.logger.log('[PUSH] VAPID configured');
  }

  get publicKey(): string | null {
    return this.enabled ? process.env.VAPID_PUBLIC_KEY! : null;
  }

  /** Stores (or refreshes) a browser subscription for this user. */
  async subscribe(userId: string, subscription: unknown, deviceType = 'WEB') {
    const token = JSON.stringify(subscription);
    await this.prisma.device.upsert({
      where: { pushToken: token },
      create: { userId, pushToken: token, deviceType },
      update: { userId, deviceType },
    });
    return { ok: true as const };
  }

  async unsubscribe(userId: string, subscription: unknown) {
    await this.prisma.device.deleteMany({
      where: { userId, pushToken: JSON.stringify(subscription) },
    });
    return { ok: true as const };
  }

  /**
   * Fans a notification out to every device registered for these users.
   *
   * 404/410 means the browser dropped the subscription, so the row is pruned -
   * otherwise dead endpoints accumulate forever and every send gets slower.
   */
  async sendToUsers(
    userIds: string[],
    payload: { title: string; body: string; url?: string },
  ): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;

    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, pushToken: true },
    });
    if (devices.length === 0) return;

    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      devices.map(async (device) => {
        try {
          await webpush.sendNotification(
            JSON.parse(device.pushToken) as webpush.PushSubscription,
            body,
          );
        } catch (error) {
          const status = (error as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            dead.push(device.id);
          } else {
            const reason = error instanceof Error ? error.message : 'unknown';
            this.logger.warn(`[PUSH] Send failed: ${reason}`);
          }
        }
      }),
    );

    if (dead.length > 0) {
      await this.prisma.device.deleteMany({ where: { id: { in: dead } } });
      this.logger.log(`[PUSH] Pruned ${dead.length} expired subscription(s)`);
    }
  }
}
