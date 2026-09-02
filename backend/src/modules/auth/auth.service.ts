import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { PermissionsService } from '../../common/permissions.service';
import { MailService } from '../../common/mail.service';
import {
  isCorsOriginAllowed,
  parseCorsOrigins,
} from '../../config/cors-origins';

/** Short enough to limit exposure if the mailbox is later compromised. */
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** In-memory cap on wrong OTP guesses per challenge (brute-force guard). */
const MAX_OTP_ATTEMPTS = 5;

/** Constant bcrypt hash so failed logins for unknown users still do the work. */
const DUMMY_PASSWORD_HASH =
  '$2b$10$JbEh6xMJ2xeIX0CfzugGlOgcZbvR3xr2x/xYP8E/EeT5CCKSVSLHu';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Failed OTP verification counts, keyed by verifyKey. */
  private readonly otpAttemptCounts = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private permissionsService: PermissionsService,
    private mailService: MailService,
  ) {}

  private accessTokenExpiresIn(): string {
    return process.env.ACCESS_TOKEN_EXPIRES_IN?.trim() || '30m';
  }

  async register(body: {
    email?: string;
    phoneNumber?: string;
    displayName: string;
    password?: string;
  }) {
    if (!body.email && !body.phoneNumber) {
      throw new BadRequestException('Provide email or phone number');
    }
    if (!body.password?.trim()) {
      throw new BadRequestException('Password is required');
    }

    if (body.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existing) throw new BadRequestException('Email already registered');
    }
    if (body.phoneNumber) {
      const existing = await this.prisma.user.findUnique({
        where: { phoneNumber: body.phoneNumber },
      });
      if (existing)
        throw new BadRequestException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    return await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email || null,
          phoneNumber: body.phoneNumber || null,
          passwordHash,
        },
      });

      await tx.userProfile.create({
        data: {
          userId: user.id,
          displayName: body.displayName,
        },
      });

      let workspace = await tx.workspace.findFirst();
      if (!workspace) {
        workspace = await tx.workspace.create({
          data: {
            name: 'Demo Workspace',
            subdomain: 'demo',
          },
        });
      }

      const count = await tx.workspaceUser.count({
        where: { workspaceId: workspace.id },
      });

      // Block open self-registration once the workspace has any members.
      // Set ALLOW_SELF_REGISTRATION=true only for isolated dev/demo environments.
      if (count > 0 && process.env.ALLOW_SELF_REGISTRATION !== 'true') {
        throw new ForbiddenException(
          'Self-registration is disabled. Contact your administrator to be invited.',
        );
      }

      await tx.workspaceUser.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: count === 0 ? 'OWNER' : 'MEMBER',
        },
      });

      return {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: body.displayName,
        workspaceId: workspace.id,
      };
    });
  }

  async login(body: {
    email?: string;
    phoneNumber?: string;
    password?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    let user;
    if (body.email) {
      user = await this.prisma.user.findUnique({
        where: { email: body.email },
        include: { profile: true },
      });
    } else if (body.phoneNumber) {
      user = await this.prisma.user.findUnique({
        where: { phoneNumber: body.phoneNumber },
        include: { profile: true },
      });
    }

    if (!user) {
      await bcrypt.compare(body.password ?? '', DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!body.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(
      body.password,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isTwoFactorEnabled) {
      const verifyKey = user.email ?? user.phoneNumber;
      if (!verifyKey) {
        throw new BadRequestException(
          'Two-factor authentication is on for this account, but it has no email or phone on file. Ask an administrator to update the account.',
        );
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await this.stageOtpChallenge(verifyKey, otp, 10 * 60 * 1000);

      // Actually deliver the code. Until this existed, 2FA could only be
      // completed by reading it out of the server log.
      let delivered = false;
      if (user.email) {
        delivered = await this.mailService.sendTwoFactorCode(user.email, otp);
      }

      // Falling back to the log keeps accounts recoverable when SMTP is not
      // configured (or the destination is a phone, which has no transport yet).
      const logOtp =
        !delivered &&
        (process.env.NODE_ENV !== 'production' ||
          process.env.TWO_FACTOR_LOG_OTP === 'true');
      if (logOtp) {
        this.logger.warn(`[2FA] OTP for ${verifyKey}: ${otp}`);
      } else if (!delivered) {
        this.logger.log(
          `[2FA] One-time code issued for ${verifyKey} but could not be delivered (configure SMTP_HOST, or set TWO_FACTOR_LOG_OTP=true for emergency logging)`,
        );
      }

      return {
        needsTwoFactor: true as const,
        verifyKey,
        maskedDestination: user.email
          ? this.maskEmail(user.email)
          : this.maskPhone(user.phoneNumber!),
      };
    }

    return await this.createAuthSession(
      user,
      body.ipAddress || '127.0.0.1',
      body.userAgent || 'Unknown',
    );
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return `***${digits.slice(-2)}`;
  }

  async verifyOtp(body: {
    verifyKey: string;
    otpCode: string;
    ipAddress: string;
    userAgent: string;
  }) {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { verifyKey: body.verifyKey },
    });

    if (!challenge || challenge.expiresAt < new Date()) {
      this.otpAttemptCounts.delete(body.verifyKey);
      throw new UnauthorizedException('OTP has expired or is invalid');
    }

    const failedAttempts = this.otpAttemptCounts.get(body.verifyKey) ?? 0;
    if (failedAttempts >= MAX_OTP_ATTEMPTS) {
      await this.prisma.otpChallenge
        .delete({ where: { verifyKey: body.verifyKey } })
        .catch(() => null);
      this.otpAttemptCounts.delete(body.verifyKey);
      throw new UnauthorizedException('OTP has expired or is invalid');
    }

    const otpOk = await bcrypt.compare(body.otpCode, challenge.otpHash);
    if (!otpOk) {
      this.otpAttemptCounts.set(body.verifyKey, failedAttempts + 1);
      throw new UnauthorizedException('OTP is incorrect');
    }

    this.otpAttemptCounts.delete(body.verifyKey);

    await this.prisma.otpChallenge.delete({
      where: { verifyKey: body.verifyKey },
    });

    let user;
    if (body.verifyKey.includes('@')) {
      user = await this.prisma.user.findUnique({
        where: { email: body.verifyKey },
        include: { profile: true },
      });
    } else {
      user = await this.prisma.user.findUnique({
        where: { phoneNumber: body.verifyKey },
        include: { profile: true },
      });
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return await this.createAuthSession(user, body.ipAddress, body.userAgent);
  }

  /**
   * Store a time-limited OTP for the given email or phone verifyKey.
   * Used by future SMS/email flows or tests; verify via POST /verify-2fa.
   */
  async stageOtpChallenge(
    verifyKey: string,
    plainOtp: string,
    ttlMs = 600_000,
  ) {
    const otpHash = await bcrypt.hash(plainOtp, 8);
    const expiresAt = new Date(Date.now() + ttlMs);
    this.otpAttemptCounts.delete(verifyKey);
    await this.prisma.otpChallenge.upsert({
      where: { verifyKey },
      create: { verifyKey, otpHash, expiresAt },
      update: { otpHash, expiresAt },
    });
  }

  /**
   * Only trust a client-supplied Origin when it is on the configured CORS
   * allow-list; otherwise fall back to the server-configured origin so the
   * reset link can never be poisoned to an attacker-controlled host.
   */
  private resolveResetLinkOrigin(origin?: string): string {
    const configured = parseCorsOrigins();
    if (origin && configured.includes(origin)) {
      return origin.replace(/\/$/, '');
    }
    const fallback = configured[0] || process.env.APP_ORIGIN || '';
    if (fallback) {
      return fallback.replace(/\/$/, '');
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      origin &&
      isCorsOriginAllowed(origin)
    ) {
      return origin.replace(/\/$/, '');
    }
    return '';
  }

  /**
   * Starts a password reset.
   *
   * Always resolves the same way whether or not the address exists — a
   * different response, or a different response *time*, would turn this into
   * an account-enumeration oracle.
   */
  async requestPasswordReset(email: string, origin?: string) {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) return { ok: true as const };

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });

    if (user) {
      // Invalidate anything still outstanding so only the newest link works.
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: await bcrypt.hash(token, 10),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      const base = this.resolveResetLinkOrigin(origin);
      await this.mailService.sendPasswordReset(
        normalized,
        `${base}/reset-password?token=${token}`,
      );
    }

    return { ok: true as const };
  }

  /**
   * Completes a reset. Every existing session is revoked: if the reset was
   * triggered because the account was compromised, leaving the attacker's
   * refresh token alive would defeat the point.
   */
  async resetPassword(token: string, newPassword: string) {
    if (!token?.trim()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // The token is random, so it must be located by comparing against the
    // live candidates rather than by a direct hash lookup.
    const candidates = await this.prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let matched: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await bcrypt.compare(token, candidate.tokenHash)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: matched.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: matched.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.loginSession.updateMany({
        where: { userId: matched.userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    this.logger.log(
      `[AUTH] Password reset completed for user ${matched.userId}`,
    );
    return { ok: true as const };
  }

  async refreshTokens(sessionId: string, refreshToken: string) {
    const session = await this.prisma.loginSession.findFirst({
      where: { id: sessionId, isRevoked: false },
      include: { user: { include: { profile: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const tokenOk = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    );
    if (!tokenOk) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = session.user;
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      {
        expiresIn: this.accessTokenExpiresIn() as JwtSignOptions['expiresIn'],
      },
    );

    const newRefresh = randomUUID();
    const newRefreshHash = await bcrypt.hash(newRefresh, 8);

    await this.prisma.loginSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: newRefreshHash,
        lastActiveAt: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken: newRefresh,
      sessionId: session.id,
    };
  }

  private async createAuthSession(
    user: {
      id: string;
      email: string | null;
      phoneNumber: string | null;
      profile?: {
        displayName: string;
        avatarUrl: string | null;
      } | null;
    },
    ipAddress: string,
    userAgent: string,
  ) {
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      {
        expiresIn: this.accessTokenExpiresIn() as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = randomUUID();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    const session = await this.prisma.loginSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress,
        userAgent,
      },
    });

    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId: user.id, isActive: true },
      include: { workspace: true },
      orderBy: { joinedAt: 'asc' },
    });

    let effective = {
      allowedNavKeys: [] as string[],
      capabilities: {
        postAnnouncements: false,
        manageUsers: false,
        importUsers: false,
        manageRoles: false,
        manageSettings: false,
      },
      canPostAnnouncements: false,
      isAdmin: false,
    };

    if (workspaceUser) {
      effective = await this.permissionsService.resolveForWorkspaceUser(
        workspaceUser.workspaceId,
        workspaceUser,
      );
    }

    let announcementPublisherConversationIds: string[] = [];
    if (workspaceUser) {
      const pubs = await this.prisma.announcementPublisher.findMany({
        where: {
          userId: user.id,
          workspaceId: workspaceUser.workspaceId,
        },
        select: { conversationId: true },
      });
      announcementPublisherConversationIds = pubs.map((p) => p.conversationId);
    }

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: user.profile?.displayName || 'User',
        avatarUrl: user.profile?.avatarUrl,
        workspaceId: workspaceUser?.workspaceId || null,
        workspaceName: workspaceUser?.workspace.name || null,
        workspaceRole: workspaceUser?.role || null,
        department: workspaceUser?.department || null,
        canPostAnnouncements: effective.canPostAnnouncements,
        allowedNavKeys: effective.allowedNavKeys,
        capabilities: effective.capabilities,
        announcementPublisherConversationIds,
        isAdmin: effective.isAdmin,
      },
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId: user.id, isActive: true },
      include: { workspace: true },
      orderBy: { joinedAt: 'asc' },
    });

    let effective = {
      allowedNavKeys: [] as string[],
      capabilities: {
        postAnnouncements: false,
        manageUsers: false,
        importUsers: false,
        manageRoles: false,
        manageSettings: false,
      },
      canPostAnnouncements: false,
      isAdmin: false,
    };

    if (workspaceUser) {
      effective = await this.permissionsService.resolveForWorkspaceUser(
        workspaceUser.workspaceId,
        workspaceUser,
      );
    }

    let announcementPublisherConversationIds: string[] = [];
    if (workspaceUser) {
      const pubs = await this.prisma.announcementPublisher.findMany({
        where: {
          userId: user.id,
          workspaceId: workspaceUser.workspaceId,
        },
        select: { conversationId: true },
      });
      announcementPublisherConversationIds = pubs.map((p) => p.conversationId);
    }

    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.profile?.displayName || 'User',
      avatarUrl: user.profile?.avatarUrl,
      workspaceId: workspaceUser?.workspaceId || null,
      workspaceName: workspaceUser?.workspace.name || null,
      workspaceRole: workspaceUser?.role || null,
      department: workspaceUser?.department || null,
      canPostAnnouncements: effective.canPostAnnouncements,
      allowedNavKeys: effective.allowedNavKeys,
      capabilities: effective.capabilities,
      announcementPublisherConversationIds,
      isAdmin: effective.isAdmin,
    };
  }

  async logout(sessionId: string, refreshToken: string) {
    const session = await this.prisma.loginSession.findFirst({
      where: { id: sessionId, isRevoked: false },
    });

    if (!session) {
      return { success: true };
    }

    const tokenOk = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    );
    if (!tokenOk) {
      throw new UnauthorizedException('Invalid session credentials');
    }

    await this.prisma.loginSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });

    return { success: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!currentPassword?.trim()) {
      throw new BadRequestException('Current password is required');
    }
    if (!newPassword?.trim() || newPassword.trim().length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new BadRequestException('Current password is incorrect');
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.loginSession.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    return { success: true, requireReLogin: true };
  }
}
