import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as webpush from 'web-push';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma.service';
import { isWebPushToken, resolveStoredPushToken } from './push-token.util';

/**
 * VAPID JSON subscriptions use web-push. Opaque FCM strings (Android, iOS, or
 * Firebase JS on web) use Admin SDK. Branch on token shape, not deviceType.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidEnabled = false;
  private fcm: admin.messaging.Messaging | null = null;

  constructor(private prisma: PrismaService) {
    this.initVapid();
    this.initFcm();
  }

  private initVapid() {
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
    this.vapidEnabled = true;
    this.logger.log('[PUSH] VAPID configured');
  }

  private initFcm() {
    try {
      if (!admin.apps.length) {
        const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const credPath =
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
          process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (json) {
          admin.initializeApp({
            credential: admin.credential.cert(
              JSON.parse(json) as admin.ServiceAccount,
            ),
          });
        } else if (credPath) {
          const resolved = path.isAbsolute(credPath)
            ? credPath
            : path.resolve(process.cwd(), credPath);
          if (!fs.existsSync(resolved)) {
            throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH not found: ${resolved}`);
          }
          admin.initializeApp({
            credential: admin.credential.cert(resolved),
          });
        } else {
          this.logger.warn(
            '[PUSH] FCM not configured (set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON)',
          );
          return;
        }
      }
      this.fcm = admin.messaging();
      this.logger.log('[PUSH] FCM configured');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`[PUSH] FCM init failed: ${reason}`);
      this.fcm = null;
    }
  }

  get publicKey(): string | null {
    return this.vapidEnabled ? process.env.VAPID_PUBLIC_KEY! : null;
  }

  async subscribe(
    userId: string,
    body: { subscription?: unknown; token?: string; deviceType?: string },
  ) {
    let resolved: { pushToken: string; deviceType: string };
    try {
      resolved = resolveStoredPushToken(body);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid push payload',
      );
    }
    await this.prisma.device.upsert({
      where: { pushToken: resolved.pushToken },
      create: {
        userId,
        pushToken: resolved.pushToken,
        deviceType: resolved.deviceType,
      },
      update: { userId, deviceType: resolved.deviceType },
    });
    return { ok: true as const };
  }

  async unsubscribe(
    userId: string,
    body: { subscription?: unknown; token?: string; deviceType?: string },
  ) {
    try {
      const resolved = resolveStoredPushToken(body);
      await this.prisma.device.deleteMany({
        where: { userId, pushToken: resolved.pushToken },
      });
    } catch {
      if (typeof body.token === 'string' && body.token.trim()) {
        await this.prisma.device.deleteMany({
          where: { userId, pushToken: body.token.trim() },
        });
      } else if (body.subscription !== undefined) {
        await this.prisma.device.deleteMany({
          where: { userId, pushToken: JSON.stringify(body.subscription) },
        });
      }
    }
    return { ok: true as const };
  }

  async sendToUsers(
    userIds: string[],
    payload: { title: string; body: string; url?: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    if (!this.vapidEnabled && !this.fcm) return;

    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, pushToken: true, deviceType: true },
    });
    if (devices.length === 0) return;

    const vapidBody = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      devices.map(async (device) => {
        const useWebPush = isWebPushToken(device.pushToken);
        try {
          if (useWebPush) {
            if (!this.vapidEnabled) return;
            await webpush.sendNotification(
              JSON.parse(device.pushToken) as webpush.PushSubscription,
              vapidBody,
            );
            return;
          }
          if (!this.fcm) return;
          const url = payload.url || '/home';
          const isNative = device.deviceType === 'ANDROID' || device.deviceType === 'IOS';
          await this.fcm.send({
            token: device.pushToken,
            data: { title: payload.title, body: payload.body, url },
            ...(isNative
              ? {
                  notification: { title: payload.title, body: payload.body },
                  android: { priority: 'high' as const },
                }
              : {
                  webpush: {
                    fcmOptions: { link: url },
                    notification: {
                      title: payload.title,
                      body: payload.body,
                      icon: '/teamtime-favicon.png',
                    },
                  },
                }),
          });
        } catch (error) {
          const status = (error as { statusCode?: number })?.statusCode;
          const code = (error as { code?: string })?.code;
          if (
            status === 404 ||
            status === 410 ||
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
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
