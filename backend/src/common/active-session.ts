import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Access tokens carry `sid` (LoginSession id). Logout sets isRevoked=true;
 * every HTTP/WS auth path must reject revoked sessions so tokens die on
 * logout instead of waiting for JWT clock expiry.
 *
 * Tokens WITHOUT `sid` are rejected: all current issue paths attach the
 * session id, so a missing `sid` means a forged or pre-revocation token.
 */
export async function assertActiveLoginSession(
  prisma: PrismaService,
  sessionId: string | undefined,
  userId: string | undefined,
): Promise<void> {
  if (!sessionId || !userId) {
    throw new UnauthorizedException('Session expired. Please sign in again.');
  }

  const session = await prisma.loginSession.findFirst({
    where: { id: sessionId, userId, isRevoked: false },
    select: { id: true },
  });

  if (!session) {
    throw new UnauthorizedException('Session expired. Please sign in again.');
  }
}

/** Same check for optional auth: revoked/missing session ⇒ treat as anonymous. */
export async function isLoginSessionActive(
  prisma: PrismaService,
  sessionId: string | undefined,
  userId: string | undefined,
): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const session = await prisma.loginSession.findFirst({
    where: { id: sessionId, userId, isRevoked: false },
    select: { id: true },
  });
  return Boolean(session);
}
